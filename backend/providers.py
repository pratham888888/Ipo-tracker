"""
IPO data provider abstraction.

The rest of the application depends only on the normalized schema returned by
`fetch_normalized()`, never on a specific provider's response shape. Swap the
provider by setting IPO_DATA_PROVIDER in the environment.

Supported providers:
  - downstox   : free public JSON (GMP + IPO list; total subscription only)
  - nse        : official NSE JSON (category-wise subscription + issue metadata
                 for currently open issues; no GMP)
  - composite  : Downstox for universe/GMP + NSE enrichment for category
                 subscription / registrar / lot size / documents (recommended)
  - ipoguru    : free API key required; QIB/NII/Retail (not sNII/bNII split)

Data quality rule: missing values are `None` (never silently coerced to 0).
Derived values are flagged. Each important nested object carries source +
timestamp so the UI can show provenance.
"""
from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional
import httpx

logger = logging.getLogger("providers")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Official registrar allotment-status portals (verified public URLs).
REGISTRAR_ALLOTMENT_URLS: dict[str, str] = {
    "kfin": "https://kosmic.kfintech.com/ipostatus/",
    "kfintech": "https://kosmic.kfintech.com/ipostatus/",
    "mufg": "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
    "intime": "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
    "linkintime": "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
    "bigshare": "https://ipo.bigshareonline.com/IPO_Status.html",
    "cameo": "https://rights.cameoindia.com/ipo",
    "purva": "https://www.purvashare.com/investor-service/ipo-status",
    "skyline": "https://www.skylinerta.com/ipo.php",
    "mas": "https://www.maserv.com/publicIssues.html",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _round2(v: Optional[float]) -> Optional[float]:
    return None if v is None else round(v, 2)


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "ipo"


def _parse_issue_size_crore(text: Any) -> Optional[float]:
    if text is None:
        return None
    s = str(text)
    m = re.search(r"([\d,.]+)\s*(?:cr|crore)", s, re.I)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None
    m = re.search(r"Rs\.?\s*([\d,.]+)\s*million", s, re.I)
    if m:
        try:
            # 10 million = 1 crore
            return round(float(m.group(1).replace(",", "")) / 10.0, 2)
        except ValueError:
            return None
    return None


def _first_int(text: Any) -> Optional[float]:
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    m = re.search(r"(\d+(?:\.\d+)?)", str(text).replace(",", ""))
    return _num(m.group(1)) if m else None


def _parse_price_band(text: Any) -> tuple[Optional[float], Optional[float], Optional[str]]:
    if not text:
        return None, None, None
    s = str(text).strip().strip('"')
    nums = re.findall(r"(\d+(?:\.\d+)?)", s)
    if len(nums) >= 2:
        return _num(nums[0]), _num(nums[1]), s
    if len(nums) == 1:
        n = _num(nums[0])
        return n, n, s
    return None, None, s


def resolve_registrar_allotment_url(registrar: Optional[str]) -> Optional[str]:
    if not registrar:
        return None
    key = re.sub(r"[^a-z0-9]", "", registrar.lower())
    for needle, url in REGISTRAR_ALLOTMENT_URLS.items():
        if needle in key:
            return url
    return None


def empty_subscription(source: str, ts: str) -> dict:
    return {
        "total": None,
        "qib": None,
        "snii": None,
        "bnii": None,
        "nii": None,
        "retail": None,
        "employee": None,
        "shareholder": None,
        "source": source,
        "timestamp": ts,
        "category_wise_available": False,
    }


def empty_gmp(source: str, ts: str) -> dict:
    return {
        "gmp_rupees": None,
        "gmp_percent": None,
        "implied_listing_price": None,
        "source": source,
        "source_updated_label": None,
        "timestamp": ts,
        "unofficial": True,
    }


class ProviderError(Exception):
    """Raised when a provider fails; caller should fall back to cache."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class IpoDataProvider(ABC):
    name: str = "base"

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key

    @abstractmethod
    async def fetch_normalized(self) -> list[dict]:
        """Return a list of normalized IPO dicts."""
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Downstox
# --------------------------------------------------------------------------- #
class DownstoxProvider(IpoDataProvider):
    """
    Public, unauthenticated JSON source.
      GET /api/ipo       -> open/upcoming/closed (+ optional listed)
      GET /api/ipo/gmp   -> flat GMP list

    Provides total subscription only — category fields stay null.
    """

    name = "downstox"

    async def _get(self, client: httpx.AsyncClient, path: str) -> dict:
        url = f"{self.base_url}{path}"
        try:
            resp = await client.get(url, headers={"User-Agent": USER_AGENT})
        except httpx.RequestError as e:
            raise ProviderError(f"network error: {e}") from e
        if resp.status_code == 429:
            raise ProviderError("rate limited (429)", status_code=429)
        if resp.status_code >= 400:
            raise ProviderError(
                f"provider http {resp.status_code}", status_code=resp.status_code
            )
        try:
            return resp.json()
        except Exception as e:  # noqa: BLE001
            raise ProviderError(f"invalid json: {e}") from e

    async def fetch_normalized(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            main = await self._get(client, "/api/ipo")
            try:
                gmp_payload = await self._get(client, "/api/ipo/gmp")
            except ProviderError:
                gmp_payload = {"rows": []}

        gmp_updated_label = None
        gmp_by_norm: dict[str, dict] = {}
        for row in gmp_payload.get("rows", []) or []:
            norm = (row.get("norm") or "").lower()
            if norm:
                gmp_by_norm[norm] = row
            gmp_updated_label = gmp_updated_label or row.get("status")

        now_iso = _now_iso()
        results: list[dict] = []
        for bucket in ("open", "upcoming", "closed", "listed"):
            for item in main.get(bucket, []) or []:
                results.append(
                    self._normalize_item(item, bucket, gmp_by_norm, now_iso)
                )
        return results

    def _normalize_item(
        self, item: dict, bucket: str, gmp_by_norm: dict, now_iso: str
    ) -> dict:
        gmp_obj = item.get("gmp") or {}
        norm = (gmp_obj.get("norm") or "").lower()
        if not norm:
            norm = (item.get("company") or "").lower().replace(" ", "")[:40]
        enrich = gmp_by_norm.get(norm, {})

        price_min = _num(item.get("priceMin"))
        price_max = _num(item.get("priceMax"))
        issue_shares = _num(item.get("issueSizeShares"))
        lot_size = _num(item.get("lotSize"))

        issue_size_crore = None
        issue_size_estimated = False
        if issue_shares and price_max:
            issue_size_crore = _round2(issue_shares * price_max / 1e7)
            issue_size_estimated = True

        minimum_investment = None
        if lot_size and price_max:
            minimum_investment = _round2(lot_size * price_max)

        gmp_rupees = _num(gmp_obj.get("gmp"))
        if gmp_rupees is None:
            gmp_rupees = _num(enrich.get("gmp"))
        gmp_percent = _num(gmp_obj.get("gainPct"))
        if gmp_percent is None:
            gmp_percent = _num(enrich.get("gainPct"))

        # Prefer verified formula when both sides exist; else use provider estimate.
        implied_listing = None
        if gmp_rupees is not None and price_max is not None:
            implied_listing = _round2(price_max + gmp_rupees)
        else:
            implied_listing = _num(gmp_obj.get("estListing"))
            if implied_listing is None:
                implied_listing = _num(enrich.get("estListing"))

        if gmp_percent is None and gmp_rupees is not None and price_max:
            gmp_percent = _round2(gmp_rupees / price_max * 100)

        gmp_label = gmp_obj.get("status") or enrich.get("status")
        segment = item.get("segment") or "Mainboard"
        ipo_type = "SME" if "sme" in segment.lower() else "Mainboard"
        status = bucket if bucket in ("open", "upcoming", "closed", "listed") else "open"
        subscription_x = _num(item.get("subscriptionX"))

        sub = empty_subscription(self.name, now_iso)
        sub["total"] = subscription_x
        sub["category_wise_available"] = False

        return {
            "slug": item.get("slug") or norm,
            "company_name": item.get("company"),
            "symbol": item.get("symbol"),
            "ipo_type": ipo_type,
            "segment": segment,
            "exchange": item.get("series"),
            "status": status,
            "open_date": item.get("openDate"),
            "close_date": item.get("closeDate"),
            "open_date_raw": item.get("openDateRaw"),
            "close_date_raw": item.get("closeDateRaw"),
            "allotment_date": None,
            "refund_date": None,
            "demat_credit_date": None,
            "listing_date": None,
            "price_band_low": price_min,
            "price_band_high": price_max,
            "price_band_text": item.get("priceBand"),
            "issue_price": None,
            "face_value": None,
            "lot_size": lot_size,
            "minimum_investment": minimum_investment,
            "issue_size_crore": issue_size_crore,
            "issue_size_estimated": issue_size_estimated,
            "issue_size_shares": issue_shares,
            "fresh_issue_size": None,
            "ofs_size": None,
            "listing_exchange": None,
            "registrar": None,
            "registrar_allotment_url": None,
            "lead_managers": None,
            "sector": None,
            "industry": None,
            "promoter": None,
            "website": None,
            "documents": [],
            "gmp": {
                "gmp_rupees": gmp_rupees,
                "gmp_percent": gmp_percent,
                "implied_listing_price": implied_listing,
                "source": self.name,
                "source_updated_label": gmp_label,
                "timestamp": now_iso,
                "unofficial": True,
            },
            "subscription": sub,
            "field_sources": {
                "metadata": self.name,
                "gmp": self.name,
                "subscription": self.name,
            },
            "source": self.name,
            "fetched_at": now_iso,
        }


# --------------------------------------------------------------------------- #
# NSE (official JSON)
# --------------------------------------------------------------------------- #
class NseProvider(IpoDataProvider):
    """
    Official NSE India JSON endpoints (cookie bootstrap required).

      GET /api/ipo-current-issue
      GET /api/ipo-detail?symbol=&series=

    Category mapping from bidDetails.srNo:
      1   -> qib
      2   -> nii
      2.1 -> bnii  (> ₹10L)
      2.2 -> snii  (₹2L–₹10L)
      3   -> retail
      4   -> employee (when present)
      5   -> shareholder (when present)
      Total / srNo null -> total

    Does not provide GMP. Upcoming IPOs outside the live book are typically
    absent — pair with Downstox via CompositeProvider for a full universe.
    """

    name = "nse"

    def __init__(self, base_url: str = "https://www.nseindia.com", api_key: Optional[str] = None):
        super().__init__(base_url or "https://www.nseindia.com", api_key)

    async def _session(self) -> httpx.AsyncClient:
        client = httpx.AsyncClient(
            timeout=25.0,
            follow_redirects=True,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json,text/plain,*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": f"{self.base_url}/market-data/all-upcoming-issues-ipo",
            },
        )
        try:
            await client.get(f"{self.base_url}/")
            await client.get(f"{self.base_url}/market-data/all-upcoming-issues-ipo")
        except httpx.RequestError as e:
            await client.aclose()
            raise ProviderError(f"nse bootstrap failed: {e}") from e
        return client

    async def _get_json(self, client: httpx.AsyncClient, path: str, **params) -> Any:
        try:
            resp = await client.get(f"{self.base_url}{path}", params=params or None)
        except httpx.RequestError as e:
            raise ProviderError(f"nse network error: {e}") from e
        if resp.status_code == 429:
            raise ProviderError("nse rate limited (429)", status_code=429)
        if resp.status_code >= 400:
            raise ProviderError(f"nse http {resp.status_code}", status_code=resp.status_code)
        try:
            return resp.json()
        except Exception as e:  # noqa: BLE001
            raise ProviderError(f"nse invalid json: {e}") from e

    async def fetch_normalized(self) -> list[dict]:
        client = await self._session()
        try:
            current = await self._get_json(client, "/api/ipo-current-issue")
            if not isinstance(current, list):
                current = []
            results: list[dict] = []
            seen: set[str] = set()
            for row in current:
                symbol = (row.get("symbol") or "").strip()
                series = (row.get("series") or "EQ").strip() or "EQ"
                if not symbol or symbol in seen:
                    continue
                seen.add(symbol)
                detail = None
                try:
                    detail = await self._get_json(
                        client, "/api/ipo-detail", symbol=symbol, series=series
                    )
                except ProviderError as e:
                    logger.warning("NSE detail failed for %s: %s", symbol, e)
                results.append(self._normalize(row, detail, _now_iso()))
            return results
        finally:
            await client.aclose()

    async def enrich_symbols(
        self, symbols: list[tuple[str, str]]
    ) -> dict[str, dict]:
        """Return symbol -> partial enrichment dict for CompositeProvider."""
        if not symbols:
            return {}
        client = await self._session()
        out: dict[str, dict] = {}
        try:
            for symbol, series in symbols:
                symbol = (symbol or "").strip()
                series = (series or "EQ").strip() or "EQ"
                if not symbol:
                    continue
                try:
                    detail = await self._get_json(
                        client, "/api/ipo-detail", symbol=symbol, series=series
                    )
                except ProviderError as e:
                    logger.warning("NSE enrich failed for %s: %s", symbol, e)
                    continue
                out[symbol.upper()] = self._enrichment_from_detail(detail, _now_iso())
            # Also pull live totals list for total subscription when detail misses it
            try:
                current = await self._get_json(client, "/api/ipo-current-issue")
                if isinstance(current, list):
                    for row in current:
                        sym = (row.get("symbol") or "").upper()
                        if sym in out and out[sym].get("subscription", {}).get("total") is None:
                            out[sym]["subscription"]["total"] = _num(row.get("noOfTime"))
            except ProviderError:
                pass
            return out
        finally:
            await client.aclose()

    def _issue_info_map(self, detail: Optional[dict]) -> dict[str, str]:
        mapping: dict[str, str] = {}
        if not detail:
            return mapping
        for row in (detail.get("issueInfo") or {}).get("dataList", []) or []:
            title = row.get("title")
            if not title:
                continue
            val = row.get("value")
            if val is None:
                continue
            mapping[str(title).strip().lower()] = str(val).strip().strip('"')
        return mapping

    def _parse_subscription(self, detail: Optional[dict], now_iso: str) -> dict:
        sub = empty_subscription(self.name, now_iso)
        if not detail:
            return sub
        for bid in detail.get("bidDetails") or []:
            sr = str(bid.get("srNo") or "").strip()
            cat = (bid.get("category") or "").strip().lower()
            times = _num(bid.get("noOfTime"))
            if times is None:
                continue
            if sr == "1" or cat.startswith("qualified institutional"):
                sub["qib"] = times
            elif sr == "2" or cat == "non institutional investors":
                sub["nii"] = times
            elif sr == "2.1" or "more than ten lakh" in cat:
                sub["bnii"] = times
            elif sr == "2.2" or ("two lakh" in cat and "ten lakh" in cat):
                sub["snii"] = times
            elif sr == "3" or "retail individual" in cat:
                sub["retail"] = times
            elif sr == "4" or cat.startswith("employee"):
                sub["employee"] = times
            elif sr == "5" or "shareholder" in cat or "reservation portion" in cat:
                sub["shareholder"] = times
            elif sr in ("", "None", "null") or cat == "total":
                sub["total"] = times
        sub["category_wise_available"] = any(
            sub[k] is not None for k in ("qib", "snii", "bnii", "retail", "nii")
        )
        return sub

    def _enrichment_from_detail(self, detail: Optional[dict], now_iso: str) -> dict:
        info = self._issue_info_map(detail)
        sub = self._parse_subscription(detail, now_iso)

        price_text = info.get("price range") or info.get("issue price")
        low, high, band_text = _parse_price_band(price_text)
        lot = _first_int(info.get("bid lot") or info.get("minimum order quantity"))
        face = _first_int(info.get("face value"))
        registrar = info.get("name of the registrar")
        lead = info.get("book running lead managers")
        issue_size_text = info.get("issue size")
        issue_size_crore = _parse_issue_size_crore(issue_size_text)

        period = info.get("issue period") or ""
        open_raw = close_raw = open_date = close_date = None
        if " to " in period.lower():
            parts = re.split(r"\s+to\s+", period, flags=re.I)
            if len(parts) == 2:
                open_raw, close_raw = parts[0].strip(), parts[1].strip()
                open_date = self._to_iso_date(open_raw)
                close_date = self._to_iso_date(close_raw)

        documents = []
        for title, url_key in (
            ("Red Herring Prospectus", "red herring prospectus"),
            ("DRHP / RHP", "red herring prospectus"),
        ):
            url = info.get(url_key)
            if url and url.startswith("http"):
                documents.append({"title": title, "url": url, "source": self.name})

        company = None
        for row in (detail or {}).get("issueInfo", {}).get("dataList", []) or []:
            if row.get("title") and not row.get("value"):
                company = row.get("title")
                break

        symbol = info.get("symbol") or (detail or {}).get("companyName")
        min_inv = _round2(lot * high) if lot and high else None

        return {
            "company_name": company,
            "symbol": symbol,
            "lot_size": lot,
            "face_value": face,
            "price_band_low": low,
            "price_band_high": high,
            "price_band_text": band_text or price_text,
            "issue_price": high,
            "minimum_investment": min_inv,
            "issue_size_crore": issue_size_crore,
            "issue_size_estimated": bool(issue_size_crore),
            "registrar": registrar,
            "registrar_allotment_url": resolve_registrar_allotment_url(registrar),
            "lead_managers": lead,
            "open_date": open_date,
            "close_date": close_date,
            "open_date_raw": open_raw,
            "close_date_raw": close_raw,
            "documents": documents,
            "subscription": sub,
            "field_sources": {
                "subscription": self.name,
                "registrar": self.name if registrar else None,
                "lot_size": self.name if lot else None,
                "documents": self.name if documents else None,
            },
            "fetched_at": now_iso,
        }

    @staticmethod
    def _to_iso_date(raw: Optional[str]) -> Optional[str]:
        if not raw:
            return None
        for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(raw.strip(), fmt).date().isoformat()
            except ValueError:
                continue
        return None

    def _normalize(self, row: dict, detail: Optional[dict], now_iso: str) -> dict:
        enrich = self._enrichment_from_detail(detail, now_iso)
        symbol = row.get("symbol") or enrich.get("symbol")
        company = row.get("companyName") or enrich.get("company_name") or symbol
        low, high, band = _parse_price_band(row.get("issuePrice"))
        if enrich.get("price_band_low") is not None:
            low = enrich["price_band_low"]
            high = enrich["price_band_high"]
            band = enrich.get("price_band_text") or band

        status_raw = (row.get("status") or "Active").lower()
        if status_raw == "active":
            status = "open"
        elif status_raw in ("upcoming", "forthcoming"):
            status = "upcoming"
        elif status_raw in ("closed", "close"):
            status = "closed"
        else:
            status = "open"

        series = row.get("series") or "EQ"
        ipo_type = "SME" if series.upper() in ("SME", "SM") else "Mainboard"

        sub = enrich.get("subscription") or empty_subscription(self.name, now_iso)
        if sub.get("total") is None:
            sub["total"] = _num(row.get("noOfTime"))

        issue_shares = _num(row.get("issueSize"))
        issue_size_crore = enrich.get("issue_size_crore")
        issue_size_estimated = bool(enrich.get("issue_size_estimated"))
        if issue_size_crore is None and issue_shares and high:
            issue_size_crore = _round2(issue_shares * high / 1e7)
            issue_size_estimated = True

        lot = enrich.get("lot_size")
        min_inv = enrich.get("minimum_investment")
        if min_inv is None and lot and high:
            min_inv = _round2(lot * high)

        open_date = enrich.get("open_date") or self._to_iso_date(row.get("issueStartDate"))
        close_date = enrich.get("close_date") or self._to_iso_date(row.get("issueEndDate"))

        return {
            "slug": _slugify(f"{company}-ipo") if company else _slugify(symbol or "ipo"),
            "company_name": company,
            "symbol": symbol,
            "ipo_type": ipo_type,
            "segment": ipo_type,
            "exchange": series,
            "status": status,
            "open_date": open_date,
            "close_date": close_date,
            "open_date_raw": enrich.get("open_date_raw") or row.get("issueStartDate"),
            "close_date_raw": enrich.get("close_date_raw") or row.get("issueEndDate"),
            "allotment_date": None,
            "refund_date": None,
            "demat_credit_date": None,
            "listing_date": None,
            "price_band_low": low,
            "price_band_high": high,
            "price_band_text": band or row.get("issuePrice"),
            "issue_price": high,
            "face_value": enrich.get("face_value"),
            "lot_size": lot,
            "minimum_investment": min_inv,
            "issue_size_crore": issue_size_crore,
            "issue_size_estimated": issue_size_estimated,
            "issue_size_shares": issue_shares,
            "fresh_issue_size": None,
            "ofs_size": None,
            "listing_exchange": "NSE",
            "registrar": enrich.get("registrar"),
            "registrar_allotment_url": enrich.get("registrar_allotment_url"),
            "lead_managers": enrich.get("lead_managers"),
            "sector": None,
            "industry": None,
            "promoter": None,
            "website": None,
            "documents": enrich.get("documents") or [],
            "gmp": empty_gmp(self.name, now_iso),
            "subscription": sub,
            "field_sources": {
                "metadata": self.name,
                "gmp": None,
                "subscription": self.name,
            },
            "source": self.name,
            "fetched_at": now_iso,
        }


# --------------------------------------------------------------------------- #
# IPO Guru (optional, API key)
# --------------------------------------------------------------------------- #
class IpoGuruProvider(IpoDataProvider):
    """
    Free developer API (key required). Provides QIB / NII / Retail / Total
    and GMP, allotment/listing dates, registrar. Does NOT split sNII/bNII.
    """

    name = "ipoguru"

    def __init__(
        self, base_url: str = "https://www.ipoguru.in/api/v1", api_key: Optional[str] = None
    ):
        super().__init__(base_url or "https://www.ipoguru.in/api/v1", api_key)

    async def fetch_normalized(self) -> list[dict]:
        if not self.api_key:
            raise ProviderError("IPO_API_KEY required for ipoguru provider")
        headers = {"User-Agent": USER_AGENT, "X-API-KEY": self.api_key}
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            try:
                resp = await client.get(f"{self.base_url}/ipos", headers=headers)
            except httpx.RequestError as e:
                raise ProviderError(f"ipoguru network: {e}") from e
            if resp.status_code == 429:
                raise ProviderError("ipoguru rate limited", status_code=429)
            if resp.status_code >= 400:
                raise ProviderError(f"ipoguru http {resp.status_code}", status_code=resp.status_code)
            payload = resp.json()

        now_iso = _now_iso()
        rows = payload.get("data") or []
        return [self._normalize(item, now_iso) for item in rows]

    def _normalize(self, item: dict, now_iso: str) -> dict:
        status_raw = (item.get("status") or "").lower()
        status = status_raw if status_raw in ("open", "upcoming", "closed", "listed") else "open"
        ipo_type = "SME" if "sme" in (item.get("type") or "").lower() else "Mainboard"
        low, high, band = _parse_price_band(item.get("price_band"))
        issue_price = _num(item.get("issue_price")) or high
        lot = _num(item.get("lot_size"))
        issue_size_crore = _parse_issue_size_crore(item.get("issue_size"))
        min_inv = _round2(lot * (issue_price or high)) if lot and (issue_price or high) else None

        sub_raw = item.get("subscription") or {}
        sub = empty_subscription(self.name, now_iso)
        sub["qib"] = _num(sub_raw.get("qib"))
        sub["nii"] = _num(sub_raw.get("nii"))
        sub["retail"] = _num(sub_raw.get("retail"))
        sub["total"] = _num(sub_raw.get("total"))
        # Honest: no sNII/bNII split from this provider
        sub["snii"] = None
        sub["bnii"] = None
        sub["category_wise_available"] = any(
            sub[k] is not None for k in ("qib", "nii", "retail")
        )
        sub["source_updated_label"] = sub_raw.get("updated_at")

        gmp_raw = item.get("gmp") or {}
        gmp_rupees = _num(gmp_raw.get("price"))
        gmp_percent = _num(gmp_raw.get("percentage"))
        if gmp_percent is None and gmp_rupees is not None and issue_price:
            gmp_percent = _round2(gmp_rupees / issue_price * 100)
        implied = (
            _round2(issue_price + gmp_rupees)
            if issue_price is not None and gmp_rupees is not None
            else None
        )
        registrar = item.get("registrar")
        name = item.get("name") or "IPO"

        return {
            "slug": _slugify(name),
            "company_name": name,
            "symbol": None,
            "ipo_type": ipo_type,
            "segment": item.get("sub_type") or ipo_type,
            "exchange": item.get("listing_on"),
            "status": status,
            "open_date": item.get("open_date"),
            "close_date": item.get("close_date"),
            "open_date_raw": item.get("open_date"),
            "close_date_raw": item.get("close_date"),
            "allotment_date": item.get("allotment_date"),
            "refund_date": None,
            "demat_credit_date": None,
            "listing_date": item.get("listing_date"),
            "price_band_low": low,
            "price_band_high": high or issue_price,
            "price_band_text": band or item.get("price_band"),
            "issue_price": issue_price,
            "face_value": _num(item.get("face_value")),
            "lot_size": lot,
            "minimum_investment": min_inv,
            "issue_size_crore": issue_size_crore,
            "issue_size_estimated": False if issue_size_crore else False,
            "issue_size_shares": None,
            "fresh_issue_size": None,
            "ofs_size": None,
            "listing_exchange": item.get("listing_on"),
            "registrar": registrar,
            "registrar_allotment_url": resolve_registrar_allotment_url(registrar),
            "lead_managers": None,
            "sector": None,
            "industry": None,
            "promoter": None,
            "website": None,
            "documents": [],
            "gmp": {
                "gmp_rupees": gmp_rupees,
                "gmp_percent": gmp_percent,
                "implied_listing_price": implied,
                "source": self.name,
                "source_updated_label": gmp_raw.get("updated_at"),
                "timestamp": now_iso,
                "unofficial": True,
            },
            "subscription": sub,
            "field_sources": {
                "metadata": self.name,
                "gmp": self.name,
                "subscription": self.name,
            },
            "source": self.name,
            "fetched_at": now_iso,
        }


# --------------------------------------------------------------------------- #
# Composite: Downstox universe + NSE category subscription
# --------------------------------------------------------------------------- #
class CompositeProvider(IpoDataProvider):
    """
    Multi-source merge:
      - Downstox → IPO universe, GMP (unofficial)
      - NSE → category-wise subscription, registrar, lot size, RHP links
                for matching symbols (when the issue is live on NSE)

    Fields remain null when a source does not provide them.
    """

    name = "composite"

    def __init__(
        self,
        base_url: str = "",
        api_key: Optional[str] = None,
        downstox_url: str = "https://downstox.com",
        nse_url: str = "https://www.nseindia.com",
    ):
        super().__init__(base_url or downstox_url, api_key)
        self.downstox = DownstoxProvider(downstox_url, api_key)
        self.nse = NseProvider(nse_url, api_key)

    async def fetch_normalized(self) -> list[dict]:
        base = await self.downstox.fetch_normalized()
        # Enrich open/closed issues that have symbols (NSE live book).
        to_enrich = [
            (i.get("symbol") or "", i.get("exchange") or "EQ")
            for i in base
            if i.get("symbol") and i.get("status") in ("open", "closed")
        ]
        enrichments: dict[str, dict] = {}
        try:
            enrichments = await self.nse.enrich_symbols(to_enrich)
        except ProviderError as e:
            logger.warning("NSE enrichment skipped: %s", e)

        now_iso = _now_iso()
        merged: list[dict] = []
        for ipo in base:
            sym = (ipo.get("symbol") or "").upper()
            extra = enrichments.get(sym)
            if not extra:
                ipo["source"] = self.name
                ipo["field_sources"] = {
                    "metadata": "downstox",
                    "gmp": "downstox",
                    "subscription": "downstox",
                }
                ipo["fetched_at"] = now_iso
                merged.append(ipo)
                continue

            # Prefer NSE for category subscription; keep Downstox total if NSE total missing.
            nse_sub = extra.get("subscription") or {}
            d_sub = ipo.get("subscription") or empty_subscription("downstox", now_iso)
            sub = {
                "total": nse_sub.get("total") if nse_sub.get("total") is not None else d_sub.get("total"),
                "qib": nse_sub.get("qib"),
                "snii": nse_sub.get("snii"),
                "bnii": nse_sub.get("bnii"),
                "nii": nse_sub.get("nii"),
                "retail": nse_sub.get("retail"),
                "employee": nse_sub.get("employee"),
                "shareholder": nse_sub.get("shareholder"),
                "source": "nse" if nse_sub.get("category_wise_available") else d_sub.get("source"),
                "timestamp": now_iso,
                "category_wise_available": bool(nse_sub.get("category_wise_available")),
            }

            for field in (
                "lot_size",
                "face_value",
                "registrar",
                "registrar_allotment_url",
                "lead_managers",
                "minimum_investment",
                "issue_price",
            ):
                if extra.get(field) is not None and ipo.get(field) is None:
                    ipo[field] = extra[field]

            if extra.get("documents"):
                ipo["documents"] = extra["documents"]

            # Fill price/lot-derived min investment if still missing
            if (
                ipo.get("minimum_investment") is None
                and ipo.get("lot_size")
                and ipo.get("price_band_high")
            ):
                ipo["minimum_investment"] = _round2(
                    ipo["lot_size"] * ipo["price_band_high"]
                )

            # Recompute GMP-derived listing from verified formula when possible
            g = ipo.get("gmp") or empty_gmp("downstox", now_iso)
            price = ipo.get("issue_price") or ipo.get("price_band_high")
            if g.get("gmp_rupees") is not None and price is not None:
                g["implied_listing_price"] = _round2(price + g["gmp_rupees"])
                if g.get("gmp_percent") is None and price:
                    g["gmp_percent"] = _round2(g["gmp_rupees"] / price * 100)
            g["unofficial"] = True
            ipo["gmp"] = g
            ipo["subscription"] = sub
            ipo["field_sources"] = {
                "metadata": "downstox+nse",
                "gmp": "downstox",
                "subscription": sub["source"],
                "registrar": "nse" if ipo.get("registrar") else None,
            }
            ipo["source"] = self.name
            ipo["fetched_at"] = now_iso
            merged.append(ipo)

        return merged


def get_provider(name: str, base_url: str, api_key: Optional[str]) -> IpoDataProvider:
    name = (name or "composite").lower().strip()
    if name == "downstox":
        return DownstoxProvider(base_url or "https://downstox.com", api_key)
    if name == "nse":
        return NseProvider(base_url or "https://www.nseindia.com", api_key)
    if name == "ipoguru":
        return IpoGuruProvider(base_url or "https://www.ipoguru.in/api/v1", api_key)
    if name == "composite":
        return CompositeProvider(
            base_url=base_url or "",
            api_key=api_key,
            downstox_url="https://downstox.com",
            nse_url="https://www.nseindia.com",
        )
    logger.warning("Unknown provider '%s', defaulting to composite", name)
    return CompositeProvider(api_key=api_key)
