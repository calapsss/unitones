# Personnel fill-up

The daily dashboard uses actual roster strength divided by authorized TO, multiplied by 100. AETC uses the supplied Strength.xlsx, sheet `MIL & CIV HR SR with TAS`, cells F77:I77: TO S-2025 has 356 officers, 1,000 EP and 125 civilian personnel, totaling 1,481. The workbook's own snapshot has 1,193 actual (M77), yielding 80.55% and R2. Unit Ones uses its own roster, not that snapshot's actual count.

Published dated exclusions affect actual strength; unpublished drafts do not. Units without a publication still contribute their initial roster to staffing. Daily availability and absence cards only include published dated returns. Subunit TO is not fabricated from the command total; it requires a unit establishment.

The workbook's X77/Z77 formulas define R1 >= 85%, R2 >= 74.5%, R3 >= 50.51%, R4 <= 50.5%. Classification uses the unrounded ratio. The literal formula gap (50.5%, 50.51%) returns Review. Missing/zero TO yields no rate or classification. Rates above 100% are allowed.

The reference readiness service was inspected read-only: it imports unit classifications from an aggregate snapshot and computes overall fill-up as sum(actual)/sum(TO)*100. The supplied workbook formulas are the explicit threshold evidence used here.

Validation: `docker compose exec -T api python -m pytest test_strength.py -q` covers boundary values, zero/missing TO, overfill, and an isolated PostgreSQL PAFFS draft/publication/C1 workflow. The live C1 dashboard was visually checked with 1,144 actual, 1,481 TO, 77.25%, R2. The workbook remains unchanged.
