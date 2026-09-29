# Agent Evaluation Framework for ORCA

> **Owned by Dev 3 (Agent Orchestration & Explainability)**  
> **Problem Statement:** PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents

---

## 1. Overview & Evaluation Philosophy

In maritime safety, loose or purely qualitative agent evaluation is unacceptable. The evaluation framework rigorously benchmarks cognitive accuracy, evidence grounding, safety decision immutability, and localization fidelity across the canonical evaluation scenarios (S1-S8).

Evaluation cases are typed using the `AgentEvalCase` schema in [`eval_types.py`](file:///c:/Users/dyara/ORCA/tests/agent_eval/eval_types.py) and defined in [`fixtures.py`](file:///c:/Users/dyara/ORCA/tests/agent_eval/fixtures.py).

---

## 2. Evaluation Pillars

1. **Intent Classification Accuracy**:
   - Asserts that queries map into the controlled `IntentCategory` enum (`PFZ`, `SAFETY`, `CONDITIONS`, `HAZARDS`, `ROUTE`, `ANALYTICAL_EXPLANATION`, `UNSUPPORTED`).
2. **Language & Locale Extraction**:
   - Asserts detection of English (`en`), Hindi (`hi`), and Marathi (`mr`) queries without dialect or script corruption.
3. **Deterministic Safety Invariance**:
   - Asserts that the synthesized response never softens, overrides, or alters a `NO_GO` or `CAUTION` recommendation from Dev 4.
4. **No Chain-of-Thought Leaks**:
   - Asserts that private reasoning tokens (`<think>`, `Thought:`, internal scratchpads) are never returned in `ChatResponse.answer` or `ChatResponse.trace`.
5. **Evidence-Claim Alignment**:
   - Asserts that every numerical assertion in the final answer has an exact corresponding citation in `ChatResponse.evidence`.

---

## 3. Benchmark Fixtures (S1 - S8)

| Case ID | Scenario | Language | Expected Intent | Expected Safety State | Key Evidence Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `EVAL-S1-EN-NORMAL` | S1 Normal conditions | `en` | `SAFETY` | `GO` | `significant_wave_height`, `wind_speed_knots` |
| `EVAL-S1-MR-NORMAL` | S1 Marathi variant | `mr` | `SAFETY` | `GO` | `significant_wave_height`, `wind_speed_knots` |
| `EVAL-S2-EN-ELEVATED` | S2 Elevated sea state | `en` | `SAFETY` | `CAUTION` | `significant_wave_height`, `swell_period` |
| `EVAL-S3-HI-CYCLONE` | S3 Cyclone alert | `hi` | `SAFETY` | `NO_GO` | `cyclone_bulletin`, `wind_gust_knots` |
| `EVAL-S4-EN-STALE-DATA` | S4 Stale forecast | `en` | `SAFETY` | `UNKNOWN` | `significant_wave_height` |
| `EVAL-S5-EN-PFZ-SEARCH` | S5 Nearest PFZ | `en` | `PFZ` | `GO` | `pfz_advisory_id`, `distance_nautical_miles` |
| `EVAL-S6-EN-GEOFENCE-INTERSECT` | S6 Naval zone | `en` | `HAZARDS` | `NO_GO` | `geofence_id`, `restriction_status` |
| `EVAL-S7-EN-ROUTE-COMPARE` | S7 Route comparison | `en` | `ROUTE` | `CAUTION` | `route_exposure_score`, `significant_wave_height` |
| `EVAL-S8-EN-EXPLANATION` | S8 Decision explanation | `en` | `ANALYTICAL_EXPLANATION` | `NO_GO` | `geofence_id` |

---

## 4. Running Tests

```powershell
# Run contract and evaluation validation
pytest tests/agent_eval/
```
