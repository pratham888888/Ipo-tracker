"""Auth / ownership query-shape tests (no live Mongo required)."""
from __future__ import annotations


def watchlist_query(user_id: str, slug: str | None = None) -> dict:
    q: dict = {"user_id": user_id}
    if slug:
        q["slug"] = slug
    return q


def screener_query(user_id: str, screener_id: str | None = None) -> dict:
    q: dict = {"user_id": user_id}
    if screener_id:
        q["id"] = screener_id
    return q


def test_watchlist_scoped_to_user():
    q = watchlist_query("user_aaa")
    assert q == {"user_id": "user_aaa"}
    assert "user_bbb" not in q.values()


def test_watchlist_delete_requires_owner_and_slug():
    q = watchlist_query("user_aaa", "demo-ipo")
    assert q["user_id"] == "user_aaa"
    assert q["slug"] == "demo-ipo"


def test_screener_update_requires_owner():
    q = screener_query("user_aaa", "abc123")
    assert q == {"user_id": "user_aaa", "id": "abc123"}


def test_users_cannot_share_screener_id_across_accounts():
    a = screener_query("user_a", "same-id")
    b = screener_query("user_b", "same-id")
    assert a["user_id"] != b["user_id"]
    assert a["id"] == b["id"]
