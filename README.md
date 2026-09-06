# Unit Ones

A local personnel reporting prototype: units maintain daily returns; headquarters sees automatically consolidated assigned strength, availability, reporting coverage and revision provenance.

**Open [Unit Ones](http://127.0.0.1:3200).** The full stack uses Next.js, FastAPI and an independent PostgreSQL database through Docker Compose. BAGWIS remains unchanged.

## Start

```sh
./scripts/start.sh
```

This creates a local session secret if needed and starts the existing database and production-built services. Ports bind only to loopback:

| Service | Address |
| --- | --- |
| Web | http://127.0.0.1:3200 |
| API / OpenAPI | http://127.0.0.1:8200/docs |
| PostgreSQL | 127.0.0.1:5546 |

Database: `readiness`; user: `readiness`; password: `local-prototype-only`. These are dedicated local demo credentials. Data persists in the Compose `readiness-data` volume. `docker compose stop` stops only this stack without deleting its data.

## AETC submission basis

`OK 505SRG.xlsx` is a sample of the kind of unit submission sent to DPP. It is a format reference only and is not imported or used to seed Unit Ones. Unit Ones seeds the complete AETC personnel population from the read-only BAGWIS effective-roster view, then prepares the AETC unit return and consolidated picture in the same submission-oriented workflow.

## Presentation framing

The visible presentation story is **From the source to the daily picture**. Scope and policy caveats are maintained here and in [discovery](docs/discovery.md), rather than in the presentation banner. The local prototype uses BAGWIS effective-roster data and unit-owned reporting to show the flow into a consolidated headquarters picture.

## Demo in three minutes

1. Open the app in the **AETC** workspace. The initial date is the seeded demonstration date. Inspect reporting coverage, missing units, status composition and the seven-day picture.
2. Switch the sidebar workspace to **AETC / 440AMG**. Choose **Update today's return**. Search a person, change a pass to Available, and enter a revision reason.
3. **Save draft**. In another browser context or by switching workspace, headquarters still sees the last publication. The unit row indicates a newer draft.
4. Return to the unit and choose **Review & publish**. Enter a reason and publish. Switch to AETC and click **Recompute** (or wait up to 15 seconds). Available strength increases and the published revision advances.
5. Open the unit's **Revision trail** to inspect the earlier values. In **Strength & establishment**, compare officer/EP/civilian counts and rank distribution. Unit-declared authorized counts and a named authority enable fill calculations.
6. Open **Sources & scope** to inspect the BAGWIS provenance and AETC submission flow. Export the AETC picture when needed.

Choose an unreported date to demonstrate that prior statuses do not automatically carry forward. An unconfirmed return may be published, but unresolved statuses remain visible and its availability percentage is withheld.

**Data boundary:** the initial 1,144 AETC personnel ranks and assignments come from local BAGWIS effective current-roster records. Names are imported from the read-only BAGWIS effective roster. Daily statuses are simulated, not actual hospitalization/absence reports. Scope covers the AETC population only, not the complete PAF. Sources & scope in the app explains these limits.

## Seed a fresh prototype database

The current database is already seeded. Re-running the importer preserves existing reports and corrections.

```sh
docker compose up -d db
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python scripts/seed.py
./scripts/start.sh
```

The default read-only source is `postgresql:///bagwis_data`. Set `BAGWIS_SOURCE_URL` if the local source connection differs. `DATABASE_URL` can select a different prototype destination. Do not point the destination at BAGWIS. The importer reads `hrmis.personnel_effective` and does not ingest names, addresses, birthdays, benefit IDs or raw payloads.

Local imports, manifests, screenshots, backup files and evidence extracts belong in ignored `.local/`. Do not commit source datasets or `.env`. The source workbooks remain in Downloads and are never modified.

## Verify

```sh
# API integration tests use a randomly named disposable database on the prototype DB server.
.venv/bin/python -m pytest backend/test_workflow.py -q

# End-to-end browser check against the running complete stack; uses local Chrome.
cd frontend
npm ci
node scripts/verify.mjs
```

The browser check changes one demo status through the UI, proves draft isolation and headquarters recomputation, checks history and export, then restores the starting status through another auditable revision. It writes a result and screenshots into `.local/`. No source BAGWIS data is modified. See [verification](docs/verification.md).

## Development and operations

```sh
# Optional host-based development with the same independent database
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8200
cd frontend && npm run dev
```

Stop the Compose web/API services first to free these ports. The default Next.js API proxy uses localhost in host development and the `api` Compose service in the container build. Use `./scripts/backup.sh` for a local PostgreSQL custom-format backup before significant demo changes. Restore into a separate database for inspection rather than overwriting reporting history.

The workspace selector is an explicitly labeled **demo role switch**, not authentication suitable for deployment. Backend ownership checks and signed sessions support realistic workflow testing. Do not expose this prototype publicly.

## Design and integration

- [Evidence and product discovery](docs/discovery.md)
- [Architecture, model and API](docs/architecture.md)
- [Verification evidence](docs/verification.md)

Unit Ones is independent. The JSON export is a candidate DPP OA-1/BAGWIS data contract; there is no outbound synchronization or official policy approval implied.
