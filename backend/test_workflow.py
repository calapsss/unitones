"""Real PostgreSQL integration tests in an isolated, disposable test database."""

import copy, uuid
from datetime import date, timedelta
import psycopg, pytest
from psycopg import sql
from psycopg.types.json import Jsonb
from fastapi.testclient import TestClient
import main


@pytest.fixture()
def client(monkeypatch):
    admin = psycopg.connect(main.DB, autocommit=True)
    name = "readiness_test_" + uuid.uuid4().hex[:12]
    admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    url = main.DB.rsplit("/", 1)[0] + "/" + name
    monkeypatch.setattr(main, "DB", url)
    try:
        with TestClient(main.app) as client:
            with main.connect() as c:
                c.execute(
                    "INSERT INTO units(id,name,reporting) VALUES('PAF','Root',false)"
                )
                c.execute(
                    "INSERT INTO units(id,name,parent_id,reporting) VALUES('CMD','Command','PAF',false),('OTHER','Other','PAF',false)"
                )
                c.execute(
                    "INSERT INTO units(id,name,parent_id) VALUES('U1','First','CMD'),('U2','Second','CMD'),('U3','Third','OTHER')"
                )
                for i, unit in enumerate(["U1", "U1", "U1", "U2", "U3"]):
                    c.execute(
                        "INSERT INTO personnel(id,unit_id,name,rank,category,source) VALUES(%s,%s,%s,%s,%s,%s)",
                        (
                            f"p{i}",
                            unit,
                            f"Example {i}",
                            "SGT",
                            "EP",
                            Jsonb({"system": "test"}),
                        ),
                    )
            yield client
    finally:
        admin.execute(
            sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
        )
        admin.close()


DAY = "2026-09-01"


def login(c, unit):
    assert c.post("/session", json={"workspace": unit}).status_code == 200


def payload(rev=0, publish=True):
    return dict(
        day=DAY,
        expected_revision=rev,
        publish=publish,
        reason="Unit accountability",
        entries=[
            {"id": "p0", "status": "available"},
            {"id": "p1", "status": "passes"},
            {"id": "p2", "status": "mwb"},
        ],
    )


def dashboard(c, root="CMD", day=DAY):
    r = c.get("/dashboard", params={"root": root, "day": day})
    assert r.status_code == 200, r.text
    return r.json()


def test_draft_publication_correction_and_history(client):
    c = client
    login(c, "U1")
    data = payload(publish=False)
    first = c.post("/units/U1/return", json=data)
    assert first.status_code == 200, first.text
    login(c, "CMD")
    d = dashboard(c)
    assert d["coverage"] == {"reported": 0, "expected": 2, "baseline": 4}
    assert d["metrics"]["assigned"] == 0
    login(c, "U1")
    data.update(expected_revision=1, publish=True)
    published = c.post("/units/U1/return", json=data)
    assert published.status_code == 200, published.text
    login(c, "CMD")
    d = dashboard(c)
    assert d["metrics"]["assigned"] == 3
    assert d["metrics"]["available"] == 1
    assert d["metrics"]["unresolved"] == 1
    assert d["metrics"]["rate"] is None
    assert not d["complete"]
    login(c, "U1")
    data.update(expected_revision=2, publish=False)
    data["entries"][1]["status"] = "available"
    assert c.post("/units/U1/return", json=data).status_code == 200
    login(c, "CMD")
    assert dashboard(c)["metrics"]["available"] == 1
    assert dashboard(c)["units"][0]["newer_draft"]
    login(c, "U1")
    data.update(expected_revision=3, publish=True)
    r = c.post("/units/U1/return", json=data)
    assert r.status_code == 200
    login(c, "CMD")
    assert dashboard(c)["metrics"]["available"] == 2
    old = c.get("/history/" + str(published.json()["id"])).json()
    assert old["entries"][1]["status"] == "passes"
    assert old["submission_metrics"]["available"] == 1
    assert dashboard(c, day="2026-09-02")["metrics"]["assigned"] == 0
    with main.connect() as db:
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute("DELETE FROM returns")


def test_ownership_conflicts_and_validation(client):
    c = client
    assert c.get("/dashboard", params={"day": DAY}).status_code == 401
    login(c, "U1")
    assert c.post("/units/U2/return", json=payload()).status_code == 403
    assert c.get("/units/U3/return", params={"day": DAY}).status_code == 403
    assert c.get("/dashboard", params={"day": DAY, "root": "CMD"}).status_code == 403
    data = payload()
    assert c.post("/units/U1/return", json=data).status_code == 200
    assert c.post("/units/U1/return", json=data).status_code == 409
    data["expected_revision"] = 1
    data["entries"].append(data["entries"][0])
    assert c.post("/units/U1/return", json=data).status_code == 422
    data = payload(1)
    data["entries"][0]["status"] = "not_assigned"
    assert c.post("/units/U1/return", json=data).status_code == 422
    data["entries"][0]["note"] = "Transferred under sample authority"
    data["entries"][1]["rank"] = "TSG"
    data["entries"][1]["category"] = "Officer"
    assert c.post("/units/U1/return", json=data).status_code == 200
    login(c, "CMD")
    m = dashboard(c)["metrics"]
    assert m["assigned"] == 2
    assert m["categories"]["Officer"] == 1
    assert m["ranks"]["TSG"] == 1
    assert c.post("/units/U1/return", json=payload(2)).status_code == 403


def test_policy_version_recompute_and_export(client):
    c = client
    login(c, "U1")
    r = c.post("/units/U1/return", json=payload())
    assert r.status_code == 200
    p = dict(
        expected_version=1,
        mwb_label="MWB decision for test",
        mwb_available=False,
        passes_available=False,
        reason="Test authority",
    )
    assert c.post("/policy", json=p).status_code == 403
    login(c, "PAF")
    assert c.post("/policy", json=p).status_code == 200
    assert c.post("/policy", json=p).status_code == 409
    d = dashboard(c)
    assert d["metrics"]["rate"] == 33.3
    assert d["metrics"]["unresolved"] == 0
    assert d["source_returns"][0]["policy_at_submission"] == 1
    old = c.get("/history/" + str(r.json()["id"])).json()
    assert old["submission_metrics"]["rate"] is None
    export = c.get("/export", params={"root": "CMD", "day": DAY}).json()
    assert export["schema_version"] == "unit-readiness.v1"
    assert export["policy"]["id"] == 2


def test_additions_establishment_and_zero_denominator(client):
    c = client
    login(c, "U1")
    data = payload()
    data["establishment"] = {
        "authority": "Test TO v2",
        "counts": {"Officer": 0, "EP": 5, "Civilian": 0, "Unclassified": 0},
    }
    assert c.post("/units/U1/return", json=data).status_code == 200
    login(c, "CMD")
    assert dashboard(c)["units"][0]["fill_rate"] == 60
    login(c, "U1")
    person = c.post(
        "/units/U1/personnel",
        json={
            "name": "Local Example",
            "rank": "Civ",
            "category": "Civilian",
            "day": DAY,
            "reason": "Missing from source",
        },
    )
    assert person.status_code == 200, person.text
    current = c.get("/units/U1/return", params={"day": DAY}).json()
    assert len(current["entries"]) == 4
    assert current["pending_additions"] == 1
    assert current["entries"][-1]["status"] == "unknown"
    assert (
        len(c.get("/units/U1/return", params={"day": "2026-08-31"}).json()["entries"])
        == 3
    )
    assert (
        c.post("/units/U1/return", json={**data, "expected_revision": 1}).status_code
        == 422
    )
    data.update(expected_revision=1)
    data["entries"].append({"id": person.json()["id"], "status": "available"})
    data["establishment"]["counts"] = {k: 0 for k in data["establishment"]["counts"]}
    assert c.post("/units/U1/return", json=data).status_code == 200
    login(c, "CMD")
    assert dashboard(c)["units"][0]["fill_rate"] is None


def test_nested_scope_excludes_siblings_and_counts_once(client):
    c = client
    login(c, "U1")
    assert c.post("/units/U1/return", json=payload()).status_code == 200
    login(c, "PAF")
    assert dashboard(c, "PAF")["metrics"]["assigned"] == 3
    assert dashboard(c, "CMD")["metrics"]["assigned"] == 3
    assert dashboard(c, "OTHER")["metrics"]["assigned"] == 0
    assert main.compute([], main.DEFAULT_RULES)["rate"] is None
