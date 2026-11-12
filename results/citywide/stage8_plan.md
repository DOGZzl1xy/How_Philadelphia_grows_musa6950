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

---

## Amendment 1 (2026-11-10, approved by the author, before any photograph of a sealed ZIP code is downloaded or judged): frozen settings

Development in ZIP 19146 is finished (3,262 candidates of both tiers, 2,151 observable and judged; model calls so far
$11.97). The settings below are frozen in `results/citywide/stage8/FROZEN` and in the code at commit 01783c7; the
sealed evaluation and the application to the other ZIP codes use them unchanged.

**Frozen**

| Setting | Value | Evidence from 19146 |
|---|---|---|
| Candidates | **Tier 1 only.** | Tier 2 raised the share of LiDAR pop-ups found from 31.9% to 46.4%: +14.5 points, under the 15 set beforehand, so it is not adopted (r per cell 0.72 → 0.74). |
| Photographs | Slots as planned, plus **an older baseline**: when there is no photograph from 2016-01 to 2018-04, the latest one before 2016 is added in front. | Where the first photograph was from 2019, 12 of 17 LiDAR pop-ups were judged unchanged: they were already built. With the older baseline 126 instead of 106 of the 163 observable tier-1 LiDAR pop-ups are seen taller. |
| View | 720 px, 95° wide, pitched 22° up, aimed at the side of the lot facing the camera. | Unchanged from the pilot. |
| Judge | Gemini `gemini-3.8-flash`, low reasoning effort, **prompt v1** (`scripts/stage8_judge.py`). | Prompt v2 (set-back roof structures and deck railings count as taller) found 3 more of 37 missed pop-ups and added 6 false alarms on 150 unchanged units: rejected. |
| Estimate per cell (primary) | **Imputed:** a candidate without photographs gets the mean credit of the observed candidates of the same source (model 2018→2020, model 2022→2024, both pairs, upward permit) in the same area. It uses street-view verdicts only, no LiDAR label. | The planned estimate counted candidates without photographs as zero. A third of the candidates have none, unevenly by street: r = 0.72 observed only, 0.87 imputed. |
| Calibration factor | 1.797 (LiDAR total ÷ imputed estimate, tier 1, 19146). | Does not affect r. |

**Reported next to the primary estimate, without a gate:** the observed-only estimate, and a baseline that uses no
single photograph (every candidate gets the mean credit of its source; in 19146 r = 0.84, plain candidate count 0.80).
The author's decision: the aim is to identify pop-ups, the candidates and the photographs are one method, so the
baseline is given for information and no second criterion is added. The gate stays r ≥ 0.8 per 250 m cell for the
primary estimate.

**Also found in development**

- Of the 392 LiDAR pop-ups of 2018→2022 in 19146, 249 are tier-1 candidates, 163 of these are observable and 126 are
  seen taller. Candidates on streets without a photograph after 2022 are the largest loss; most of those streets were
  last driven in 2019.
- Of the observed tier-1 candidates, 19% are LiDAR pop-ups of 2018→2022; 50% of those judged taller, 6% of those
  judged otherwise. Most other units judged taller changed between the 2019 and the 2024–25 photographs, which is the
  second LiDAR period.
- Validation blocks (units the screening model did not train on): 75 observable LiDAR pop-ups, 61% seen taller;
  152 observable top-scored units without LiDAR change, 68% no change, 11% taller, 11% new building.
- Misses looked at: additions set back behind the cornice and hidden from a camera a few metres in front, oblique or
  mis-aimed views, trees.
- 19146 lies in the screening model's training area, so its candidates are better there than in the sealed ZIP codes
  (the model alone reached r = 0.42 there).

**Order from here:** photographs of the sealed ZIP codes (917 tier-1 candidates), judging, the evaluation once
(`scripts/stage8_eval.py --area sealed`, lock file `stage8/sealed_eval_log.csv`), then the other ZIP codes.

---

## Execution record: sealed evaluation (2026-11-10 23:07, run once, lock `stage8/sealed_eval_log.csv`)

Settings of amendment 1. 917 tier-1 candidates in the 8 sealed ZIP codes; 560 observable (61%; in the far north-east
ZIP 19116 only 8 of 152) and all judged: 459 no change, 34 taller, 25 new building, 42 unclear. 584 cells, 96 LiDAR
pop-ups (47 + 49) in 65 cells, at most 4 in one cell. Results in `stage8/eval_sealed.json`, per cell in
`stage8/cells_sealed.csv`.

| Estimate | r per 250 m cell | 95% interval |
|---|---|---|
| **Primary: street view, candidates without photographs imputed** | **0.54** | 0.39–0.66 |
| Street view, observed candidates only | 0.50 | 0.35–0.62 |
| Baseline without any photograph (candidates × mean credit of their source) | 0.56 | 0.42–0.67 |
| Plain count of candidates | 0.35 | 0.23–0.46 |

**The gate (r ≥ 0.8) is not passed.** Also: r = 0.67 per block group (167 block groups); r = 0.53 on the 130 cells
with at least 90% LiDAR coverage in 2018 (41 pop-ups); calibrated estimate 63 against 96 LiDAR pop-ups (ratio 0.65,
with the factor from 19146). The primary estimate is 0.19 above the plain candidate count (interval 0.05 to 0.33) and
not different from the baseline without photographs (−0.02, interval −0.15 to 0.11). For reference, the aerial
model alone had r = 0.42 for pop-ups in these ZIP codes (2022→2025 only).

What the verdicts show about the candidates here: of the judged candidates with an upward-addition permit, 24% are
seen taller (14 of 58); of those chosen by the model score alone, 4% (20 of 502). 12 of the 96 LiDAR pop-ups lie in
cells without any tier-1 candidate.

**Consequence, as set in the plan:** the numbers are reported as they are; pop-ups stay a LiDAR-only result and no
street-view pop-up map of the study area is published. The unit-level findings of development (19146 and the
validation blocks) are reported with it. The sealed evaluation is not run again.

---

## Amendment 2 (2026-11-10, asked for by the author after the sealed evaluation): find and map pop-ups

A new aim, set after the result above and not a test: **find where pop-ups happened and mark the buildings on a map
kept on the author's machine.** Counting pop-ups per cell did not pass the gate; finding them does not need every
pop-up, only that the marked buildings are right. The sealed evaluation and its record stay as they are.

1. **Hot cells from the aerial model.** A 250 m cell is hot when the model flags at least 3 buildings as grown over its
   two long pairs (2018→2020 and 2022→2024, stage 6): 571 cells, 14% of the cells outside high-rise blocks
   (`stage8/hot_cells.csv`). Outside the sealed ZIP codes they hold 85% of the LiDAR pop-ups of 2018–2025.
2. **Candidates in hot cells, both tiers:** model score or upward-addition permit (5,955 units) and zoning permit for an
   addition or new development (9,446); 15,401 in 38 ZIP codes, 11,434 of them not yet photographed. Tier 2 is used
   here because the aim is to find buildings, not to pass the count rule of amendment 1.
3. **Photographs and judging** exactly as frozen in amendment 1 (slots with the older baseline, view, Gemini, prompt v1).
4. **Output, local only** (under `data/`, never committed or published): a table of the buildings judged taller with
   the photographs between which they changed, and an interactive map that marks each of them, coloured by when the
   change appears, with the timeline photographs on click; buildings whose change may predate the 2018 flight are
   marked apart. Layers for "new building", "checked, no change" and "no photographs" show what was looked at.
5. **Check by hand:** 60 marked buildings drawn at random are reviewed by the author on a blind page; the share that is
   right is reported.
6. **Spending:** about $33 more; the cap for model calls is raised from $40 to $50 (the limit the author set on the
   provider's side).

Limits: the map shows pop-ups confirmed from the street, not all of them (streets without recent photographs,
additions set back from the facade and buildings outside hot cells are missing); candidates from permits cannot show
unpermitted work, and the author decided not to pursue that.

**Note, 2026-11-11.** The hot-cell run reached the $50 cap with 1,026 zoning-permit candidates unjudged (South
Philadelphia ZIP codes 19147, 19148, 19145 and a few others): hot cells have more photographs than estimated (72% of
candidates observable). The author allowed up to $60; the script cap is set to $58, under the limit of $60 on the
provider's side, and the rest is judged with the same settings.

---

## Execution record: amendment 2, find and map (2026-11-10 night to 2026-11-11)

All 15,401 candidates in the 571 hot cells were photographed; 11,139 (72%) are observable and all of them are judged.
Model calls cost $54.53 in total for the stage. Map, table and review page are local
(`data/interim/stage8/map/`); nothing of them is committed.

| Candidates in hot cells | Judged | Taller | New building |
|---|---|---|---|
| Upward-addition permit | 737 | 343 (47%) | 6 (1%) |
| Model score only | 3,427 | 417 (12%) | 352 (10%) |
| Zoning permit | 6,975 | 752 (11%) | 2,267 (33%) |

**1,538 buildings are marked as taller between 2018 and 2025** (1,512 in hot cells, the rest from the development and
sealed runs), in 31 ZIP codes and 357 of the 571 hot cells: 523 first seen taller in the 2018–2019 photographs, 348
in 2020–2023, 667 from 2024 on. 468 of them carry the mark "may predate the April 2018 flight" (the last photograph
without the change is older than the flight); this mark is conservative, a house torn down and rebuilt gets it when
the photographs in between show a building site. 2,668 further candidates are judged "new building". For scale:
LiDAR counted 2,215 pop-ups in the study area in 2018–2025; the two numbers are not the same thing (street view
includes rebuilds and some changes from before 2018, and misses streets without photographs and additions hidden
from the street).

**Check by hand (the author, 2026-11-11, blind page, 80 buildings drawn when 1,437 were marked):** of 60 marked
buildings, 2 were unclear; of the other 58 the author calls 47 taller (81%, 95% interval 69–89%), 10 a new building on
a lot that was empty in the earlier photograph, and 1 unchanged (the neighbour had grown). Of 20 buildings judged
"no change", the author agrees on 17 and sees 3 as taller. So a mark on the map is almost always a real construction
(57 of 58); about four in five are an addition or a taller rebuild, the rest new buildings, most of them among the
zoning-permit candidates. Records of 2016 (building description) and 2017 (footprints) do not separate the two well
(they catch 4–5 of the 10 new buildings and 3 of the 47 others), so no filter is applied. Result in
`stage8/review_marked.json`.

Two weaknesses seen in the check: the target mark sometimes falls between two narrow rowhouses, and "taller" and
"new building" are confused when an old house was torn down before the first photograph.

---

## Amendment 3 (2026-11-11, asked for by the author): the candidates outside the hot cells, read by Gemini Decision 1

Google released Gemini Decision 1 on 2026-11-11: a model that writes no text and answers closed questions with
probabilities, at $0.10 per million input tokens (about $0.0005 per house, an eighth of Gemini 3.8 Flash). It was
tried on the photographs already judged, before deciding anything:

| Sample | Gemini 3.8 Flash | Gemini Decision 1 |
|---|---|---|
| 70 pilot pairs, same call as the reference | 63 | 60 |
| 80 houses judged by the author (drawn by Flash's verdicts, so in its favour): changed or not | 95% | 87% |
| same, exact class | 82% | 73% |
| first photograph that shows the change, on 50 houses both call changed | reference | the same on 47 |

Decision 1 is a little more cautious (9 of 50 houses the author calls taller are "no change" for it) and never answers
"unclear". Of the 47 houses it calls taller in that sample, the author calls 38 taller, 8 new buildings and 1 unchanged,
the same mix as for Flash.

**What is done.** The 8,418 candidates of both tiers outside the hot cells are photographed with the frozen rule, and
the observable ones that Flash has not judged are read by Decision 1 (`scripts/stage8_decision.py`): the verdict as a
choice of four, and the first photograph in which the house is taller. Houses it calls taller are added to the local
map and table with their reader noted. The results of amendment 2 inside the hot cells are not redone, and nothing is
compared with LiDAR again. Expected cost about $3; all model calls of the stage together stay under $58.50 (the
author's limit at the provider is $60), and the run stops at the first refusal without trying again.
