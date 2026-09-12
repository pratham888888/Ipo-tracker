"""
IPO data provider abstraction.

The rest of the application depends only on the normalized schema returned by
`fetch_normalized()`, never on a specific provider's response shape. Swap the
provider by setting IPO_DATA_PROVIDER / IPO_API_BASE_URL in the environment and
adding a new subclass here.

Data quality rule: missing values are represented as `None` (never silently
coerced to 0). Derived values are flagged so the UI can label them.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

logger = logging.getLogger("providers")

USER_AGENT = (
    "Mozilla/5.0 (compatible; IPOTerminal/1.0; +https://example.com) "
    "python-httpx"
)


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        return f
    except (TypeError, ValueError):
        return None


def _round2(v: Optional[float]) -> Optional[float]:
    return None if v is None else round(v, 2)


class ProviderError(Exception):
    """Raised when a provider fails; caller should fall back to cache."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class IpoDataProvider(ABC):
    name: str = "base"

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @abstractmethod
    async def fetch_normalized(self) -> list[dict]:
        """Return a list of normalized IPO dicts."""
        raise NotImplementedError


class DownstoxProvider(IpoDataProvider):
    """
    Public, unauthenticated JSON source.
      GET /api/ipo       -> structured open/upcoming/closed with per-IPO gmp
      GET /api/ipo/gmp   -> flat GMP list (used to enrich + catch listed rows)

    No official rate-limit guarantee, hence aggressive server-side caching.
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

        now_iso = datetime.now(timezone.utc).isoformat()
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

        # Derived (flagged) issue size in crore = shares * upper price band / 1e7
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
        implied_listing = _num(gmp_obj.get("estListing"))
        if implied_listing is None:
            implied_listing = _num(enrich.get("estListing"))
        gmp_label = gmp_obj.get("status") or enrich.get("status")

        segment = item.get("segment") or "Mainboard"
        ipo_type = "SME" if "sme" in segment.lower() else "Mainboard"

        status = bucket if bucket in ("open", "upcoming", "closed", "listed") else "open"

        subscription_x = _num(item.get("subscriptionX"))

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
            # Not provided by this free provider -> honestly null:
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
            },
            "subscription": {
                "total": subscription_x,
                "qib": None,
                "snii": None,
                "bnii": None,
                "nii": None,
                "retail": None,
                "employee": None,
                "shareholder": None,
                "source": self.name,
                "timestamp": now_iso,
            },
            "source": self.name,
            "fetched_at": now_iso,
        }


def get_provider(name: str, base_url: str, api_key: Optional[str]) -> IpoDataProvider:
    name = (name or "downstox").lower()
    if name == "downstox":
        return DownstoxProvider(base_url or "https://downstox.com", api_key)
    # Extend here: ipoguru, apify, etc. Default to downstox.
    logger.warning("Unknown provider '%s', defaulting to downstox", name)
    return DownstoxProvider(base_url or "https://downstox.com", api_key)
