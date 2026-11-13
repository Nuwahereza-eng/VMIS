"""Visitor tour tracking (VMIS tracking feature, section 6).

All coordinates are synthetic: small offsets around 0,0 in the open Atlantic,
never real places. Points of interest are created per test.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.base import utcnow
from app.models.tracking import LocationPoint, PoiAlert, PointOfInterest, VisitSession
from app.qr import build_qr_payload
from app.retention import enforce_location_retention
from tests.conftest import auth_header

ORIGIN = (0.0100, -0.0100)  # synthetic


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _visitor_with_entry(client, token, *, id_number="SYN-1001", nights=2, entry_at=None, name="Synthetic Visitor"):
    v = client.post(
        "/visitors",
        headers=auth_header(token),
        json={"full_name": name, "id_number": id_number, "category": "FNR", "privacy_notice_accepted": True},
    ).json()["visitor"]
    body = {"visitor_id": v["id"], "ticket_number": f"T-{id_number}", "nights_purchased": nights, "entry_gate": "Tangi Gate"}
    if entry_at:
        body["entry_timestamp"] = iso(entry_at)
    visit = client.post("/visits", headers=auth_header(token), json=body)
    assert visit.status_code == 201, visit.text
    return v, visit.json()["visit"]


def _link(client, identifier=None, *, token=None, **extra):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/tour/link", headers=headers, json={"identifier": identifier, **extra})


def _point(session_id, *, at, lat=ORIGIN[0], lng=ORIGIN[1], point_id=None):
    pid = str(point_id or uuid.uuid4())
    return {
        "op_id": str(uuid.uuid4()),
        "entity_type": "location_point",
        "entity_id": pid,
        "payload": {"id": pid, "session_id": session_id, "latitude": lat, "longitude": lng, "accuracy": 12.0, "recorded_at": iso(at)},
    }


def _sync(client, tour_token, ops):
    resp = client.post("/tour/sync", headers={"Authorization": f"Bearer {tour_token}"}, json={"operations": ops})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _count(db_session, model, **where):
    q = db_session.query(model)
    for k, v in where.items():
        q = q.filter(getattr(model, k) == v)
    return q.count()


@pytest.fixture
def linked(client, gate_officer_token):
    """A walk-in visitor with an open entry, linked with consent."""
    v, visit = _visitor_with_entry(client, gate_officer_token)
    resp = _link(client, build_qr_payload(uuid.UUID(v["id"])), gate="Tangi Gate", consent_given=True, consent_at=iso(utcnow() - timedelta(minutes=5)))
    assert resp.status_code == 200, resp.text
    return v, visit, resp.json()


# --- Check-in ---------------------------------------------------------------


def test_scan_links_to_the_right_ticket_and_one_session_per_ticket(client, gate_officer_token, db_session):
    v, visit = _visitor_with_entry(client, gate_officer_token)
    _visitor_with_entry(client, gate_officer_token, id_number="SYN-2002", name="Someone Else")

    first = _link(client, build_qr_payload(uuid.UUID(v["id"])), gate="Tangi Gate").json()
    assert first["ticket"]["kind"] == "visit"
    assert first["ticket"]["holder_name"] == "Synthetic Visitor"
    assert first["ticket"]["ticket_code"] == visit["ticket_number"]

    # Second scan of the same ticket (bare-id QR form) joins the same session.
    second = _link(client, v["id"]).json()
    assert second["session"]["id"] == first["session"]["id"]
    assert _count(db_session, VisitSession, ticket_id=uuid.UUID(visit["id"])) == 1


def test_offline_created_session_keeps_its_id(client, gate_officer_token):
    v, _ = _visitor_with_entry(client, gate_officer_token)
    local_id = str(uuid.uuid4())
    started = utcnow() - timedelta(minutes=20)
    body = _link(client, build_qr_payload(uuid.UUID(v["id"])), session_id=local_id, started_at=iso(started)).json()
    assert body["session"]["id"] == local_id
    assert body["session"]["started_at"].startswith(started.strftime("%Y-%m-%dT%H:%M"))


def test_short_code_needs_matching_id_number(client, gate_officer_token):
    v, _ = _visitor_with_entry(client, gate_officer_token, id_number="SYN-3003")
    code = "VM-" + uuid.UUID(v["id"]).hex[:8].upper()
    assert _link(client, code).status_code == 422
    assert _link(client, code, id_number="WRONG").status_code == 403
    assert _link(client, code, id_number="syn-3003").status_code == 200


def test_booking_ticket_links(client, gate_officer_token):
    b = client.post(
        "/bookings",
        headers=auth_header(gate_officer_token),
        json={"full_name": "Synthetic Booker", "intended_date": utcnow().date().isoformat(), "category": "FNR"},
    ).json()
    code = client.post(f"/bookings/{b['id']}/pay", headers=auth_header(gate_officer_token), json={}).json()["ticket_code"]
    body = _link(client, code.lower()).json()
    assert body["ticket"]["kind"] == "booking"
    assert body["ticket"]["holder_name"] == "Synthetic Booker"


def test_no_open_entry_cannot_link(client, gate_officer_token):
    v = client.post(
        "/visitors",
        headers=auth_header(gate_officer_token),
        json={"full_name": "No Entry", "id_number": "SYN-4004", "category": "FNR", "privacy_notice_accepted": True},
    ).json()["visitor"]
    assert _link(client, v["id"]).status_code == 409


def test_staff_minted_link_opens_the_ticket(client, gate_officer_token):
    v, visit = _visitor_with_entry(client, gate_officer_token)
    minted = client.post("/tracking/tour-token", headers=auth_header(gate_officer_token), json={"visitor_id": v["id"]})
    assert minted.status_code == 200, minted.text
    body = _link(client, token=minted.json()["token"]).json()
    assert body["ticket"]["ticket_code"] == visit["ticket_number"]


# --- Consent ----------------------------------------------------------------


def test_consent_declined_stores_zero_points(client, gate_officer_token, db_session):
    v, _ = _visitor_with_entry(client, gate_officer_token)
    body = _link(client, v["id"], consent_given=False, consent_at=iso(utcnow())).json()
    sid = body["session"]["id"]
    result = _sync(client, body["token"], [_point(sid, at=utcnow()) for _ in range(3)])
    assert [r["exception_kind"] for r in result["results"]] == ["no_consent"] * 3
    assert _count(db_session, LocationPoint, session_id=uuid.UUID(sid)) == 0


def test_consent_given_later_only_admits_later_points(client, gate_officer_token, db_session):
    v, _ = _visitor_with_entry(client, gate_officer_token)
    body = _link(client, v["id"]).json()
    sid = body["session"]["id"]
    now = utcnow()
    consent = {"op_id": str(uuid.uuid4()), "entity_type": "session_consent", "entity_id": sid, "payload": {"given": True, "at": iso(now)}}
    result = _sync(client, body["token"], [consent, _point(sid, at=now - timedelta(minutes=1)), _point(sid, at=now + timedelta(seconds=1))])
    kinds = sorted(str(r["exception_kind"]) for r in result["results"])
    assert kinds == ["None", "None", "no_consent"]
    assert _count(db_session, LocationPoint, session_id=uuid.UUID(sid)) == 1


# --- Offline recording and sync ----------------------------------------------


def test_points_recorded_offline_all_arrive(client, linked, db_session):
    _, _, body = linked
    sid = body["session"]["id"]
    start = utcnow() - timedelta(minutes=4)
    ops = [_point(sid, at=start + timedelta(seconds=10 * i), lat=ORIGIN[0] + i * 0.001) for i in range(20)]
    result = _sync(client, body["token"], ops)
    assert result["applied"] == 20
    assert _count(db_session, LocationPoint, session_id=uuid.UUID(sid)) == 20


def test_uploading_the_same_batch_twice_creates_no_duplicates(client, linked, db_session):
    _, _, body = linked
    sid = body["session"]["id"]
    ops = [_point(sid, at=utcnow() - timedelta(seconds=i)) for i in range(5)]
    assert _sync(client, body["token"], ops)["applied"] == 5
    again = _sync(client, body["token"], ops)
    assert again["duplicates"] == 5 and again["applied"] == 0
    # Same point under a new op id (e.g. re-queued) is still not stored twice.
    requeued = [dict(op, op_id=str(uuid.uuid4())) for op in ops]
    assert all(r["result"] == "exists" for r in _sync(client, body["token"], requeued)["results"])
    assert _count(db_session, LocationPoint, session_id=uuid.UUID(sid)) == 5


def test_poi_alerts_upload_idempotently(client, linked, db_session):
    _, _, body = linked
    sid = body["session"]["id"]
    poi = PointOfInterest(name="Synthetic POI", kind="facility", latitude=0.01, longitude=-0.01, radius_m=100, is_active=True)
    db_session.add(poi)
    db_session.commit()
    aid = str(uuid.uuid4())
    op = {"op_id": str(uuid.uuid4()), "entity_type": "poi_alert", "entity_id": aid, "payload": {"id": aid, "session_id": sid, "poi_id": str(poi.id), "shown_at": iso(utcnow())}}
    assert _sync(client, body["token"], [op])["applied"] == 1
    assert _sync(client, body["token"], [op])["duplicates"] == 1
    assert _count(db_session, PoiAlert, session_id=uuid.UUID(sid)) == 1


# --- Exit and expiry -----------------------------------------------------------


def test_exit_closes_session_and_rejects_later_points(client, gate_officer_token, linked, db_session):
    _, visit, body = linked
    sid, token = body["session"]["id"], body["token"]
    before_exit = utcnow() - timedelta(seconds=30)

    exit_resp = client.post(f"/visits/{visit['id']}/exit", headers=auth_header(gate_officer_token), json={"exit_gate": "Tangi Gate"})
    assert exit_resp.status_code == 200, exit_resp.text

    state = client.get("/tour/session", headers={"Authorization": f"Bearer {token}"}).json()
    assert state["session"]["ended_at"] is not None
    assert state["session"]["end_reason"] == "exit"

    result = _sync(client, token, [_point(sid, at=before_exit), _point(sid, at=utcnow() + timedelta(minutes=1))])
    outcomes = sorted(str(r["exception_kind"]) for r in result["results"])
    assert outcomes == ["None", "session_closed"]  # recorded before exit: kept; after: refused
    assert _count(db_session, LocationPoint, session_id=uuid.UUID(sid)) == 1
    # A closed ticket cannot be linked again.
    assert _link(client, token=token).status_code == 409


def test_offline_station_exit_also_closes(client, gate_officer_token, linked):
    _, visit, body = linked
    op = {"op_id": str(uuid.uuid4()), "entity_type": "visit_exit", "entity_id": visit["id"], "payload": {"exit_gate": "Tangi Gate", "exit_timestamp": iso(utcnow())}}
    client.post("/sync/batch", headers=auth_header(gate_officer_token), json={"station_id": "GATE-A", "operations": [op]})
    state = client.get("/tour/session", headers={"Authorization": f"Bearer {body['token']}"}).json()
    assert state["session"]["end_reason"] == "exit"


def test_ticket_expiry_ends_tracking(client, gate_officer_token):
    v, _ = _visitor_with_entry(client, gate_officer_token, nights=1, entry_at=utcnow() - timedelta(hours=30))
    assert _link(client, v["id"]).status_code == 409


# --- Access -------------------------------------------------------------------


def test_visitor_token_cannot_touch_another_visitors_session(client, gate_officer_token, db_session):
    a, _ = _visitor_with_entry(client, gate_officer_token, id_number="SYN-A")
    b, _ = _visitor_with_entry(client, gate_officer_token, id_number="SYN-B")
    token_a = _link(client, a["id"], consent_given=True, consent_at=iso(utcnow())).json()["token"]
    session_b = _link(client, b["id"], consent_given=True, consent_at=iso(utcnow())).json()["session"]["id"]

    result = _sync(client, token_a, [_point(session_b, at=utcnow())])
    assert result["results"][0]["exception_kind"] == "forbidden_session"
    assert _count(db_session, LocationPoint, session_id=uuid.UUID(session_b)) == 0

    # A visitor token is not a staff login, and a staff login is not a visitor link.
    assert client.get("/visitors", headers={"Authorization": f"Bearer {token_a}"}).status_code == 401
    assert client.post("/tour/sync", headers=auth_header(gate_officer_token), json={"operations": []}).status_code == 401


def test_live_view_needs_the_location_permission(client, admin_token, gate_officer_token, activity_officer_token):
    assert client.get("/tracking/live", headers=auth_header(gate_officer_token)).status_code == 403
    assert client.get("/tracking/live", headers=auth_header(activity_officer_token)).status_code == 403
    assert client.get("/tracking/poi-summary", headers=auth_header(gate_officer_token)).status_code == 403
    assert client.get("/tracking/live", headers=auth_header(admin_token)).status_code == 200


# --- Management view ---------------------------------------------------------


def test_live_view_path_and_busy_areas(client, admin_token, linked):
    v, _, body = linked
    sid = body["session"]["id"]
    now = utcnow()
    _sync(client, body["token"], [
        _point(sid, at=now - timedelta(minutes=3), lat=0.0200),
        _point(sid, at=now - timedelta(minutes=1), lat=0.0300, lng=-0.0300),
    ])
    poi = client.post("/tracking/pois", headers=auth_header(admin_token), json={
        "name": "Synthetic area", "kind": "facility", "latitude": 0.0300, "longitude": -0.0300, "radius_m": 200,
    })
    assert poi.status_code == 201, poi.text

    live = client.get("/tracking/live", headers=auth_header(admin_token)).json()
    row = next(r for r in live if r["session_id"] == sid)
    assert row["holder_name"] == "Synthetic Visitor"
    assert row["latitude"] == pytest.approx(0.0300)  # newest point, not newest upload
    assert 50 <= row["age_seconds"] <= 120
    assert row["stale"] is False

    assert client.get("/tracking/live?gate=Other+Gate", headers=auth_header(admin_token)).json() == []
    assert client.get("/tracking/live?category=EAC", headers=auth_header(admin_token)).json() == []
    assert client.get("/tracking/live?min_age_minutes=10", headers=auth_header(admin_token)).json() == []

    path = client.get(f"/tracking/sessions/{sid}/path", headers=auth_header(admin_token)).json()
    assert [round(p["latitude"], 4) for p in path["points"]] == [0.02, 0.03]

    busy = client.get("/tracking/poi-summary", headers=auth_header(admin_token)).json()
    assert next(b for b in busy if b["name"] == "Synthetic area")["visitors_near"] == 1


def test_quiet_session_raises_stale_alert(client, admin_token, gate_officer_token, db_session):
    v, _ = _visitor_with_entry(client, gate_officer_token)
    long_ago = utcnow() - timedelta(minutes=90)
    body = _link(client, v["id"], consent_given=True, consent_at=iso(long_ago), started_at=iso(long_ago)).json()
    _sync(client, body["token"], [_point(body["session"]["id"], at=long_ago + timedelta(minutes=1))])
    alerts = client.get("/management/alerts", headers=auth_header(admin_token)).json()
    stale = [a for a in alerts if a["kind"] == "tracking_stale"]
    assert len(stale) == 1
    assert stale[0]["session_id"] == body["session"]["id"]
    assert "No location update" in stale[0]["detail"]


def test_points_of_interest_are_management_only_and_seeded_as_placeholders(client, admin_token, gate_officer_token):
    assert client.get("/tracking/pois", headers=auth_header(gate_officer_token)).status_code == 403
    pois = client.get("/tracking/pois", headers=auth_header(admin_token)).json()
    seeded = [p for p in pois if p["name"].startswith("PLACEHOLDER")]
    assert len(seeded) == 2
    assert all(not p["is_active"] for p in seeded)
    # Inactive placeholders are never sent to a visitor's phone.
    v, _ = _visitor_with_entry(client, gate_officer_token)
    assert all(not p["name"].startswith("PLACEHOLDER") for p in _link(client, v["id"]).json()["points_of_interest"])


# --- Retention -----------------------------------------------------------------


def test_retention_deletes_old_points(client, linked, db_session):
    _, _, body = linked
    sid = uuid.UUID(body["session"]["id"])
    now = utcnow()
    old, recent = uuid.uuid4(), uuid.uuid4()
    for pid, at in ((old, now - timedelta(days=31)), (recent, now - timedelta(days=1))):
        db_session.add(LocationPoint(id=pid, session_id=sid, latitude=0.01, longitude=-0.01, accuracy=5, recorded_at=at, received_at=at))
    db_session.commit()

    result = enforce_location_retention(db_session, now=now)
    db_session.commit()
    assert result.points_deleted == 1
    assert db_session.get(LocationPoint, old) is None
    assert db_session.get(LocationPoint, recent) is not None
