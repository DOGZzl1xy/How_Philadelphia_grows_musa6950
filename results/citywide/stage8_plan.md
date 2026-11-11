# Stage 8: pop-ups seen from the street — fixed 2026-11-10, before any development run

Approved by the author on 2026-11-10 after a pilot in ZIP 19146 (availability of photographs and 70 blind pairs; files
kept locally). The author confirmed four points explicitly: the 8 sealed ZIP codes are used once more, for this stage
only; the comparison with LiDAR is weighted by LiDAR coverage; tier 2 needs +15 points in 19146 and a cost approval;
model spending is capped at $40. Later changes are appended as amendments before they are executed.

## Why

The sealed test showed that the aerial model cannot count pop-ups (r = 0.42 per 250 m cell, gate 0.8): an added
storey is nearly invisible from directly above. The instructor's suggestion is to look from the side. This stage
tests one design: **the aerial model and the permit record choose candidates, street-level photographs read by a
vision-language model confirm them.**

**Question.** Do pop-up counts confirmed from street-level photographs match LiDAR per 250 m cell (r ≥ 0.8), in
ZIP codes the screening model has never seen?

A pilot on 2026-11-10 (ZIP 19146, 2018→2022; files kept locally) supports trying: every sampled unit had street-level
coverage and 72% had a photograph on both sides of the period; of 40 LiDAR pop-ups, 30 looked taller in the photographs
(28 of 30 when the LiDAR median rise was at least 2.5 m); Gemini agreed with the reference call on 63 of 70 pairs at
$0.003 per pair. Photographs are dense in 2018-05 to 2019-12 (87% of candidates) and from 2024 on (about 60%), and
sparse in between (17% in 2020-01 to 2022-03).

## Inputs (all on disk; nothing lost has to be rebuilt)

| Input | Source |
|---|---|
| Units (526,887, outside high-rise cells 520,863) | `data/interim/citywide_units/` |
| Model pop-up scores, pairs 2018→2020 and 2022→2024 | `data/interim/stage6_scores/`, threshold from `stage6/meta.json` (−0.099, fixed on validation) |
| Permits 2014–2025, classified with `src/permits.py` | `data/raw/li/permits_studyarea_2014_2025.csv` |
| LiDAR pop-up counts and coverage per 250 m cell, 2018→2022 and 2022→2025 | `results/citywide/stage6/cells_250m.csv` |
| LiDAR labels per unit, 2018→2022, ZIP 19146 only | `results/popup_feasibility/flagged_parcels.parquet` |
| Validation predictions with LiDAR labels (29,353 units, 117 pop-ups) | `data/interim/unitcls_preds/m4s_s0_valbest_2018_2022.parquet` |
| Street-level photographs | Google Street View, read with the `streetlevel` package; official car captures only |

Per-unit LiDAR labels outside 19146 and the validation blocks no longer exist, so the comparison with LiDAR is made per
cell.

## Candidates

- **Tier 1 (all are checked): 8,493 units.** Model pop-up score above the fixed threshold in the 2018→2020 or the
  2022→2024 pair (7,414), or an upward-addition permit (`is_upward`) issued 2015-04-01 to 2025-04-30 (1,438).
  In ZIP 19146 the model scores alone reach 42% of the 2018→2022 LiDAR pop-ups (they see neither 2020→2022 nor
  2024→2025); model or upward permit reaches 63%.
- **Tier 2 (decided in development): 15,326 further units** with a zoning permit for an addition or new development
  (`is_zoning_dev`), same dates. In 19146 these permits reach 92% of LiDAR pop-ups, but only 16% of them are pop-ups.
  Tier 2 is adopted, for every area alike, only if in 19146 it raises the share of LiDAR pop-ups found by at least 15
  percentage points and the author approves the extra cost (about $35–40 of model calls and two more nights of
  downloads).
- Candidates taken from permits cannot find unpermitted pop-ups (3.6–9.1% of LiDAR pop-ups in RQ3); only the model
  candidates can.

## Photographs (rule D: a timeline per unit)

- Camera spot: the official capture point nearest the lot, at most 30 m away; up to 4 spots are tried and the first with
  photographs in both waves is used. Captures more than 35 m from the lot are dropped.
- Slots, one photograph each: (0) latest in 2016-01 to 2018-04; (1) earliest in 2018-05 to 2019-12; (1b) latest in
  2018-05 to 2019-12 if from another year; (2) latest in 2020-01 to 2023-12; (3) latest in 2024-01 to 2025-06, else
  the earliest after that.
- A unit is **observable** if it has a photograph from 2016-01 to 2019-12 and one from 2024-01 on. Others are not
  judged; the observable share is reported per area.
- View: flat view cut from the panorama (720 px, 95° wide, pitched 22° up) aimed at the side of the lot that faces the
  camera, target marked at the top centre. The pilot's settings; they may change in development.

## Judging

- Gemini `gemini-3.8-flash`, low reasoning effort, all photographs of a unit in one call, in date order. It returns the
  storeys in each photograph, the first photograph in which the target is taller (or none), and a verdict: taller,
  new building (empty lot in the first photograph), no change, unclear. A new facade alone is no change; a change on a
  neighbouring building is no change.
- **Pop-up = verdict "taller".** Its change interval runs from the last photograph that is not taller to the first that
  is. "New building" is new construction, not a pop-up.
- The model gets photographs and the fixed instruction only: no address, coordinate, permit or score.

## Comparison with LiDAR (rule C: 2018 → 2025 as one span)

- Each pop-up is split between the two LiDAR periods by the share of its change interval that falls in each
  (2018-04-15 to 2022-03-30, and from there to 2025-04-18); the part outside both is dropped.
- LiDAR saw only part of the units in 2018 (64% citywide), so the street-view count of a cell is weighted by the
  LiDAR coverage of the cell in each period: estimate = coverage₁ × Σ share₁ + coverage₂ × Σ share₂. It is compared
  with the LiDAR pop-ups of both periods added together.
- One calibration factor (LiDAR total ÷ estimate total), fitted in development, turns estimates into counts. It does
  not affect r.

## Areas

| Area | Role | Size |
|---|---|---|
| ZIP 19146 | **Development.** Prompt, view, slots, tier-2 decision and calibration factor are settled here, against its per-unit LiDAR labels (2018→2022) and its cells. | 1,278 tier-1 candidates, 392 LiDAR pop-ups |
| Validation blocks | **Unit-level check** on units the screening model did not train on: the 117 LiDAR pop-ups and the 234 highest-scored units without LiDAR change; share seen taller and share seen unchanged. | 351 units |
| The 8 sealed ZIP codes | **Sealed evaluation, run once.** Cells with at least 95% of their units in these ZIP codes. | 596 cells, 917 tier-1 candidates, 96 LiDAR pop-ups (47 + 49) in 65 cells |
| All other ZIP codes | **Application.** Same pipeline; results reported with the note that the screening model trained on part of this area. | about 6,300 tier-1 candidates |

Everything applied to the sealed ZIP codes is frozen first in an amendment to this file (prompt text, view, slots,
tiers, calibration factor, code commit). No photograph of a sealed ZIP code is judged before that. The run writes a
lock file (`stage8/sealed_eval_log.csv`) and refuses to run again. The two earlier sealed tests are not touched.

## Criteria (set before any result)

- **Primary: r ≥ 0.8** between calibrated street-view pop-up estimates and LiDAR pop-up counts per 250 m cell in
  the sealed ZIP codes, with a 95% bootstrap interval over cells. For reference, the aerial model alone reached 0.42
  (2022→2025).
- Also reported, without a gate: r at block group; count ratio; r on the cells with at least 90% LiDAR coverage in
  2018 (133 cells, 41 pop-ups); observable share; unit-level shares from 19146 and the validation blocks.
- **If the gate is passed:** street-view pop-ups are reported per cell for the study area, and pop-ups are dated as far
  as the photographs allow (already there in the 2018–2019 photographs or not). **If not:** the numbers are reported
  as they are and pop-ups stay a LiDAR-only result.

## Limits known in advance

- With 96 LiDAR pop-ups in the sealed ZIP codes, the interval around r will be wide.
- About 40% of candidates are not observable; rear additions and lots that do not face a driven street cannot be seen.
- The two photograph waves do not line up with the 2022 flight, so street view cannot separate 2018→2022 from
  2022→2025 for most units.
- In 19146 the pilot found that LiDAR pop-ups with a median rise under 2.5 m rarely look taller from the street
  (2 of 10); the two sources do not measure exactly the same thing.

## Privacy and conduct

Photographs, per-unit tables and review pages stay under `data/` and are never committed or published; committed
results are per cell or totals. Downloads run in one stream with pauses and stop on repeated refusals; nothing is done
to get around a refusal. Model spending is capped at $40 without a new approval.

## Budget and order of work

| Step | Photographs | Model cost | Time |
|---|---|---|---|
| 1. Pipeline + development in 19146 (tier 1 and tier 2) | about 8,000 | about $8 | 2–3 days |
| 2. Validation-block check | about 1,000 | about $1 | half a day |
| 3. Amendment 1: freeze; sealed evaluation, once | about 2,200 (tier 1) | about $2 | 1 day |
| 4. Application to the other ZIP codes | about 15,000 (tier 1) | about $15 | 2–3 days, downloads overnight |
| 5. Figures, report section, website (deploy only on approval) | – | – | 3–4 days |

Scripts go to `scripts/stage8_*.py`, results to `results/citywide/stage8/`.
