"""
Estimated allotment probability.

This is intentionally NOT `1 / subscription`. It distinguishes retail (RII),
sNII, bNII and QIB, applies the applicable mechanics, and refuses to output a
number when the inputs are insufficient. The result is always labelled an
ESTIMATE, never a guarantee.

CRITICAL: Never silently use TOTAL subscription as a proxy for a category
calculation. Callers must pass the category-specific subscription multiple.

Categories (SEBI framework, current mainboard structure):
  - RII (retail):  lottery / draw of lots for the minimum lot when
                   oversubscribed. Chance per application ~ 1 / oversubscription.
                   You either get the minimum bid lot or nothing.
  - sNII:          NII sub-category for applications between ~ Rs.2L and Rs.10L.
                   Proportionate allotment; sNII gets 1/3 of the NII portion.
  - bNII:          NII sub-category for applications >= ~ Rs.10L.
                   Proportionate allotment; bNII gets 2/3 of the NII portion.
  - QIB:           institutional; not applicable to individual applicants.
"""
from __future__ import annotations

from typing import Optional

CATEGORY_LABELS = {
    "retail": "Retail (RII)",
    "snii": "Small NII (sNII)",
    "bnii": "Big NII (bNII)",
    "qib": "QIB",
}

CATEGORY_SUB_KEYS = {
    "retail": "retail",
    "snii": "snii",
    "bnii": "bnii",
    "qib": "qib",
}

INSUFFICIENT_CATEGORY_MSG = (
    "Reliable allotment probability cannot be calculated because "
    "category-specific subscription data is unavailable."
)


def resolve_category_subscription(
    category: str,
    subscription: Optional[dict],
    override: Optional[float] = None,
) -> tuple[Optional[float], bool, Optional[str]]:
    """
    Resolve the subscription multiple for a category.

    Returns (multiple, reliable, error_message).
    Never falls back to total subscription for category estimates.
    """
    if override is not None:
        if override <= 0:
            return None, False, INSUFFICIENT_CATEGORY_MSG
        return override, True, None

    category = (category or "retail").lower()
    sub = subscription or {}
    key = CATEGORY_SUB_KEYS.get(category)
    if not key:
        return None, False, INSUFFICIENT_CATEGORY_MSG
    value = sub.get(key)
    if value is None or value <= 0:
        return None, False, INSUFFICIENT_CATEGORY_MSG
    return float(value), True, None


def compute_allotment(
    *,
    category: str,
    subscription_multiple: Optional[float],
    lot_size: Optional[float],
    price: Optional[float],
    lots: int = 1,
    category_subscription_missing: bool = False,
) -> dict:
    category = (category or "retail").lower()
    label = CATEGORY_LABELS.get(category, category)

    insufficient = {
        "category": category,
        "category_label": label,
        "reliable": False,
        "probability": None,
        "probability_pct": None,
        "used_total_subscription_proxy": False,
        "message": (
            "Allotment probability cannot be reliably estimated from the "
            "currently available data."
        ),
        "disclaimer": (
            "Estimated allotment probability only. Not guaranteed. "
            "Based on the applicable category allocation and available "
            "category-specific subscription data. Headline total subscription "
            "is not the same as an individual allotment probability."
        ),
    }

    if category == "qib":
        return {
            **insufficient,
            "message": (
                "QIB allotment is discretionary/proportionate for institutions "
                "and does not apply to individual retail/HNI applicants."
            ),
        }

    if category_subscription_missing or subscription_multiple is None:
        result = {
            **insufficient,
            "message": INSUFFICIENT_CATEGORY_MSG,
        }
        if lot_size and price:
            lots_n = max(1, int(lots or 1))
            result["lots"] = lots_n
            result["lot_size"] = lot_size
            result["price"] = price
            result["application_shares"] = lot_size * lots_n
            result["application_amount"] = round(lot_size * lots_n * price, 2)
        return result

    if not lot_size or not price:
        return {
            **insufficient,
            "message": "Lot size and price are required to compute an application.",
        }

    lots = max(1, int(lots or 1))
    application_shares = lot_size * lots
    application_amount = application_shares * price

    if subscription_multiple <= 0:
        result = {
            **insufficient,
            "application_shares": application_shares,
            "application_amount": round(application_amount, 2),
            "lots": lots,
            "lot_size": lot_size,
            "price": price,
            "message": INSUFFICIENT_CATEGORY_MSG,
        }
        return result

    sub = subscription_multiple
    result = {
        "category": category,
        "category_label": label,
        "reliable": True,
        "subscription_multiple": round(sub, 2),
        "lots": lots,
        "lot_size": lot_size,
        "price": price,
        "application_shares": application_shares,
        "application_amount": round(application_amount, 2),
        "used_total_subscription_proxy": False,
        "disclaimer": (
            "Estimated allotment probability only. Not guaranteed."
        ),
    }

    if category == "retail":
        # Draw of lots for the minimum lot. Extra lots do not raise the odds of
        # the minimum allotment in a heavily oversubscribed retail portion.
        if sub <= 1:
            prob = 1.0
            expected_lots = lots
            note = (
                "Retail portion is not fully subscribed on the provided "
                "category figure, so full allotment of your bid is likely. "
                "Retail uses a lottery (draw of lots) for the minimum lot when "
                "oversubscribed; applying for more lots does not increase the "
                "chance of receiving the minimum allotment — only one "
                "application per PAN counts."
            )
        else:
            prob = 1.0 / sub
            expected_lots = 1  # only the minimum lot is drawn per successful applicant
            note = (
                "Retail (RII) uses a lottery (draw of lots) for the minimum bid "
                "lot when oversubscribed. Estimated chance ≈ 1 / retail "
                "subscription. Applying for more lots does not increase the "
                "chance of the minimum allotment; only one application per PAN "
                "counts. Headline total subscription is not your retail "
                "allotment probability."
            )
        result.update(
            {
                "probability": round(min(prob, 1.0), 4),
                "probability_pct": round(min(prob, 1.0) * 100, 2),
                "expected_lots": expected_lots,
                "expected_shares": int(expected_lots * lot_size)
                if prob >= 1.0
                else round(prob * lot_size, 2),
                "method": (
                    "Retail lottery: estimated probability ≈ 1 / retail "
                    "oversubscription for the minimum lot."
                ),
                "note": note,
            }
        )
        return result

    if category in ("snii", "bnii"):
        # Proportionate allotment within the NII sub-category using THAT
        # sub-category's own subscription multiple — never total or NII-total
        # alone when sNII/bNII is requested.
        expected_shares = application_shares / sub
        expected_lots = expected_shares / lot_size
        portion = "one-third (1/3)" if category == "snii" else "two-thirds (2/3)"
        result.update(
            {
                "probability": round(min(1.0 / sub, 1.0), 4),
                "probability_pct": round(min(1.0 / sub, 1.0) * 100, 2),
                "expected_shares": round(expected_shares, 2),
                "expected_lots": round(expected_lots, 3),
                "method": (
                    "Proportionate allotment within the NII sub-category using "
                    f"the {label} subscription multiple."
                ),
                "note": (
                    f"{label} is a separate NII sub-category with its own reserved "
                    f"{portion} of the NII quota. Allotment is proportionate to "
                    "shares applied within that sub-category, so a larger "
                    "application receives a proportionally larger expected "
                    "allotment — but that is not a guaranteed allotment. "
                    "Headline total subscription is not the same as this "
                    "category probability."
                ),
            }
        )
        return result

    return insufficient
