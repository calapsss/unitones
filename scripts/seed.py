"""One-time minimal read-only BAGWIS snapshot. Never writes to the source.

Run with the repository venv. Demo availability is deliberately simulated and
names are pseudonymized. Source identity stays in the local database only.
"""

import os, sys, json, hashlib
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from main import DB, DEFAULT_RULES

GROUPS = {
    "AETC": [
        "PAFFS",
        "PAFOCS",
        "PAFTSS",
        "PAFBMS",
        "NCOS",
        "AFOS",
        "PAFLTC",
        "440AMG",
        "442OMS",
        "441SSS",
        "443FMS",
        "PAFALEN",
        "HAETDC",
        "AETC",
    ],
    "ADC": ["HADC", "HADC-PADCC", "DASF", "ADC"],
    "505SRG": ["H505SRG", "5051SRS", "5055FMS", "5054SSS", "5057PRS", "505SRG"],
}


def run():
    now = datetime.now(ZoneInfo("Asia/Manila"))
    day = now.date()
    with psycopg.connect(
        os.getenv("BAGWIS_SOURCE_URL", "postgresql:///bagwis_data"),
        row_factory=dict_row,
    ) as source:
        source.read_only = True
        source_database = source.info.dbname
        source.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        rows = source.execute(
            """SELECT afpsn,rank_abbrv,pers_classification,mother_unit_abbrv,sub_unit_abbrv,
          fetched_at,effective_current_roster_member,rank_abbrv_assertion_id,mother_unit_abbrv_assertion_id,
          sub_unit_abbrv_assertion_id FROM hrmis.personnel_effective
          WHERE mother_unit_abbrv = ANY(%s) AND effective_current_roster_member IS TRUE ORDER BY afpsn""",
            (list(GROUPS),),
        ).fetchall()
    if not rows:
        raise RuntimeError("No current BAGWIS roster rows; refusing an empty seed")
    with psycopg.connect(DB, row_factory=dict_row) as c:
        if c.info.dbname == source_database:
            raise RuntimeError(
                "Source and destination database names must differ; refusing to initialize the source"
            )
        c.execute(Path("backend/schema.sql").read_text())
        if c.execute("SELECT 1 FROM seed_runs").fetchone():
            print("Already seeded; preserving all unit corrections and history.")
            return
        if not c.execute("SELECT 1 FROM policies").fetchone():
            c.execute(
                "INSERT INTO policies(actor,reason,rules) VALUES(%s,%s,%s)",
                (
                    "setup",
                    "Prototype assumptions; MWB definition unconfirmed",
                    Jsonb(DEFAULT_RULES),
                ),
            )

        def unit(id, name, parent, reporting, source):
            c.execute(
                "INSERT INTO units(id,name,parent_id,reporting,source) VALUES(%s,%s,%s,%s,%s)",
                (id, name, parent, reporting, Jsonb(source)),
            )

        unit(
            "PAF",
            "DPP OA-1 · pilot coverage",
            None,
            False,
            {
                "kind": "prototype_reporting_root",
                "scope": "AETC, ADC headquarters population, 505SRG only; not total PAF",
            },
        )
        for command in GROUPS:
            unit(
                command,
                command,
                "PAF",
                False,
                {
                    "kind": "BAGWIS mother-unit scope",
                    "hierarchy": "Candidate reporting tree; does not assert full command order of battle",
                },
            )
            for sub in GROUPS[command] + ["REVIEW"]:
                label = (
                    "Assignment review"
                    if sub == "REVIEW"
                    else ("Headquarters roster" if sub == command else sub)
                )
                unit(
                    f"{command}--{sub}",
                    label,
                    command,
                    True,
                    {
                        "kind": "BAGWIS sub-unit grouping",
                        "mapping_version": 1,
                        "needs_review": sub == "REVIEW",
                    },
                )
        for i, r in enumerate(rows):
            command = r["mother_unit_abbrv"]
            sub = r["sub_unit_abbrv"]
            owner = sub if sub in GROUPS[command] else "REVIEW"
            key = hashlib.sha256(("unit-readiness:" + r["afpsn"]).encode()).hexdigest()[
                :20
            ]
            src = {
                "system": "BAGWIS",
                "table": "hrmis.personnel_effective",
                "source_id": r["afpsn"],
                "mother_unit": command,
                "sub_unit": sub,
                "fetched_at": r["fetched_at"].isoformat(),
                "imported_at": now.isoformat(),
                "mapping_version": 1,
                "assignment_review": owner == "REVIEW",
                "identity_display": "pseudonymized",
                "assertions": {k: r[k] for k in r if k.endswith("_assertion_id")},
            }
            category = {
                "OFFICER": "Officer",
                "ENLISTED": "EP",
                "CIVILIAN": "Civilian",
            }.get(r["pers_classification"], "Unclassified")
            c.execute(
                "INSERT INTO personnel(id,unit_id,name,rank,category,source) VALUES(%s,%s,%s,%s,%s,%s)",
                (
                    key,
                    f"{command}--{owner}",
                    f"Personnel {i+1:04}",
                    r["rank_abbrv"] or "Unspecified",
                    category,
                    Jsonb(src),
                ),
            )
        policy = c.execute(
            "SELECT id FROM policies ORDER BY id DESC LIMIT 1"
        ).fetchone()["id"]
        units = c.execute("SELECT * FROM units WHERE reporting ORDER BY id").fetchall()
        for i, u in enumerate(units):
            people = c.execute(
                "SELECT * FROM personnel WHERE unit_id=%s ORDER BY id", (u["id"],)
            ).fetchall()
            for person in people:
                person["starts_on"] = str(person["starts_on"])
            for delta in [2, 1, 0]:
                if delta == 0 and (u["id"].endswith("REVIEW") or i % 9 == 4):
                    continue
                statuses = ["available"] * 14 + [
                    "passes",
                    "leave",
                    "hospitalized",
                    "mwb",
                    "detached",
                    "unknown",
                ]
                entries = [
                    {
                        **p,
                        "status": statuses[(j + i + delta) % len(statuses)],
                        "note": "Simulated demonstration status; requires unit confirmation.",
                    }
                    for j, p in enumerate(people)
                ]
                c.execute(
                    "INSERT INTO returns(unit_id,day,revision,published,actor,reason,entries,policy_id,organization) VALUES(%s,%s,1,%s,%s,%s,%s,%s,%s)",
                    (
                        u["id"],
                        day - timedelta(days=delta),
                        not (delta == 0 and i % 11 == 3),
                        "demo-seed",
                        "Simulated daily return over BAGWIS-derived roster",
                        Jsonb(entries),
                        policy,
                        Jsonb(u),
                    ),
                )
        manifest = {
            "system": "BAGWIS local PostgreSQL",
            "table": "hrmis.personnel_effective",
            "source_read_only": True,
            "imported_at": now.isoformat(),
            "demo_day": str(day),
            "personnel_count": len(rows),
            "reporting_units": len(units),
            "source_fetched_min": min(r["fetched_at"] for r in rows).isoformat(),
            "source_fetched_max": max(r["fetched_at"] for r in rows).isoformat(),
            "scope": list(GROUPS),
            "current_roster_filter": "effective_current_roster_member IS TRUE",
            "snapshot_sha256": hashlib.sha256(
                json.dumps(rows, sort_keys=True, default=str).encode()
            ).hexdigest(),
            "availability": "Simulated demo statuses, not operational facts",
            "names": "Pseudonymized; ranks and assignments from source",
            "hierarchy": "Candidate ownership from mother/sub-unit fields. Unmapped labels routed to Assignment review, never silently reassigned.",
            "limitations": [
                "Selected mother-unit populations only; ADC excludes separately recorded wings.",
                "No live civilian roster imported.",
                "No imported daily status is certified.",
            ],
        }
        c.execute("INSERT INTO seed_runs(manifest) VALUES(%s)", (Jsonb(manifest),))
        Path(".local/seed-manifest.json").write_text(json.dumps(manifest, indent=2))
        print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    run()
