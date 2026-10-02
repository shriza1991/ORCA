# ORCA Safety & Risk Evaluation Model

> **SIH Problem Statement:** PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents  
> **Target Audience:** Fishermen, coastal vessel operators, researchers, disaster authorities  
> **Classification:** 12-Day SIH Functional Prototype Decision-Support System

---

## 1. Prototype Notice & Mandatory Disclaimer

> [!CAUTION]
> **PROTOTYPE DECISION-SUPPORT NOTICE**  
> ORCA is an experimental, functional artificial intelligence prototype developed for the Smart India Hackathon 2026. It is **NOT** a certified marine navigational aid, SOLAS-compliant life-safety system, or official substitute for statutory bulletins issued by the India Meteorological Department (IMD), Indian National Centre for Ocean Information Services (INCOIS), or the Indian Coast Guard. Mariners must always cross-reference official VHF broadcasts, port warning flags, and local harbor master directives before proceeding to sea.

---

## 2. Recommendation State Taxonomy

Every query evaluated by the Risk Engine must resolve into exactly one of the following five standardized states:

| Recommendation State | Definition & Operational Implication | Typical Criteria |
| :--- | :--- | :--- |
| **`GO`** | Favorable sea state and weather within craft safety limits. No active warnings or geofence breaches. | SWH < 1.8m, wind speed < 18 kts, no squall alerts, no boundary conflict, all data fresh. |
| **`CAUTION`** | Marginal conditions. Safe for larger or mechanized craft; elevated risk for non-motorized or small vessels. | SWH 1.8m–2.5m, wind gusts 20–28 kts, or route near restricted buffer zones. |
| **`NO_GO`** | **Dangerous conditions.** Immediate threat to life or craft integrity. Departure strongly advised against. | SWH > 2.5m (small craft), active IMD Cyclone / Squall Alert, gale warnings, or boundary penetration. |
| **`UNKNOWN`** | Critical data missing, unresolvable coordinates, or telemetry stale (>24h). Cannot certify safety. | Offline endpoint, no forecast available for target coordinate/timestamp. |
| **`INFORMATIONAL`** | Non-safety informational queries (e.g. marine species context, general landing center hours). | Educational or general knowledge inquiries where a safety decision is not requested. |

---

## 3. The Five Inviolable Safety Hard-Stops

These deterministic rules run in Python code (`backend/app/domain/risk_engine.py`) and **cannot be overridden by the LLM prompt**:

1. **Official Red Alert / Cyclone Rule**: Any active IMD Cyclone Warning, Depression Alert, or Red Coastal Advisory within 50 nautical miles of the departure or transit polygon immediately triggers an unconditional **`NO_GO`**.
2. **Maritime Boundary Hard-Stop**: Any route line-string intersecting a prohibited maritime polygon (e.g., naval firing zone, International Maritime Boundary Line) triggers a hard **`NO_GO`** with boundary coordinates highlighted on the map.
3. **Stale Data Preclusion**: If forecast data is older than 24 hours or completely missing, the engine **must never return `GO`**. It must return **`UNKNOWN`** or **`CAUTION`** with explicit data staleness warnings.
4. **LLM Non-Contradiction Gate**: The LangGraph response composer is bounded to never downgrade or soften a `NO_GO` issued by the risk engine. If the deterministic engine says `NO_GO`, the text must clearly convey `NO_GO`.
5. **No Hallucinated Marine Numbers**: Any numeric claim presented in the chat answer (e.g., "waves of 3.4m", "wind gusting to 35 knots") must exist within an attached `EvidenceItem`. If absent from evidence, it is stripped.

---

## 4. Deterministic Confidence Derivation

ORCA rejects arbitrary LLM confidence percentages (e.g., *"I am 94% sure"*). Confidence is computed purely based on **Data Provenance & Freshness**:

- **`HIGH`**: Both primary government sources (INCOIS + IMD) are online, fresh (<6h), and spatially congruent.
- **`MEDIUM`**: Primary forecast available, but secondary data relied on Open-Meteo fallback or snapshot cache (<12h old).
- **`LOW`**: Significant temporal gap (>12h old snapshot), degraded offline fixture, or localized cloud cover obscuring satellite SST/Chlorophyll.

---

## 5. Authoritative Source Precedence Hierarchy

When multiple sources provide data for the same geospatial area or time window:

1. **Safety & Cyclone Bulletins**: `IMD` (Cyclone Warning Division / Coastal Bulletins) has supreme authority over all international or secondary weather models.
2. **Ocean State Forecasts (Wave/Swell/Currents)**: `INCOIS OSF` holds primary authority. `Open-Meteo Marine` is strictly a secondary fallback.
3. **Fishing Zones (PFZ)**: `INCOIS PFZ` holds primary authority. Satellite SST/Chlorophyll feeds provide corroboration.
4. **Disaster Warnings**: `NDMA SACHET / CAP` broadcasts corroborate IMD coastal warnings.
5. **Maritime Boundaries**: Indian Navy, Coast Guard, and MoEFCC gazette coordinates override all general nautical charts.

---

## 6. Source Conflict & Fallback Resolution Policy

1. **Conservative Safety Default (The Max-Hazard Rule)**:
   - If IMD reports an active squall warning but a secondary model (e.g. Open-Meteo) indicates calm conditions, the system **MUST adopt the conservative IMD warning** and trigger `NO_GO` or `CAUTION`.
   - Never resolve a data conflict in favor of higher risk exposure.
2. **Fallback Degradation Invariants**:
   - In `HYBRID` mode, if a live primary service times out (>3.5s) or errors, the system falls back to a validated snapshot cache.
   - The response **MUST** append a degradation warning flag (`[SNAPSHOT-FALLBACK]`) to the `ChatResponse.warnings` array.
   - A fallback payload can never certify a `GO` status with `HIGH` confidence.
3. **Stale vs. Conflicting Data**:
   - Telemetry older than 24 hours is classified as `STALE`.
   - In the presence of stale data, the decision status degrades to `UNKNOWN` or `CAUTION`, never `GO`.



## 2026-10-03: Mission comparison invariants (D069)

- Parameter comparison uses the retained evidence bundle; provider refresh is a separate operation. Missing/evicted IDs cannot silently fetch a replacement baseline.
- A well-formed, geographically applicable warning that overlaps **any part** of the mission can establish a restriction, including a warning beginning after departure. Expiry before the entire return window does not erase a restriction already known to apply during the trip.
- Operational source verification, simulated-source restrictions, and missing-evidence fail-closed behavior remain mandatory. An expired warning entirely before departure or an unavailable/degraded source cannot establish a verified active restriction.
- The complete controlled DEMO hazard corpus has its own coverage interval. A warning ending mid-trip does not expire that entire corpus. Outside retained scenario/forecast coverage remains unsupported; this exception does not extend live bulletin validity.
- Route ranking is not departure permission. NO_GO/UNKNOWN missions and routes with missing exposure/constraint evidence have no supported selectable corridor. Missing/expired PFZ evidence does not invent a target route.
- Apply adopts the exact returned assessment/mission times and caches that record; it does not run a different frontend safety calculation or silently refetch inputs.
- The existing six-hour browser cache expiry changes displayed status to UNKNOWN and revokes route support. Cached records are historical; no fresh clearance is implied.
- Changing vessel, delay, response language, voice/text entry, or map presentation cannot override Python safety authority.
