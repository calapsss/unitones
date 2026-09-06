import os, json
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo
from uuid import uuid4
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
from itsdangerous import URLSafeTimedSerializer, BadSignature

DB = os.getenv(
    "DATABASE_URL",
    "postgresql://readiness:local-prototype-only@127.0.0.1:5546/readiness",
)
SIGNER = URLSafeTimedSerializer(
    os.environ.get("SESSION_SECRET", "local-process-demo-secret")
)
DEFAULT_RULES = {
    "available": {"label": "Available", "available": True},
    "passes": {"label": "Passes", "available": False},
    "hospitalized": {"label": "Hospitalized", "available": False},
    "mwb": {"label": "MWB · definition pending", "available": None},
    "leave": {"label": "Leave", "available": False},
    "detached": {"label": "Detached / duty elsewhere", "available": False},
    "unknown": {"label": "Unconfirmed", "available": None},
    "not_assigned": {"label": "Not assigned · unit correction", "available": False},
}


def connect():
    return psycopg.connect(DB, row_factory=dict_row)


@asynccontextmanager
async def lifespan(app):
    with connect() as c:
        c.execute(Path(__file__).with_name("schema.sql").read_text())
        if not c.execute("SELECT 1 FROM policies").fetchone():
            c.execute(
                "INSERT INTO policies(actor,reason,rules) VALUES(%s,%s,%s)",
                (
                    "setup",
                    "Prototype assumptions; MWB unresolved",
                    Jsonb(DEFAULT_RULES),
                ),
            )
    yield


app = FastAPI(title="Unit Readiness", version="0.1.0", lifespan=lifespan)


def actor(req):
    try:
        return SIGNER.loads(req.cookies.get("ur_session", ""), max_age=86400)
    except BadSignature:
        raise HTTPException(401, "Choose a demo workspace first")


def require_unit(req, unit):
    a = actor(req)
    if a["unit_id"] != unit or a["role"] != "unit":
        raise HTTPException(403, "Only the owning unit can update its return")
    return a


def policy(c):
    return c.execute("SELECT * FROM policies ORDER BY id DESC LIMIT 1").fetchone()


def unit_rows(c):
    return c.execute("SELECT * FROM units ORDER BY id").fetchall()


def scope(units, root):
    ids = {root}
    while True:
        more = {u["id"] for u in units if u["parent_id"] in ids}
        if more <= ids:
            return ids
        ids |= more


def compute(entries, rules):
    counts = {k: 0 for k in rules}
    categories = {}
    ranks = {}
    for e in entries:
        counts[e["status"]] += 1
        if e["status"] != "not_assigned":
            categories[e["category"]] = categories.get(e["category"], 0) + 1
            ranks[e["rank"]] = ranks.get(e["rank"], 0) + 1
    assigned = len(entries) - counts["not_assigned"]
    available = sum(
        v
        for k, v in counts.items()
        if rules[k]["available"] is True and k != "not_assigned"
    )
    unresolved = sum(
        v
        for k, v in counts.items()
        if rules[k]["available"] is None and k != "not_assigned"
    )
    return dict(
        assigned=assigned,
        available=available,
        unresolved=unresolved,
        unavailable=assigned - available - unresolved,
        rate=(
            round(100 * available / assigned, 1)
            if assigned and not unresolved
            else None
        ),
        confirmed_rate=round(100 * available / assigned, 1) if assigned else None,
        counts=counts,
        categories=categories,
        ranks=ranks,
    )


def get_return(c, unit, day, published=False):
    return c.execute(
        "SELECT * FROM returns WHERE unit_id=%s AND day=%s "
        + ("AND published=true " if published else "")
        + "ORDER BY revision DESC LIMIT 1",
        (unit, day),
    ).fetchone()


def dashboard(c, root, day):
    units = unit_rows(c)
    ids = scope(units, root)
    p = policy(c)
    rows = []
    all_entries = []
    refs = []
    for u in units:
        if u["id"] not in ids or not u["reporting"]:
            continue
        r = get_return(c, u["id"], day, True)
        latest = get_return(c, u["id"], day)
        baseline = c.execute(
            "SELECT count(*) AS n FROM personnel WHERE unit_id=%s AND starts_on<=%s",
            (u["id"], day),
        ).fetchone()["n"]
        prior = c.execute(
            "SELECT max(day) AS day FROM returns WHERE unit_id=%s AND published=true AND day<%s",
            (u["id"], day),
        ).fetchone()["day"]
        m = compute(r["entries"], p["rules"]) if r else None
        if r:
            all_entries.extend(r["entries"])
            refs.append(
                {
                    "return_id": r["id"],
                    "unit_id": u["id"],
                    "revision": r["revision"],
                    "policy_at_submission": r["policy_id"],
                }
            )
        est = r["establishment"] if r else {}
        authorized = sum(est.get("counts", {}).values()) if est.get("counts") else None
        rows.append(
            {
                **u,
                "baseline": baseline,
                "metrics": m,
                "establishment": est,
                "authorized": authorized,
                "fill_rate": (
                    round(100 * m["assigned"] / authorized, 1)
                    if m and authorized
                    else None
                ),
                "revision": r["revision"] if r else None,
                "last_reported_day": prior,
                "status": "Published" if r else ("Draft" if latest else "Missing"),
                "newer_draft": bool(r and latest["revision"] > r["revision"]),
                "pending_additions": max(0, baseline - len(r["entries"])) if r else 0,
                "updated_at": r["created_at"] if r else None,
            }
        )
    return dict(
        day=day,
        scope=root,
        policy=p,
        units=rows,
        metrics=compute(all_entries, p["rules"]),
        coverage={
            "reported": len(refs),
            "expected": len(rows),
            "baseline": sum(r["baseline"] for r in rows),
        },
        source_returns=refs,
        computed_at=datetime.now().astimezone(),
        complete=len(refs) == len(rows) and bool(rows),
    )


@app.get("/health")
def health():
    with connect() as c:
        c.execute("SELECT 1")
    return {"status": "ok", "service": "unit-readiness"}


@app.get("/workspaces")
def workspaces():
    with connect() as c:
        return [
            {
                "id": u["id"],
                "name": u["name"],
                "role": "unit" if u["reporting"] else "hq",
            }
            for u in unit_rows(c)
        ]


class Login(BaseModel):
    workspace: str


@app.post("/session")
def login(data: Login, response: Response):
    with connect() as c:
        u = c.execute("SELECT * FROM units WHERE id=%s", (data.workspace,)).fetchone()
    if not u:
        raise HTTPException(404, "Workspace not found")
    a = {
        "unit_id": u["id"],
        "name": u["name"],
        "role": "unit" if u["reporting"] else "hq",
        "id": f"demo:{u['id']}",
    }
    response.set_cookie(
        "ur_session", SIGNER.dumps(a), httponly=True, samesite="strict", max_age=86400
    )
    return a


@app.get("/session")
def session(req: Request):
    return actor(req)


@app.get("/dashboard")
def summary(req: Request, day: date, root: str = "AETC"):
    a = actor(req)
    with connect() as c:
        allowed = scope(unit_rows(c), a["unit_id"])
        if root not in allowed:
            raise HTTPException(403, "Outside your workspace")
        return dashboard(c, root, day)


@app.get("/units/{unit}/return")
def read_return(unit: str, day: date, req: Request):
    a = actor(req)
    with connect() as c:
        if unit not in scope(unit_rows(c), a["unit_id"]):
            raise HTTPException(403, "Outside your workspace")
        u = c.execute("SELECT * FROM units WHERE id=%s", (unit,)).fetchone()
        if not u:
            raise HTTPException(404, "Unit not found")
        r = get_return(c, unit, day)
        people = c.execute(
            "SELECT * FROM personnel WHERE unit_id=%s AND starts_on<=%s ORDER BY category,name",
            (unit, day),
        ).fetchall()
        entries = (
            r["entries"]
            if r
            else [{**p, "status": "unknown", "note": ""} for p in people]
        )
        present = {e["id"] for e in entries}
        entries += [
            {**p, "status": "unknown", "note": ""}
            for p in people
            if p["id"] not in present
        ]
        prior = c.execute(
            "SELECT day,revision FROM returns WHERE unit_id=%s AND day<%s AND published=true ORDER BY day DESC,revision DESC LIMIT 1",
            (unit, day),
        ).fetchone()
        return dict(
            unit=u,
            day=day,
            revision=r["revision"] if r else 0,
            published=r["published"] if r else False,
            pending_additions=len(entries) - len(present),
            entries=entries,
            establishment=r["establishment"] if r else {},
            prior=prior,
            policy=policy(c),
            history=c.execute(
                "SELECT id,day,revision,published,actor,reason,created_at,policy_id FROM returns WHERE unit_id=%s AND day=%s ORDER BY revision DESC",
                (unit, day),
            ).fetchall(),
        )


class Entry(BaseModel):
    id: str
    status: Literal[
        "available",
        "passes",
        "hospitalized",
        "mwb",
        "leave",
        "detached",
        "unknown",
        "not_assigned",
    ]
    note: str = Field(default="", max_length=500)
    rank: str | None = Field(default=None, min_length=1, max_length=40)
    category: Literal["Officer", "EP", "Civilian", "Unclassified"] | None = None


class Establishment(BaseModel):
    authority: str = Field(default="", max_length=300)
    counts: dict[Literal["Officer", "EP", "Civilian", "Unclassified"], int] = Field(
        default_factory=dict
    )


class ReturnInput(BaseModel):
    day: date
    expected_revision: int = Field(ge=0)
    publish: bool
    reason: str = Field(min_length=3, max_length=500)
    entries: list[Entry]
    establishment: Establishment = Field(default_factory=Establishment)


@app.post("/units/{unit}/return")
def save_return(unit: str, data: ReturnInput, req: Request):
    a = require_unit(req, unit)
    if not data.reason.strip() or len(data.reason.strip()) < 3:
        raise HTTPException(422, "Enter a meaningful reason")
    if data.day > datetime.now(ZoneInfo("Asia/Manila")).date():
        raise HTTPException(422, "Future operational returns cannot be recorded")
    if data.establishment.counts and (
        set(data.establishment.counts) != {"Officer", "EP", "Civilian", "Unclassified"}
        or any(v < 0 for v in data.establishment.counts.values())
        or len(data.establishment.authority.strip()) < 3
    ):
        raise HTTPException(
            422,
            "An establishment requires all four category counts, nonnegative values, and an authority/version",
        )
    with connect() as c:
        c.execute("SELECT id FROM units WHERE id=%s FOR UPDATE", (unit,))
        latest = get_return(c, unit, data.day)
        rev = latest["revision"] if latest else 0
        if rev != data.expected_revision:
            raise HTTPException(
                409, "This return changed. Reload before saving your changes."
            )
        people = c.execute(
            "SELECT * FROM personnel WHERE unit_id=%s AND starts_on<=%s ORDER BY id",
            (unit, data.day),
        ).fetchall()
        supplied = {e.id: e for e in data.entries}
        if len(supplied) != len(data.entries) or set(supplied) != {
            p["id"] for p in people
        }:
            raise HTTPException(
                422, "Return must contain the complete owning-unit roster exactly once"
            )
        entries = []
        for p in people:
            e = supplied[p["id"]]
            if e.status == "not_assigned" and len(e.note.strip()) < 3:
                raise HTTPException(422, "A roster correction needs supporting context")
            entry = {**p, **e.model_dump(exclude_none=True)}
            entry["starts_on"] = str(p["starts_on"])
            entries.append(entry)
        pol = policy(c)
        org = c.execute("SELECT * FROM units WHERE id=%s", (unit,)).fetchone()
        row = c.execute(
            "INSERT INTO returns(unit_id,day,revision,published,actor,reason,entries,policy_id,organization,establishment) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id,revision",
            (
                unit,
                data.day,
                rev + 1,
                data.publish,
                a["id"],
                data.reason.strip(),
                Jsonb(entries),
                pol["id"],
                Jsonb(org),
                Jsonb(data.establishment.model_dump()),
            ),
        ).fetchone()
        return {
            **row,
            "metrics": compute(entries, pol["rules"]),
            "published": data.publish,
        }


@app.get("/history/{return_id}")
def history(return_id: int, req: Request):
    a = actor(req)
    with connect() as c:
        r = c.execute("SELECT * FROM returns WHERE id=%s", (return_id,)).fetchone()
        if not r:
            raise HTTPException(404, "Revision not found")
        if r["unit_id"] not in scope(unit_rows(c), a["unit_id"]):
            raise HTTPException(403, "Outside your workspace")
        p = c.execute(
            "SELECT * FROM policies WHERE id=%s", (r["policy_id"],)
        ).fetchone()
        r["submission_policy"] = p
        r["submission_metrics"] = compute(r["entries"], p["rules"])
        return r


class PolicyInput(BaseModel):
    expected_version: int
    mwb_label: str = Field(min_length=3, max_length=80)
    mwb_available: bool | None
    passes_available: bool
    reason: str = Field(min_length=3, max_length=500)


@app.post("/policy")
def change_policy(data: PolicyInput, req: Request):
    a = actor(req)
    if a["unit_id"] != "PAF":
        raise HTTPException(403, "Only the policy workspace can change shared rules")
    with connect() as c:
        c.execute("SELECT pg_advisory_xact_lock(812001)")
        old = policy(c)
        if old["id"] != data.expected_version:
            raise HTTPException(409, "Policy changed. Reload.")
        rules = old["rules"]
        rules["mwb"] = {"label": data.mwb_label, "available": data.mwb_available}
        rules["passes"]["available"] = data.passes_available
        return c.execute(
            "INSERT INTO policies(actor,reason,rules) VALUES(%s,%s,%s) RETURNING *",
            (a["id"], data.reason, Jsonb(rules)),
        ).fetchone()


@app.get("/policy/history")
def policies(req: Request):
    actor(req)
    with connect() as c:
        return c.execute("SELECT * FROM policies ORDER BY id DESC").fetchall()


@app.get("/provenance")
def provenance(req: Request):
    actor(req)
    with connect() as c:
        return c.execute("SELECT * FROM seed_runs ORDER BY id DESC LIMIT 1").fetchone()


@app.get("/export")
def export(req: Request, day: date, root: str = "AETC"):
    result = summary(req, day, root)
    return {
        "schema_version": "unit-readiness.v1",
        "purpose": "Candidate DPP OA-1 / BAGWIS aggregate input; not an approved integration",
        **result,
    }


class PersonInput(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    rank: str = Field(min_length=1, max_length=40)
    category: Literal["Officer", "EP", "Civilian", "Unclassified"]
    day: date
    reason: str = Field(min_length=3, max_length=500)


@app.post("/units/{unit}/personnel")
def add_person(unit: str, data: PersonInput, req: Request):
    a = require_unit(req, unit)
    if data.day > datetime.now(ZoneInfo("Asia/Manila")).date():
        raise HTTPException(422, "Choose today or a previous reporting date")
    with connect() as c:
        c.execute("SELECT id FROM units WHERE id=%s FOR UPDATE", (unit,))
        src = {
            "system": "unit-reported",
            "actor": a["id"],
            "reason": data.reason,
            "created_at": datetime.now().astimezone().isoformat(),
            "identity_review": "Local addition; upstream identity reconciliation required",
        }
        return c.execute(
            "INSERT INTO personnel(id,unit_id,name,rank,category,source,starts_on) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (
                "local-" + str(uuid4()),
                unit,
                data.name,
                data.rank,
                data.category,
                Jsonb(src),
                data.day,
            ),
        ).fetchone()


@app.get("/trend")
def trend(req: Request, day: date, root: str):
    from datetime import timedelta

    return [
        {
            k: v
            for k, v in summary(req, day - timedelta(days=i), root).items()
            if k in ("day", "metrics", "coverage", "complete")
        }
        for i in range(6, -1, -1)
    ]


@app.get("/reference")
def reference(req: Request):
    actor(req)
    path = Path(__file__).with_name("reference.json")
    return (
        json.loads(path.read_text())
        if path.exists()
        else {"notes": "Workbook evidence is documented in docs/discovery.md"}
    )
