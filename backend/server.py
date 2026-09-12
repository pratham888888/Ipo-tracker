import asyncio
import json
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from allotment import compute_allotment
from providers import get_provider

ROOT_DIR = Path(__file__).parent
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("server")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_PROVIDER = os.environ.get("AI_PROVIDER", "openai")
AI_MODEL = os.environ.get("AI_MODEL", "gpt-5.4")
IPO_DATA_PROVIDER = os.environ.get("IPO_DATA_PROVIDER", "downstox")
IPO_API_BASE_URL = os.environ.get("IPO_API_BASE_URL", "https://downstox.com")
IPO_API_KEY = os.environ.get("IPO_API_KEY")

REFRESH_INTERVAL_SECONDS = 300  # 5 min background refresh
CACHE_TTL_SECONDS = 180  # lazy refresh threshold

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
provider = get_provider(IPO_DATA_PROVIDER, IPO_API_BASE_URL, IPO_API_KEY)

_refresh_lock = asyncio.Lock()
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ist_label(dt: Optional[datetime] = None) -> str:
    dt = dt or now_utc()
    ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
    return ist.strftime("%d %b %Y, %I:%M %p IST")


def make_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


# --------------------------------------------------------------------------- #
# Data ingestion + caching
# --------------------------------------------------------------------------- #
async def _record_history(normalized: list[dict]) -> None:
    """Append GMP / subscription snapshots so charts can be built over time."""
    now = now_utc()
    for ipo in normalized:
        slug = ipo["slug"]
        gmp = ipo.get("gmp") or {}
        if gmp.get("gmp_rupees") is not None:
            last = await db.gmp_history.find_one(
                {"slug": slug}, sort=[("ts", -1)], projection={"_id": 0}
            )
            changed = (
                last is None
                or last.get("gmp_rupees") != gmp.get("gmp_rupees")
                or last.get("source_updated_label") != gmp.get("source_updated_label")
            )
            if changed:
                await db.gmp_history.insert_one(
                    {
                        "slug": slug,
                        "gmp_rupees": gmp.get("gmp_rupees"),
                        "gmp_percent": gmp.get("gmp_percent"),
                        "implied_listing_price": gmp.get("implied_listing_price"),
                        "source_updated_label": gmp.get("source_updated_label"),
                        "ts": now,
                    }
                )
        sub = ipo.get("subscription") or {}
        if sub.get("total") is not None:
            last_s = await db.subscription_history.find_one(
                {"slug": slug}, sort=[("ts", -1)], projection={"_id": 0}
            )
            if last_s is None or last_s.get("total") != sub.get("total"):
                await db.subscription_history.insert_one(
                    {
                        "slug": slug,
                        "total": sub.get("total"),
                        "qib": sub.get("qib"),
                        "nii": sub.get("nii"),
                        "retail": sub.get("retail"),
                        "ts": now,
                    }
                )


async def refresh_data(force: bool = False) -> dict:
    """Fetch from provider, upsert IPOs, append history. Falls back to cache."""
    async with _refresh_lock:
        meta = await db.meta.find_one({"_id": "source_status"}) or {}
        last = meta.get("last_success")
        if not force and last:
            age = (now_utc() - last.replace(tzinfo=timezone.utc)
                   if last.tzinfo is None else now_utc() - last).total_seconds()
            if age < CACHE_TTL_SECONDS:
                return {"refreshed": False, "reason": "fresh", "age_seconds": int(age)}

        try:
            normalized = await provider.fetch_normalized()
        except Exception as e:  # noqa: BLE001
            logger.warning("Provider fetch failed: %s", e)
            await db.meta.update_one(
                {"_id": "source_status"},
                {
                    "$set": {
                        "last_error": str(e),
                        "last_error_at": now_utc(),
                        "healthy": False,
                    }
                },
                upsert=True,
            )
            return {"refreshed": False, "error": str(e)}

        now = now_utc()
        for ipo in normalized:
            ipo["updated_at"] = now
            await db.ipos.update_one(
                {"slug": ipo["slug"]}, {"$set": ipo}, upsert=True
            )
        await _record_history(normalized)
        await db.meta.update_one(
            {"_id": "source_status"},
            {
                "$set": {
                    "last_success": now,
                    "healthy": True,
                    "provider": provider.name,
                    "count": len(normalized),
                    "last_error": None,
                }
            },
            upsert=True,
        )
        logger.info("Refreshed %d IPOs from %s", len(normalized), provider.name)
        return {"refreshed": True, "count": len(normalized)}


async def _background_refresh() -> None:
    while True:
        try:
            await refresh_data(force=True)
        except Exception as e:  # noqa: BLE001
            logger.warning("Background refresh error: %s", e)
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)


# --------------------------------------------------------------------------- #
# Lifespan
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.ipos.create_index("slug", unique=True)
        await db.gmp_history.create_index([("slug", 1), ("ts", 1)])
        await db.subscription_history.create_index([("slug", 1), ("ts", 1)])
        await db.screeners.create_index("user_id")
        await db.watchlist.create_index([("user_id", 1), ("slug", 1)], unique=True)
    except Exception as e:  # noqa: BLE001
        logger.warning("Index creation: %s", e)
    try:
        await refresh_data(force=True)
    except Exception as e:  # noqa: BLE001
        logger.warning("Initial refresh failed: %s", e)
    task = asyncio.create_task(_background_refresh())
    yield
    task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan)
api = APIRouter(prefix="/api")


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class SessionIn(BaseModel):
    session_id: str


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one(
        {"session_token": token}, projection={"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session.get("expires_at")
    if expires is not None:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


@api.post("/auth/session")
async def create_session(payload: SessionIn):
    async with httpx.AsyncClient(timeout=15.0) as c:
        resp = await c.get(
            EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="No email in session data")

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name"), "picture": data.get("picture")}},
        )
    else:
        user_id = make_user_id()
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": data.get("name"),
                "picture": data.get("picture"),
                "created_at": now_utc(),
            }
        )

    session_token = data.get("session_token") or uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=7),
        }
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user}


@api.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {"user": user}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# --------------------------------------------------------------------------- #
# IPO data endpoints
# --------------------------------------------------------------------------- #
async def _all_ipos() -> list[dict]:
    await refresh_data(force=False)
    return await db.ipos.find({}, {"_id": 0}).to_list(500)


async def _source_meta() -> dict:
    meta = await db.meta.find_one({"_id": "source_status"}) or {}
    last = meta.get("last_success")
    return {
        "provider": meta.get("provider", provider.name),
        "healthy": meta.get("healthy", False),
        "count": meta.get("count", 0),
        "last_error": meta.get("last_error"),
        "last_updated_iso": last.isoformat() if last else None,
        "last_updated_label": ist_label(last) if last else None,
    }


@api.get("/meta")
async def meta():
    return await _source_meta()


@api.post("/refresh")
async def force_refresh():
    result = await refresh_data(force=True)
    return {**result, "meta": await _source_meta()}


def _sort_key(ipo: dict, field: str):
    g = ipo.get("gmp") or {}
    s = ipo.get("subscription") or {}
    mapping = {
        "issue_size": ipo.get("issue_size_crore"),
        "gmp_pct": g.get("gmp_percent"),
        "gmp_rupees": g.get("gmp_rupees"),
        "open_date": ipo.get("open_date"),
        "close_date": ipo.get("close_date"),
        "subscription": s.get("total"),
        "updated": ipo.get("updated_at"),
        "company": (ipo.get("company_name") or "").lower(),
    }
    v = mapping.get(field)
    return (v is None, v if v is not None else "")


@api.get("/ipos")
async def list_ipos(
    status: Optional[str] = None,
    ipo_type: Optional[str] = None,
    search: Optional[str] = None,
    min_issue_size: Optional[float] = None,
    max_issue_size: Optional[float] = None,
    min_gmp_pct: Optional[float] = None,
    sector: Optional[str] = None,
    sort: str = "gmp_pct",
    order: str = "desc",
):
    ipos = await _all_ipos()

    def keep(ipo: dict) -> bool:
        if status and ipo.get("status") != status:
            return False
        if ipo_type and ipo_type != "All" and ipo.get("ipo_type") != ipo_type:
            return False
        if search:
            q = search.lower()
            hay = " ".join(
                str(ipo.get(k) or "")
                for k in ("company_name", "symbol", "slug")
            ).lower()
            if q not in hay:
                return False
        if min_issue_size is not None:
            v = ipo.get("issue_size_crore")
            if v is None or v < min_issue_size:
                return False
        if max_issue_size is not None:
            v = ipo.get("issue_size_crore")
            if v is None or v > max_issue_size:
                return False
        if min_gmp_pct is not None:
            v = (ipo.get("gmp") or {}).get("gmp_percent")
            if v is None or v < min_gmp_pct:
                return False
        if sector and (ipo.get("sector") or "") != sector:
            return False
        return True

    filtered = [i for i in ipos if keep(i)]
    filtered.sort(key=lambda i: _sort_key(i, sort), reverse=(order == "desc"))
    return {"ipos": filtered, "meta": await _source_meta()}


@api.get("/dashboard")
async def dashboard():
    ipos = await _all_ipos()
    by_status: dict[str, list] = {"open": [], "upcoming": [], "closed": [], "listed": []}
    for i in ipos:
        by_status.setdefault(i.get("status", "open"), []).append(i)

    today = now_utc().astimezone(timezone(timedelta(hours=5, minutes=30))).date().isoformat()

    def gmp_pct(i):
        return (i.get("gmp") or {}).get("gmp_percent")

    def issue_size(i):
        return i.get("issue_size_crore")

    with_gmp = [i for i in ipos if gmp_pct(i) is not None]
    with_size = [i for i in ipos if issue_size(i) is not None]
    open_upcoming = by_status["open"] + by_status["upcoming"]

    highest_gmp = max(with_gmp, key=gmp_pct) if with_gmp else None
    largest = max(with_size, key=issue_size) if with_size else None
    closing_today = [i for i in ipos if i.get("close_date") == today]

    return {
        "cards": {
            "open": len(by_status["open"]),
            "upcoming": len(by_status["upcoming"]),
            "closed": len(by_status["closed"]),
            "listed": len(by_status["listed"]),
            "closing_today": len(closing_today),
            "highest_gmp": {
                "slug": highest_gmp["slug"],
                "company_name": highest_gmp["company_name"],
                "gmp_percent": gmp_pct(highest_gmp),
            }
            if highest_gmp
            else None,
            "largest": {
                "slug": largest["slug"],
                "company_name": largest["company_name"],
                "issue_size_crore": issue_size(largest),
            }
            if largest
            else None,
        },
        "open": by_status["open"],
        "upcoming": by_status["upcoming"][:10],
        "closed": by_status["closed"][:10],
        "listed": by_status["listed"][:10],
        "featured_gmp": sorted(with_gmp, key=gmp_pct, reverse=True)[:6],
        "meta": await _source_meta(),
    }


@api.get("/ipos/{slug}")
async def get_ipo(slug: str):
    await refresh_data(force=False)
    ipo = await db.ipos.find_one({"slug": slug}, {"_id": 0})
    if not ipo:
        raise HTTPException(status_code=404, detail="IPO not found")
    ipo["meta"] = await _source_meta()
    return ipo


@api.get("/ipos/{slug}/gmp-history")
async def gmp_history(slug: str, range: str = Query("all")):
    since = None
    if range == "1D":
        since = now_utc() - timedelta(days=1)
    elif range == "3D":
        since = now_utc() - timedelta(days=3)
    elif range == "7D":
        since = now_utc() - timedelta(days=7)
    q: dict[str, Any] = {"slug": slug}
    if since:
        q["ts"] = {"$gte": since}
    rows = await db.gmp_history.find(q, {"_id": 0}).sort("ts", 1).to_list(1000)
    return {
        "slug": slug,
        "range": range,
        "points": [
            {
                "ts": r["ts"].isoformat(),
                "label": ist_label(r["ts"]),
                "gmp_rupees": r.get("gmp_rupees"),
                "gmp_percent": r.get("gmp_percent"),
            }
            for r in rows
        ],
    }


@api.get("/ipos/{slug}/subscription-history")
async def subscription_history(slug: str):
    rows = await db.subscription_history.find({"slug": slug}, {"_id": 0}).sort("ts", 1).to_list(1000)
    return {
        "slug": slug,
        "points": [
            {"ts": r["ts"].isoformat(), "label": ist_label(r["ts"]), "total": r.get("total")}
            for r in rows
        ],
    }


class AllotmentIn(BaseModel):
    category: str = "retail"
    lots: int = 1
    subscription_multiple: Optional[float] = None
    lot_size: Optional[float] = None
    price: Optional[float] = None


@api.post("/ipos/{slug}/allotment")
async def allotment(slug: str, payload: AllotmentIn):
    ipo = await db.ipos.find_one({"slug": slug}, {"_id": 0})
    if not ipo:
        raise HTTPException(status_code=404, detail="IPO not found")
    sub = payload.subscription_multiple
    if sub is None:
        sub = (ipo.get("subscription") or {}).get("total")
    result = compute_allotment(
        category=payload.category,
        subscription_multiple=sub,
        lot_size=payload.lot_size if payload.lot_size is not None else ipo.get("lot_size"),
        price=payload.price if payload.price is not None else ipo.get("price_band_high"),
        lots=payload.lots,
    )
    result["used_total_subscription_proxy"] = payload.subscription_multiple is None
    return result


# --------------------------------------------------------------------------- #
# AI business analysis (GPT-5.4 via Emergent key), cached
# --------------------------------------------------------------------------- #
AI_SYSTEM = (
    "You are an equity research assistant for Indian IPOs. You will be given the "
    "verified structured facts we hold about an IPO. Produce a concise, plain-English "
    "explanation for a retail investor. STRICT RULES: never invent financial numbers, "
    "revenue, profit, valuation, or subscription figures. If a fact is not in the "
    "provided data, say it is not available and must be checked in the RHP/DRHP. "
    "Clearly separate what is a FACT (from provided data / widely-known public info) "
    "from AI INTERPRETATION. Respond ONLY with strict minified JSON, no markdown."
)


def _ai_prompt(ipo: dict) -> str:
    g = ipo.get("gmp") or {}
    s = ipo.get("subscription") or {}
    facts = {
        "company_name": ipo.get("company_name"),
        "symbol": ipo.get("symbol"),
        "ipo_type": ipo.get("ipo_type"),
        "status": ipo.get("status"),
        "price_band": ipo.get("price_band_text"),
        "issue_size_crore_estimated": ipo.get("issue_size_crore"),
        "open_date": ipo.get("open_date"),
        "close_date": ipo.get("close_date"),
        "gmp_rupees": g.get("gmp_rupees"),
        "gmp_percent": g.get("gmp_percent"),
        "total_subscription_x": s.get("total"),
    }
    schema = (
        '{"what_it_does":str,"how_it_makes_money":str,"where_money_goes":str,'
        '"strengths":[str],"risks":[str],"things_to_verify":[str]}'
    )
    return (
        "VERIFIED FACTS WE HOLD (may be partial):\n"
        + json.dumps(facts, ensure_ascii=False)
        + "\n\nUsing these facts plus widely-known public information about this "
        "company (only if you are confident it is the same company), write the JSON. "
        "Keep each string field 2-4 sentences. Provide 3-4 strengths, 3-4 risks, and "
        "3-4 concrete things_to_verify in the RHP/DRHP. "
        f"Respond ONLY as minified JSON matching: {schema}"
    )


async def _generate_ai_summary(ipo: dict) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ipo-{ipo['slug']}",
        system_message=AI_SYSTEM,
    ).with_model(AI_PROVIDER, AI_MODEL)
    reply = await chat.send_message(UserMessage(text=_ai_prompt(ipo)))
    text = reply if isinstance(reply, str) else str(reply)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    raw = match.group(0) if match else text
    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001
        parsed = {
            "what_it_does": text[:600],
            "how_it_makes_money": "",
            "where_money_goes": "",
            "strengths": [],
            "risks": [],
            "things_to_verify": [],
        }
    return parsed


@api.get("/ipos/{slug}/ai-summary")
async def ai_summary(slug: str, regenerate: bool = False):
    ipo = await db.ipos.find_one({"slug": slug}, {"_id": 0})
    if not ipo:
        raise HTTPException(status_code=404, detail="IPO not found")

    cached = await db.ai_summaries.find_one({"slug": slug}, {"_id": 0})
    if cached and not regenerate:
        return cached

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI key not configured")
    try:
        parsed = await _generate_ai_summary(ipo)
    except Exception as e:  # noqa: BLE001
        logger.warning("AI summary failed for %s: %s", slug, e)
        raise HTTPException(status_code=502, detail="AI generation failed")

    doc = {
        "slug": slug,
        "company_name": ipo.get("company_name"),
        "summary": parsed,
        "model": f"{AI_PROVIDER}:{AI_MODEL}",
        "generated_at": now_utc().isoformat(),
        "generated_label": ist_label(),
        "disclaimer": (
            "AI-generated summary. Verify important information against the "
            "company's RHP/DRHP and official filings. This is not investment advice."
        ),
    }
    await db.ai_summaries.update_one({"slug": slug}, {"$set": doc}, upsert=True)
    return doc


# --------------------------------------------------------------------------- #
# Watchlist (auth)
# --------------------------------------------------------------------------- #
class WatchIn(BaseModel):
    slug: str


@api.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    rows = await db.watchlist.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    slugs = [r["slug"] for r in rows]
    ipos = await db.ipos.find({"slug": {"$in": slugs}}, {"_id": 0}).to_list(500)
    return {"slugs": slugs, "ipos": ipos}


@api.post("/watchlist")
async def add_watchlist(payload: WatchIn, user: dict = Depends(get_current_user)):
    await db.watchlist.update_one(
        {"user_id": user["user_id"], "slug": payload.slug},
        {"$set": {"user_id": user["user_id"], "slug": payload.slug, "added_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/watchlist/{slug}")
async def remove_watchlist(slug: str, user: dict = Depends(get_current_user)):
    await db.watchlist.delete_one({"user_id": user["user_id"], "slug": slug})
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Saved screeners (auth)
# --------------------------------------------------------------------------- #
class ScreenerIn(BaseModel):
    name: str
    filters: dict
    is_default: bool = False


@api.get("/screeners")
async def list_screeners(user: dict = Depends(get_current_user)):
    rows = await db.screeners.find({"user_id": user["user_id"]}, {"_id": 0}).sort(
        "created_at", -1
    ).to_list(200)
    return {"screeners": rows}


@api.post("/screeners")
async def create_screener(payload: ScreenerIn, user: dict = Depends(get_current_user)):
    if payload.is_default:
        await db.screeners.update_many(
            {"user_id": user["user_id"]}, {"$set": {"is_default": False}}
        )
    doc = {
        "id": uuid.uuid4().hex,
        "user_id": user["user_id"],
        "name": payload.name,
        "filters": payload.filters,
        "is_default": payload.is_default,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.screeners.insert_one(doc)
    doc.pop("_id", None)
    return {"screener": {k: v for k, v in doc.items() if k != "_id"}}


@api.put("/screeners/{screener_id}")
async def update_screener(
    screener_id: str, payload: ScreenerIn, user: dict = Depends(get_current_user)
):
    existing = await db.screeners.find_one(
        {"id": screener_id, "user_id": user["user_id"]}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Screener not found")
    if payload.is_default:
        await db.screeners.update_many(
            {"user_id": user["user_id"]}, {"$set": {"is_default": False}}
        )
    await db.screeners.update_one(
        {"id": screener_id, "user_id": user["user_id"]},
        {
            "$set": {
                "name": payload.name,
                "filters": payload.filters,
                "is_default": payload.is_default,
                "updated_at": now_utc(),
            }
        },
    )
    updated = await db.screeners.find_one({"id": screener_id}, {"_id": 0})
    return {"screener": updated}


@api.delete("/screeners/{screener_id}")
async def delete_screener(screener_id: str, user: dict = Depends(get_current_user)):
    await db.screeners.delete_one({"id": screener_id, "user_id": user["user_id"]})
    return {"ok": True}


@api.get("/")
async def root():
    return {"service": "Indian IPO Terminal API", "provider": provider.name}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
