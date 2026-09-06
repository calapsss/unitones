# What Unit Ones should be

Unit Ones is a daily personnel accountability and reporting service. The lower unit maintains a dated operational return; headquarters receives a recomputed view with visible coverage and traceable revisions. It also provides structured assigned-strength data suitable for later DPP consolidation.

## Evidence examined

The supplied workbooks were read as domain evidence, not as instructions or a UI template. They were not modified. `scripts/inspect_workbooks.py` reproduces a structural inspection in `.local/workbook-evidence.json` without exporting personal fields.

### Unit submission: OK 505SRG.xlsx

- `Roster of Troops!A1:AK2` defines identity, rank, regular/reserve, pilot/aircrew, qualifications, AFSC, courses and unit/group/squadron fields. The roster has 312 numbered personnel rows. Daily availability fields are absent.
- `Roster of Troops!AC:AE` carries organizational ownership, but squadron/office labels include capitalization differences, spelling differences, multiple assignments and free-text duty descriptions. They cannot safely become unique organization IDs without reconciliation.
- `UPDATED STRENGTH PAF!A5:AP7` groups ranks, officer/EP totals, gender and a grand total. `Sheet2!B2:O3` partitions regional recaps by headquarters, 5051 SRS, 5054 SSS, 5055 FMS and 5057 PRS.
- Other recaps include regular/reserve officers, pilot ratings, pilots and aircrew by squadron, civilian strength and TAS. The roster itself contains no formulas; many recap inputs are constants and formulas add those inputs. A personnel edit therefore does not necessarily recalculate every recap.
- `CivHR BY UNIT!A2` says “As of 15 May 2023.” This is evidence of mixed reporting context, not a reliable date for every sheet. Sixteen cached formula errors occur in this sheet, including zero-denominator fill calculations.
- The workbook contains four external links. It also contains detailed personal information unnecessary for this prototype; no addresses, birthdays, government benefit numbers, contact data or photos are imported.

### Headquarters consolidation: Strength 2.xlsx

- `MIL & CIV HR SR with TAS!A5:Z8` compares TO S-2022, TO S-2025 and actual officer, EP and civilian strength, with short/excess and fill-up rates.
- `MIL & CIV HR SR with TAS!B77:M77` contains AETC: 2022 authorized 489 + 1,202 + 135 = 1,826; 2025 authorized 356 + 1,000 + 125 = 1,481; cached actual 252 + 883 + 58 = 1,193. These are historical workbook populations, not the live import population.
- `W77` divides actual total `M77` by 2022 authorization `E77`; `Y77` divides it by 2025 authorization `I77`. Thus establishment version changes the denominator. A single unlabeled readiness percentage would lose necessary context.
- `PERCENTAGE BY UNIT & SQDRN!B7:BJ8` repeats AUTH, ACT and percentage by rank, with parent and subordinate rows. Summing every row would double count the rollups.
- `PERCENTAGE BY UNIT & SQDRN!AC9` divides actual 2LT by zero authorization, demonstrating why zero denominators must remain undefined. There are 2,897 cached error cells in this sheet and one in the first sheet.
- `MIL & CIV HR SR with TAS!A2` links a reporting label/range from an external workbook. The file has eight external links; many organization labels also depend on external cells. Cached values can be read, but the full upstream refresh cannot be reproduced from these two files alone.
- Several labels and their formula denominators are inconsistent (for example the T5 “FUR TO 2025” band versus T9's 2022 denominator). The prototype does not copy these inconsistencies.
- The first sheet has 1,304 formulas; the rank sheet has 10,586. Repeated calculations, external links and manual recaps explain the consolidation workload and the need for normalized source-owned records.

### BAGWIS, verified locally

`GET http://127.0.0.1:8000/health` identifies the personnel repository as `postgres/hrmis-reconciled`, without CSV fallback. `app/backend/services/readiness.py` explicitly reads a maintained aggregate CSV and documents that it does not traverse nested sub-unit aggregations. These are different data populations and capabilities.

The prototype imported only minimal fields from `hrmis.personnel_effective`, filtered by `effective_current_roster_member IS TRUE`. This includes effective ranks and assignments after BAGWIS assertions, with assertion IDs retained in provenance. The read ran in a repeatable-read, read-only PostgreSQL transaction.

The seed contains 1,144 AETC people, mapped into AETC reporting workspaces. The supplied `OK 505SRG.xlsx` workbook is treated only as a submission-format reference; it is not a seed source. The raw `hrmis.personnel` population for these mother-unit labels was 1,597; applying effective membership is intentional. Source detail refreshes span June 11–August 21, 2026. An import on September 6 does not make those personnel details current for September 6.

No live civilian population was imported.

## Interpretation of C1

“Readiness for day” requires an effective reporting date and knowledge of who has reported. “MWB, passes, hospitalized” implies changing personnel availability rather than simply authorized-versus-assigned strength. “Each unit updates” gives ownership to the source unit. “Recompute” means headquarters should not manually merge files or overwrite totals.

This interpretation introduces an explicit publication boundary: units can prepare drafts; publishing makes a version authoritative for consolidation. This is a prototype workflow decision, not a rule claimed to exist in the workbooks.

## Product decisions

1. **One person, one owning reporting unit, one status per day.** Stable local IDs eliminate accidental duplication from repeated summary rows. Candidate ownership follows source mother/sub-unit groups; unmatched labels go to an explicit Assignment review workspace. This is a provisional reporting tree, not a certified command structure.
2. **Two distinct measures.** Daily availability uses unit-reported statuses. Establishment fill uses assigned strength and a separately declared authorized establishment with authority/version. Historical Excel authorization is context, never silently combined with the imported roster.
3. **A new day begins unconfirmed.** Previous-day statuses are not automatically treated as fresh. Prior publication dates remain visible. Missing returns contribute no personnel to reported totals, and their baseline counts and coverage remain visible.
4. **Draft, publish, correct.** Every save is an immutable revision. Headquarters chooses the latest published revision for each unit/date; a newer draft leaves that publication in effect. Expected-revision checks prevent silent lost updates.
5. **Corrections remain local.** Units may exclude a misassigned person with supporting context, correct rank/category in a dated return, and add a missing person. Local additions require upstream identity reconciliation. No correction writes to BAGWIS.
6. **Expose uncertainty.** MWB has no confirmed definition in the supplied evidence. Its availability effect is initially unresolved. Unconfirmed/MWB populations suppress a definitive availability rate. Passes and MWB effects are versioned policy settings; the other default status assumptions are centralized in `DEFAULT_RULES` and documented for validation.
7. **Preserve audit context.** Each revision stores the owning organization's snapshot, date, actor, reason, person source fields, establishment and policy ID. Current-policy totals and submission-policy historical metrics are distinguishable.
8. **Keep the demo honest.** Ranks and assignments are real source values; displayed names are imported from the read-only BAGWIS effective roster, and daily conditions are simulated. The source snapshot stays local and out of Git. Human staff must establish the real operational state.

## Decisions still required before operational adoption

MWB meaning; who may certify/publish; actual command reporting boundaries; treatment of attachments, trainees and duty elsewhere; roster identity matching for unit additions; status overlaps and intraday cutoffs; authorized establishment custodianship and effective periods; civilian coverage; retention and medical-data access. These are visible limitations or explicit policy/data boundaries rather than invented readiness doctrine.

The prototype does not claim mission capability, equipment readiness, validated pilot qualifications, JRRS qualification scoring, official R1–R4 availability bands, or an approved DPP/BAGWIS integration.
