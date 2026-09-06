# Verification

Verified locally on September 6, 2026. Detailed generated artifacts remain in ignored `.local/`.

## Evidence and seed

- Both supplied workbooks inspected read-only for roster fields, reporting structure, calculation precedents, external dependencies and cached errors. See [discovery](discovery.md).
- Source service health confirmed BAGWIS PostgreSQL personnel mode, without CSV fallback.
- Imported 1,595 effective current-roster members from the local BAGWIS effective view using a read-only, repeatable-read source transaction.
- Snapshot manifest records scope, source refresh range, import timestamp and hash. Real names and sensitive biographic fields were not imported.
- Dedicated Unit Readiness PostgreSQL, FastAPI and production-built Next.js run through Docker Compose on loopback ports 5546, 8200 and 3200.

## PostgreSQL integration tests

`backend/test_workflow.py`: five test cases passed against isolated disposable databases on the prototype PostgreSQL server. These test databases use only synthetic identities and are removed after testing.

Coverage includes draft exclusion, publication and correction, immutable history, prior-day exclusion, expected-revision conflicts, duplicate/foreign roster validation, unit/headquarters ownership, policy authority/version conflicts, current-policy versus submission-policy calculations, JSON export consistency, local additions with effective dates, establishment validation/zero denominator, rank/category corrections and descendant aggregation without sibling leakage or double counting.

## Complete-stack browser verification

`frontend/scripts/verify.mjs` uses two independent local Chrome contexts, one for AETC headquarters and one for an owning unit.

1. Record headquarters availability: **559 available, 149 unavailable**.
2. Change one unit-reported pass to available in the roster interface; save a draft. Headquarters remains at **559 available**.
3. Review and publish the correction through the interface. Headquarters recomputes to **560 available, 148 unavailable**.
4. Read the previous immutable revision: its original pass is preserved.
5. Submit an outdated expected revision: **HTTP 409**.
6. Attempt another command scope from the unit identity: **HTTP 403**.
7. Export the snapshot: metrics and source revision references agree with headquarters.
8. Load every main view without JavaScript errors. Capture desktop headquarters and unit views, and a 390-pixel mobile view with no page-level horizontal overflow.
9. Restore the initial demo status through a new published revision. Verification history remains auditable.

The checker selects a published unit with a pass (initial run: AETC / 440AMG). It is repeatable; later runs may have different starting counts if the user has edited demo data. It preserves the selected return's starting entries and restores them with a fresh revision.

Artifacts: `.local/verification.json`, `.local/headquarters.png`, `.local/unit-return.png`, `.local/mobile.png`. Screenshots were visually inspected for layout, legibility, visible scope/uncertainty and unclipped controls.

## Build and operating checks

- Next.js production build and TypeScript validation pass.
- Dependency audit reports zero known vulnerabilities after patching Next.js and Playwright and pinning the patched PostCSS dependency override. The lockfile records exact resolved dependencies.
- `/health` succeeds both directly and through the web proxy.
- Docker health checks verify PostgreSQL and API readiness. The restart preserves unit-return history in the persistent volume.
- The backup script saves a PostgreSQL custom-format dump under `.local/backups/`.

## Limits of this verification

This establishes the local prototype workflow, not operational policy correctness, real authentication, complete personnel coverage, mission readiness, multi-user load capacity, formal accessibility certification or an approved upstream integration. Daily statuses are simulated; organizational ownership and establishment policy require staff validation.
