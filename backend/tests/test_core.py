"""Unit tests for providers, allotment, and IPO filtering helpers."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

# Minimal env so importing server modules that touch dotenv is safe in isolation.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "ipo_terminal_test")

from allotment import (  # noqa: E402
    INSUFFICIENT_CATEGORY_MSG,
    compute_allotment,
    resolve_category_subscription,
)
from providers import (  # noqa: E402
    DownstoxProvider,
    NseProvider,
    _parse_issue_size_crore,
    _parse_price_band,
    get_provider,
    resolve_registrar_allotment_url,
)


# --------------------------------------------------------------------------- #
# Provider helpers / normalization
# --------------------------------------------------------------------------- #
def test_get_provider_composite_default():
    p = get_provider("composite", "", None)
    assert p.name == "composite"


def test_get_provider_downstox_preserved():
    p = get_provider("downstox", "https://downstox.com", None)
    assert p.name == "downstox"


def test_get_provider_nse():
    p = get_provider("nse", "https://www.nseindia.com", None)
    assert p.name == "nse"


def test_parse_price_band():
    low, high, text = _parse_price_band("Rs.40 to Rs.43")
    assert low == 40
    assert high == 43
    assert text is not None


def test_parse_issue_size_crore_from_million():
    assert _parse_issue_size_crore("Fresh issue aggregating up to Rs. 925 million") == 92.5


def test_registrar_allotment_url_mufg():
    url = resolve_registrar_allotment_url("MUFG Intime India Private Limited")
    assert url and "mpms.mufg.com" in url


def test_downstox_normalize_keeps_category_null():
    provider = DownstoxProvider("https://downstox.com")
    item = {
        "slug": "demo-ipo",
        "company": "Demo Ltd",
        "symbol": "DEMO",
        "series": "EQ",
        "segment": "Mainboard",
        "openDate": "2026-09-11",
        "closeDate": "2026-09-16",
        "openDateRaw": "11-Sep-2026",
        "closeDateRaw": "16-Sep-2026",
        "priceBand": "Rs.40 to Rs.43",
        "priceMin": 40,
        "priceMax": 43,
        "issueSizeShares": 10_000_000,
        "lotSize": 348,
        "subscriptionX": 2.5,
        "gmp": {"gmp": 10, "gainPct": 23.26, "estListing": 53, "norm": "demo", "status": "now"},
    }
    out = provider._normalize_item(item, "open", {}, datetime.now(timezone.utc).isoformat())
    assert out["subscription"]["total"] == 2.5
    assert out["subscription"]["qib"] is None
    assert out["subscription"]["snii"] is None
    assert out["subscription"]["bnii"] is None
    assert out["subscription"]["retail"] is None
    assert out["subscription"]["category_wise_available"] is False
    assert out["gmp"]["implied_listing_price"] == 53  # 43+10


def test_nse_parse_subscription_categories():
    provider = NseProvider()
    detail = {
        "bidDetails": [
            {"srNo": "1", "category": "QIBs", "noOfTime": "1.5"},
            {"srNo": "2", "category": "Non Institutional Investors", "noOfTime": "2.0"},
            {
                "srNo": "2.1",
                "category": "Non Institutional Investors(Bid amount of more than Ten Lakh Rupees)",
                "noOfTime": "3.0",
            },
            {
                "srNo": "2.2",
                "category": "Non Institutional Investors(Bid amount of more than Two Lakh Rupees upto Ten Lakh Rupees)",
                "noOfTime": "4.0",
            },
            {"srNo": "3", "category": "Retail Individual Investors(RIIs)", "noOfTime": "5.0"},
            {"srNo": None, "category": "Total", "noOfTime": "2.5"},
        ],
        "issueInfo": {"dataList": []},
    }
    sub = provider._parse_subscription(detail, datetime.now(timezone.utc).isoformat())
    assert sub["qib"] == 1.5
    assert sub["nii"] == 2.0
    assert sub["bnii"] == 3.0
    assert sub["snii"] == 4.0
    assert sub["retail"] == 5.0
    assert sub["total"] == 2.5
    assert sub["category_wise_available"] is True


# --------------------------------------------------------------------------- #
# GMP calculation
# --------------------------------------------------------------------------- #
def test_gmp_derived_listing_formula():
    issue_price = 100.0
    gmp = 15.0
    est_listing = issue_price + gmp
    est_gain_pct = gmp / issue_price * 100
    assert est_listing == 115.0
    assert est_gain_pct == 15.0


# --------------------------------------------------------------------------- #
# Allotment — critical behaviours
# --------------------------------------------------------------------------- #
def test_retail_with_retail_subscription():
    r = compute_allotment(
        category="retail",
        subscription_multiple=10.0,
        lot_size=100,
        price=100,
        lots=1,
    )
    assert r["reliable"] is True
    assert r["probability_pct"] == 10.0
    assert r["used_total_subscription_proxy"] is False
    assert "Estimated allotment probability" in r["disclaimer"] or "Not guaranteed" in r["disclaimer"]


def test_snii_with_snii_subscription():
    r = compute_allotment(
        category="snii",
        subscription_multiple=5.0,
        lot_size=100,
        price=100,
        lots=10,
    )
    assert r["reliable"] is True
    assert r["probability_pct"] == 20.0
    assert r["expected_shares"] == 200.0  # 1000 / 5
    assert r["used_total_subscription_proxy"] is False


def test_bnii_with_bnii_subscription():
    r = compute_allotment(
        category="bnii",
        subscription_multiple=4.0,
        lot_size=100,
        price=100,
        lots=20,
    )
    assert r["reliable"] is True
    assert r["probability_pct"] == 25.0
    assert r["expected_shares"] == 500.0


def test_category_subscription_missing():
    r = compute_allotment(
        category="retail",
        subscription_multiple=None,
        lot_size=100,
        price=100,
        lots=1,
        category_subscription_missing=True,
    )
    assert r["reliable"] is False
    assert r["probability"] is None
    assert INSUFFICIENT_CATEGORY_MSG in r["message"]
    assert r["used_total_subscription_proxy"] is False


def test_total_present_but_category_missing_must_not_proxy():
    """Case #5: total exists but retail is null — must NOT invent a probability."""
    subscription = {
        "total": 50.0,
        "qib": None,
        "snii": None,
        "bnii": None,
        "retail": None,
    }
    multiple, ok, err = resolve_category_subscription("retail", subscription, None)
    assert multiple is None
    assert ok is False
    assert err == INSUFFICIENT_CATEGORY_MSG
    r = compute_allotment(
        category="retail",
        subscription_multiple=multiple,
        lot_size=100,
        price=100,
        lots=1,
        category_subscription_missing=not ok,
    )
    assert r["reliable"] is False
    assert r.get("probability") is None
    assert r["used_total_subscription_proxy"] is False


def test_resolve_never_uses_total_for_snii():
    subscription = {"total": 99.0, "snii": None, "bnii": 12.0, "retail": 3.0}
    multiple, ok, _ = resolve_category_subscription("snii", subscription, None)
    assert ok is False
    assert multiple is None


def test_qib_not_for_individuals():
    r = compute_allotment(
        category="qib",
        subscription_multiple=10.0,
        lot_size=100,
        price=100,
        lots=1,
    )
    assert r["reliable"] is False
    assert "institution" in r["message"].lower() or "QIB" in r["message"]


# --------------------------------------------------------------------------- #
# Filtering (mirrors server keep logic)
# --------------------------------------------------------------------------- #
def _keep(ipo, **filters):
    status = filters.get("status")
    ipo_type = filters.get("ipo_type")
    min_issue_size = filters.get("min_issue_size")
    min_gmp_pct = filters.get("min_gmp_pct")
    if status and ipo.get("status") != status:
        return False
    if ipo_type and ipo.get("ipo_type") != ipo_type:
        return False
    if min_issue_size is not None:
        v = ipo.get("issue_size_crore")
        if v is None or v < min_issue_size:
            return False
    if min_gmp_pct is not None:
        v = (ipo.get("gmp") or {}).get("gmp_percent")
        if v is None or v < min_gmp_pct:
            return False
    return True


def test_first_int_from_lot_text():
    from providers import _first_int

    assert _first_int("348 Equity Shares and in multiples thereof") == 348.0
    assert _first_int("Rs. 2 per Equity Share") == 2.0


def test_cors_never_allows_star_with_credentials_helper():
    # Mirror server helper logic
    def parse(raw: str, frontend: str) -> list[str]:
        parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
        cleaned = [p for p in parts if p != "*"]
        if not cleaned:
            cleaned = [frontend]
        return cleaned

    assert "*" not in parse("*", "http://localhost:3000")
    assert parse("http://a.com, *,http://b.com", "http://localhost:3000") == [
        "http://a.com",
        "http://b.com",
    ]


def test_ipo_filter_combined():
    ipos = [
        {
            "status": "open",
            "ipo_type": "Mainboard",
            "issue_size_crore": 1500,
            "gmp": {"gmp_percent": 12},
        },
        {
            "status": "open",
            "ipo_type": "SME",
            "issue_size_crore": 1500,
            "gmp": {"gmp_percent": 12},
        },
        {
            "status": "open",
            "ipo_type": "Mainboard",
            "issue_size_crore": 500,
            "gmp": {"gmp_percent": 12},
        },
        {
            "status": "closed",
            "ipo_type": "Mainboard",
            "issue_size_crore": 1500,
            "gmp": {"gmp_percent": 12},
        },
        {
            "status": "open",
            "ipo_type": "Mainboard",
            "issue_size_crore": 1500,
            "gmp": {"gmp_percent": 5},
        },
    ]
    matched = [
        i
        for i in ipos
        if _keep(
            i,
            status="open",
            ipo_type="Mainboard",
            min_issue_size=1000,
            min_gmp_pct=10,
        )
    ]
    assert len(matched) == 1
    assert matched[0]["issue_size_crore"] == 1500
