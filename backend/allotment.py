"""
Estimated allotment probability.

This is intentionally NOT `1 / subscription`. It distinguishes retail (RII),
sNII, bNII and QIB, applies the applicable mechanics, and refuses to output a
number when the inputs are insufficient. The result is always labelled an
ESTIMATE, never a guarantee.

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


def compute_allotment(
    *,
    category: str,
    subscription_multiple: Optional[float],
    lot_size: Optional[float],
    price: Optional[float],
    lots: int = 1,
) -> dict:
    category = (category or "retail").lower()
    label = CATEGORY_LABELS.get(category, category)

    insufficient = {
        "category": category,
        "category_label": label,
        "reliable": False,
        "message": (
            "Allotment probability cannot be reliably estimated from the "
            "currently available data."
        ),
        "disclaimer": (
            "Estimated allotment probability only. Not a guarantee of allotment. "
            "Based on the applicable category allocation and available "
            "subscription data."
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

    if not lot_size or not price:
        return {
            **insufficient,
            "message": "Lot size and price are required to compute an application.",
        }

    lots = max(1, int(lots or 1))
    application_shares = lot_size * lots
    application_amount = application_shares * price

    if subscription_multiple is None or subscription_multiple <= 0:
        return {
            **insufficient,
            "application_shares": application_shares,
            "application_amount": round(application_amount, 2),
        }

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
        "disclaimer": (
            "Estimated allotment probability only. Not a guarantee of allotment."
        ),
    }

    if category == "retail":
        # Draw of lots for the minimum lot. Extra lots do not raise the odds of
        # the minimum allotment in a heavily oversubscribed retail portion.
        if sub <= 1:
            prob = 1.0
            expected_lots = lots
            note = (
                "Retail portion is not fully subscribed on the provided figure, "
                "so full allotment of your bid is likely."
            )
        else:
            prob = 1.0 / sub
            expected_lots = 1  # only the minimum lot is drawn per successful applicant
            note = (
                "Retail uses a lottery (draw of lots) for the minimum lot when "
                "oversubscribed. Applying for more lots does not increase the "
                "chance of the minimum allotment; only one application per PAN counts."
            )
        result.update(
            {
                "probability": round(min(prob, 1.0), 4),
                "probability_pct": round(min(prob, 1.0) * 100, 2),
                "expected_lots": expected_lots,
                "expected_shares": int(expected_lots * lot_size)
                if prob >= 1.0
                else round(prob * lot_size, 2),
                "method": "Retail lottery (proportionate to 1/oversubscription).",
                "note": note,
            }
        )
        return result

    if category in ("snii", "bnii"):
        # Proportionate allotment for NII sub-categories.
        expected_shares = application_shares / sub
        expected_lots = expected_shares / lot_size
        portion = "one-third (1/3)" if category == "snii" else "two-thirds (2/3)"
        result.update(
            {
                "probability": round(min(1.0 / sub, 1.0), 4),
                "probability_pct": round(min(1.0 / sub, 1.0) * 100, 2),
                "expected_shares": round(expected_shares, 2),
                "expected_lots": round(expected_lots, 3),
                "method": "Proportionate allotment across the NII sub-category.",
                "note": (
                    f"{label} is a separate NII sub-category with its own reserved "
                    f"{portion} of the NII quota. The headline subscription multiple "
                    "alone is not a direct probability of allotment; NII allotment is "
                    "proportionate, so a larger application receives a proportionally "
                    "larger expected allotment."
                ),
            }
        )
        return result

    return insufficient
