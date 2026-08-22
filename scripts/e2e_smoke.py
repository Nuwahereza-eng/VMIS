"""End-to-end backend smoke test against the running VMIS API.

Exercises the full operational flow through real HTTP calls:
auth -> user provisioning -> visitor registration -> QR verify ->
entry -> activity capture -> charges -> exit -> offline sync batch
(with idempotent replay) -> management dashboard.

Run against the docker-compose stack (api on :8000). Read-only to your
code; it only creates test data in the running database.
"""

import sys
import uuid
import urllib.request
import urllib.parse
import urllib.error
import json
from datetime import datetime, timezone

BASE = "http://localhost:8000"

_passed = 0
_failed = 0


def check(name, cond, detail=""):
    global _passed, _failed
    mark = "PASS" if cond else "FAIL"
    if cond:
        _passed += 1
    else:
        _failed += 1
    print(f"[{mark}] {name}" + (f" -- {detail}" if detail else ""))
    return cond


def _req(method, path, token=None, json_body=None, form_body=None):
    url = BASE + path
    headers = {}
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
    elif form_body is not None:
        data = urllib.parse.urlencode(form_body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body


def main():
    now = datetime.now(timezone.utc).isoformat()
    suffix = uuid.uuid4().hex[:8]

    # 1. Admin auth (management bootstrap user)
    st, tok = _req("POST", "/auth/token", form_body={
        "username": "admin", "password": "change-me-now"})
    if not check("admin login", st == 200 and tok and "access_token" in (tok or {}), f"status={st}"):
        print("Cannot continue without admin token.")
        return _summary()
    admin = tok["access_token"]

    st, me = _req("GET", "/auth/me", token=admin)
    check("admin /auth/me is management", st == 200 and me.get("role") == "management", f"role={me.get('role') if isinstance(me, dict) else me}")

    # 2. Provision a gate officer + activity officer
    gate_user = f"e2e_gate_{suffix}"
    st, gu = _req("POST", "/users", token=admin, json_body={
        "username": gate_user, "password": "gate-pass-123", "role": "gate_officer",
        "full_name": "E2E Gate Officer", "station_id": "e2e-gate"})
    check("create gate officer", st in (200, 201), f"status={st}")

    act_user = f"e2e_act_{suffix}"
    st, au = _req("POST", "/users", token=admin, json_body={
        "username": act_user, "password": "act-pass-123", "role": "activity_officer",
        "full_name": "E2E Activity Officer", "station_id": "e2e-hq"})
    check("create activity officer", st in (200, 201), f"status={st}")

    st, gt = _req("POST", "/auth/token", form_body={"username": gate_user, "password": "gate-pass-123"})
    gate = gt.get("access_token") if isinstance(gt, dict) else None
    check("gate officer login", st == 200 and gate, f"status={st}")

    st, at = _req("POST", "/auth/token", form_body={"username": act_user, "password": "act-pass-123"})
    actt = at.get("access_token") if isinstance(at, dict) else None
    check("activity officer login", st == 200 and actt, f"status={st}")

    # 3. Register a visitor (station-generated id, privacy accepted)
    visitor_id = str(uuid.uuid4())
    st, reg = _req("POST", "/visitors", token=gate, json_body={
        "id": visitor_id, "full_name": f"E2E Visitor {suffix}", "id_number": f"ID{suffix}",
        "nationality": "Uganda", "category": "EAC",
        "privacy_notice_accepted": True, "origin_station_id": "e2e-gate",
        "client_created_at": now})
    check("register visitor", st in (200, 201) and reg.get("visitor", {}).get("id") == visitor_id, f"status={st}")

    # privacy notice enforcement
    st, bad = _req("POST", "/visitors", token=gate, json_body={
        "full_name": "No Consent", "id_number": f"NC{suffix}",
        "category": "EAC", "privacy_notice_accepted": False})
    check("register rejected without privacy consent", st >= 400, f"status={st}")

    # idempotent replay of the same visitor id
    st, reg2 = _req("POST", "/visitors", token=gate, json_body={
        "id": visitor_id, "full_name": f"E2E Visitor {suffix}", "id_number": f"ID{suffix}",
        "nationality": "Uganda", "category": "EAC",
        "privacy_notice_accepted": True})
    check("visitor register idempotent replay", st in (200, 201) and reg2.get("idempotent") is True, f"idempotent={reg2.get('idempotent') if isinstance(reg2, dict) else reg2}")

    # 4. QR verify (payload format VMIS:1:<uuid>)
    st, ver = _req("POST", "/visitors/verify", token=gate, json_body={"payload": f"VMIS:1:{visitor_id}"})
    check("QR verify resolves visitor", st == 200 and ver.get("found") and ver.get("visitor", {}).get("id") == visitor_id, f"status={st} found={ver.get('found') if isinstance(ver, dict) else ver}")

    st, badv = _req("POST", "/visitors/verify", token=gate, json_body={"payload": "NOTVMIS:x"})
    check("QR verify rejects malformed payload", st >= 400 or (isinstance(badv, dict) and badv.get("found") is False), f"status={st}")

    # 5. Record entry
    visit_id = str(uuid.uuid4())
    st, ent = _req("POST", "/visits", token=gate, json_body={
        "id": visit_id, "visitor_id": visitor_id, "ticket_number": f"TK{suffix}",
        "nights_purchased": 2, "entry_gate": "e2e-gate", "entry_timestamp": now})
    check("record entry", st in (200, 201) and ent.get("visit", {}).get("id") == visit_id, f"status={st}")
    ticket = ent.get("visit", {}).get("ticket", {}) if isinstance(ent, dict) else {}
    check("ticket validity derived", str(ticket.get("status", "")).lower() in ("valid", "active", "expired") and ticket.get("remaining_seconds", 0) > 0, f"ticket={ticket}")

    # open visits list includes ours
    st, openv = _req("GET", "/visits/open", token=gate)
    check("open visits lists new entry", st == 200 and any(v.get("id") == visit_id for v in (openv or [])), f"status={st} count={len(openv) if isinstance(openv, list) else 'n/a'}")

    # 6. Activities catalogue + capture
    st, cat = _req("GET", "/activities", token=actt)
    check("activities catalogue", st == 200 and isinstance(cat, list) and len(cat) > 0, f"status={st} n={len(cat) if isinstance(cat, list) else 'n/a'}")
    activity_id = cat[0]["id"] if isinstance(cat, list) and cat else None

    if activity_id:
        st, cap = _req("POST", f"/visitors/{visitor_id}/activities", token=actt, json_body={
            "activity_id": activity_id, "quantity": 2, "origin_station_id": "e2e-hq"})
        check("capture activity", st in (200, 201) and cap.get("activity", {}).get("quantity") == 2, f"status={st}")

        st, charges = _req("GET", f"/visitors/{visitor_id}/charges", token=actt)
        check("charges summary computed", st == 200 and any(a.get("quantity") == 2 for a in charges.get("activities", [])), f"status={st}")

    # 7. Record exit
    st, ex = _req("POST", f"/visits/{visit_id}/exit", token=gate, json_body={
        "exit_gate": "e2e-gate", "exit_timestamp": now})
    check("record exit", st in (200, 201), f"status={st}")

    st, openv2 = _req("GET", "/visits/open", token=gate)
    check("visit closed after exit", st == 200 and not any(v.get("id") == visit_id for v in (openv2 or [])), f"status={st}")

    # 8. Offline sync batch: replay a fresh visitor+visit via /sync/batch, then re-send for idempotency
    sync_visitor = str(uuid.uuid4())
    sync_visit = str(uuid.uuid4())
    op1 = str(uuid.uuid4())
    op2 = str(uuid.uuid4())
    batch = {
        "station_id": "e2e-gate",
        "operations": [
            {"op_id": op1, "entity_type": "visitor", "entity_id": sync_visitor, "payload": {
                "id": sync_visitor, "full_name": f"Sync Visitor {suffix}", "id_number": f"SY{suffix}",
                "nationality": "Kenya", "category": "EAC",
                "privacy_notice_accepted": True, "origin_station_id": "e2e-gate",
                "client_created_at": now}},
            {"op_id": op2, "entity_type": "visit", "entity_id": sync_visit, "payload": {
                "id": sync_visit, "visitor_id": sync_visitor, "ticket_number": f"SYTK{suffix}",
                "nights_purchased": 1, "entry_gate": "e2e-gate", "entry_timestamp": now,
                "origin_station_id": "e2e-gate"}},
        ],
    }
    st, res = _req("POST", "/sync/batch", token=gate, json_body=batch)
    ok = st == 200 and res.get("processed") == 2 and res.get("applied") == 2
    check("sync batch applies operations", ok, f"status={st} processed={res.get('processed') if isinstance(res, dict) else res} applied={res.get('applied') if isinstance(res, dict) else ''}")

    # replay the exact same batch -> all duplicates, nothing re-applied
    st, res2 = _req("POST", "/sync/batch", token=gate, json_body=batch)
    ok2 = st == 200 and res2.get("duplicates") == 2 and res2.get("applied") == 0
    check("sync batch idempotent replay (zero duplicates written)", ok2, f"status={st} duplicates={res2.get('duplicates') if isinstance(res2, dict) else res2} applied={res2.get('applied') if isinstance(res2, dict) else ''}")

    # 9. Management dashboard reflects activity
    st, dash = _req("GET", "/management/dashboard", token=admin)
    check("management dashboard", st == 200 and "inside_now" in (dash or {}), f"status={st}")
    check("dashboard has station sync health", st == 200 and isinstance(dash.get("stations"), list), f"stations={type(dash.get('stations')).__name__ if isinstance(dash, dict) else dash}")

    # 10. RBAC: gate officer cannot read management dashboard
    st, forbidden = _req("GET", "/management/dashboard", token=gate)
    check("RBAC blocks gate officer from dashboard", st in (401, 403), f"status={st}")

    return _summary()


def _summary():
    print("\n" + "=" * 48)
    print(f"RESULT: {_passed} passed, {_failed} failed")
    print("=" * 48)
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
