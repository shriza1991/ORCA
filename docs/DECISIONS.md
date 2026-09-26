# ORCA Decisions

Only cross-cutting decisions go here.

## D001 — Modular Monolith
Status: ACCEPTED

Keep the initial product as a modular monolith with bounded internal contexts.

Reason: Faster parallel development and simpler deployment.

## D002 — Deterministic Safety Authority
Status: ACCEPTED

Deterministic domain code owns safety states, constraints, geometry, and threshold calculations.

Reason: Safety-critical calculations must be reproducible and auditable.

## D003 — Evidence-First Provenance
Status: ACCEPTED

Recommendations retain source, time, validity, quality, and authority metadata.

## D004 — Contract-First Parallel Development
Status: ACCEPTED

Shared interfaces are changed before dependent consumers.

## D005 — LIVE / HYBRID / SNAPSHOT
Status: ACCEPTED

All external data paths explicitly declare operating mode.

## D006 — Develop as Integration Branch
Status: ACCEPTED

Members work on team/* branches, merge continuously to develop, then promote verified releases to main.

## D007 — Mission Twin as Core Differentiator
Status: ACCEPTED

Mission-level reasoning, counterfactual simulation, and alternatives are core product capabilities.

## D008 — Ecosystem-First Positioning
Status: ACCEPTED

ORCA consumes and orchestrates existing authoritative services instead of claiming to replace them.

## D009 — Pilot Before National Scale
Status: ACCEPTED

Prove one geography deeply before broadening coverage.

## D010 — Official-Source Precedence Hierarchy
Status: ACCEPTED

Decision:
IMD is the supreme authority for severe weather and cyclone alerts. INCOIS is the primary authority for ocean state forecasts and PFZ advisories. Secondary models (Open-Meteo) act strictly as unauthoritative fallback.

Reason:
Maritime safety requires deterministic, legally defensible, and conservative decisions. Under conflicting telemetry, the system always adopts the conservative hazard state.

Impact:
Connectors and risk engine always prioritize official bulletins over secondary models.

## D011 — Provider Status Taxonomy
Status: ACCEPTED

Decision:
Classify every data source under exactly one status: `LIVE`, `LIMITED`, `CACHED_REAL`, `HISTORICAL`, or `MOCK`. Never mark a source as `LIVE` without verified machine-readable execution at runtime.

Reason:
Prevents AI agents and developers from conflating declared endpoints with verified live access.

## D012 — Snapshot Fallback and Provenance Tagging Policy
Status: ACCEPTED

Decision:
In `HYBRID` mode, when a live provider request times out (>3.5s) or fails, the connector falls back to pre-seeded authoritative snapshots, explicitly flags `[SNAPSHOT-FALLBACK]` in warnings, and downgrades derived confidence.

Reason:
Ensures zero-crash resilience during operational connectivity drops while maintaining strict transparency.

## D013 — Pilot Geography Scope (Maharashtra / Konkan Coast)
Status: ACCEPTED

Decision:
Anchor the P0 MVP implementation around Ratnagiri, Malvan, and the Konkan marine corridor (covering active INCOIS PFZ sectors, Malvan Marine Sanctuary, and Goa naval firing sectors).

Reason:
Allows deep, end-to-end multi-source validation across real coastal landing centres before scaling nationally.

## D014 — Single Source of Truth for Sector Surveillance and Zero Operational Frontend Mock Fallbacks
Status: ACCEPTED

Decision:
1. Authority fleet surveillance sectors are authored and stored canonically in the backend synthetic dataset (`sectors.json` / `GET /api/v1/demo/sectors`). The frontend consumes this dynamically; `frontend/src/utils/geo.ts` retains presentation formatters and offline dropdown names only, never maintaining duplicate authoritative geometries.
2. The frontend must never fabricate operational telemetry (vessel coordinates, GPS replay tracks, alert counts, or hazards) in offline mode. If the backend is unreachable or a sector contains zero vessels, the UI displays explicit offline/empty state banners rather than synthetic fallback tracks.
3. All seeded vessels (`vessel-01` to `vessel-08`) have canonical synthetic replay data seeded in `replay_positions.json`, mapping strictly to their home harbors (Ratnagiri: `vessel-01`..`04`; Malvan: `vessel-05`..`08`).

Reason:
Eliminates ghost tracks, false operational telemetry, and hardcoded map locations across surveillance decks.

Impact:
Guarantees end-to-end data integrity from backend synthetic generator to MapLibre viewport.

## D015 — Non-Fabricating Handling of Partial Upstream Payloads in Risk Evaluation
Status: ACCEPTED
Decision:
1. Make `harbor`, `observed_at`, and `valid_to` optional (`Optional[str] = None`) on `MarineConditionsPayload`, `WeatherConditionsPayload`, and `HazardBulletinPayload` rather than required strings.
2. Under no circumstances may missing values be fabricated (no invented harbor names, no current time substituted for missing observation/validity timestamps, no default zero values).
3. In `specialist_tools_node`, dictionary tool results are safely extracted by filtering to declared model fields, safely aliasing compatible keys (e.g. `sea_surface_current_knots` -> `surface_current_knots`), and handling unexpected schema errors gracefully without crashing.
4. Genuinely required safety measurements (e.g. `significant_wave_height_m`) continue to trigger `RecommendationStatus.UNKNOWN` if absent or None, preserving all F02/F03 safety invariants.
5. In `tests/conftest.py`, ensure the shared `tool_registry` baseline starts with contract mocks so test suites are isolated from production connector registration in `main.py`.

Reason:
Upstream connectors, test doubles, and evaluation stubs frequently provide partial observations. Raising uncaught Pydantic `ValidationError` crashed the agent pipeline before deterministic risk evaluation could execute its safety checks.

Impact:
Eliminates crashes on partial marine payloads across agent evaluations while strictly preventing any fabricated data or weakened safety boundaries.
Owner: Dev 2 / Dev 3
Date: 2026-09-13

## D016 — Request-Scoped Authority Chat Sector Context
Status: ACCEPTED

Decision:
Authority chat sends a canonical sector `public_id` in `ChatRequest.user_context.sector_id`. The API validates it against canonical sector data and derives the harbor and coordinates for that request. This explicit request context takes precedence over stored conversation context and client-provided harbor values.

Reason:
An Authority operator can switch sectors while retaining conversation history. The current request must never inherit a previous sector or the Ratnagiri fallback.

Impact:
No global current-sector state is introduced. Existing chats without `sector_id` remain backward compatible; invalid sector IDs are rejected with HTTP 422.

Owner: P0-7 integration
Date: 2026-09-13

## D017 — Canonical Authority Hazard Applicability
Status: ACCEPTED

Decision:
Synthetic hazard provenance contains canonical `affected_sector_ids`. The shared domain resolver selects only `ACTIVE` hazards for a canonical sector. P0-6 situation counts, the sector-hazards API, and the Authority map use that resolver.

Reason:
The prior `/demo/hazards` sector query inferred relevance from display text and IDs, which was neither complete nor safe for map display.

Impact:
No frontend hazard geometry or sector matching is fabricated. Empty results remain distinct from a request failure.

Owner: P0-8A integration
Date: 2026-09-13

## D018 — Observational Vessel-Hazard Containment
Status: ACCEPTED

Decision:
P0-8B uses the latest canonical replay position as current vessel state and
returns an association only when that point is covered by a canonical active
hazard geometry. No proximity buffer, trajectory, or collision implication is used.

Owner: P0-8B integration
Date: 2026-09-13

## D019 — Derived Authority Operational Alerts
Status: ACCEPTED

Decision:
Operational alerts are derived deterministically and request-scoped from P0-8B
`IN_HAZARD_AREA` associations. Their stable ID combines sector, vessel, and
hazard; their severity is copied from the canonical active hazard.

Impact:
No notification table mutation, scheduler, alert lifecycle, risk scoring, or
duplicate records are introduced. Historical broadcast notifications remain
separate from current operational alerts.

Owner: P0-8C integration
Date: 2026-09-13

## D020 — Dedicated Researcher Lab Persona Dashboard & Modular Subdecks
Status: ACCEPTED

Decision:
1. Introduce a third dedicated operational persona in SAMUDRA: `Researcher Lab` (`researcher`), accessible as an independent card from `PortalPage` without altering the existing Fisher or Authority dashboards.
2. The Researcher dashboard is composed of 4 modular decks:
   - `Ocean Data Explorer`: Interactive multi-source marine observation monitoring (wave height, SST, wind, swell, currents) by harbor with historical observation timeline tables, satellite EO grid rasters (Chl-a, SST, cloud cover), PFZ advisory candidates, and active hazard bulletins.
   - `Data Source Monitor`: Live system diagnostics and data provider registry visualizing freshness, operating modes (LIVE, HYBRID, CACHED_REAL, SNAPSHOT), and authoritative precedence hierarchy (IMD -> INCOIS -> Open-Meteo).
   - `Scenario Lab`: Direct interface to the S1–S8 canonical benchmark test suite with individual and batch ("Run All") execution capabilities, KPI telemetry (status, confidence, evidence items, trace steps, execution latency), decisive factors, and warnings.
   - `Query Workbench`: Research-oriented conversational interface featuring pre-configured domain query chips, inline recommendation cards, collapsible inline evidence inspection tables, and agent execution trace timelines.
3. Architecture strictly follows zero-regression principles: Fisher and Authority pages remain untouched, and the researcher client (`researcher-client.ts`) uses graceful fallback to the backend's synthetic demo dataset (`/api/v1/demo/*`) when offline.

Reason:
Empowers marine scientists, oceanographers, and policy analysts to audit source evidence, test risk model sensitivities, and monitor environmental trends without compromising the mission-critical, high-stress interfaces of artisanal fishers and port authorities.

Impact:
Extends SAMUDRA's user taxonomy into research and analytics while keeping the codebase modular and cleanly segregated across personas.
Owner: Dev 1 / Dev 4 (Researcher persona)
Date: 2026-09-13

## D021 — Vessel-Anchored Surveillance Route Alternatives and Strict Seaward Clamping
Status: ACCEPTED

Decision:
1. Fleet surveillance route alternatives (Safest Inshore, Balanced, Direct Passage) are parameterized by `vessel_id` (`GET /api/v1/demo/routes/alternatives?vessel_id=...`), resolving the vessel's home harbor, voyage start coordinates, and target destination from canonical synthetic seed data.
2. Route corridors derive waypoints directly from verified maritime track points (`base_waypoints`), extracting authentic in-water courses for Inshore, Balanced (with offshore seaward arc), and Direct paths.
3. Synthetic fallback waypoints strictly clamp longitudes seaward (west of the harbor mouth into the Arabian Sea) to guarantee zero overland or inland dry ground crossings.
4. Terminal coordinates (`origin_coordinates` and `destination_coordinates`) are explicitly exposed in `RouteExposurePayload` and rendered dynamically as distinct Start (Emerald `#10b981`) and Destination (Amber `#f59e0b`) waypoint markers on the map, in the Mission Map Brief, and in the Fleet Telemetry scrubber deck.
5. Invariant layer counts in `createAuthorityRouteLayers` are strictly maintained, delegating terminal markers to dynamic MapView layers to prevent breaking contract assertions.

Reason:
Artisanal craft and patrol boats require visually clear departure and arrival points on their navigation corridors. Synthetic perpendicular offsets previously swung eastward near Ratnagiri, Malvan, and Veraval, crossing inland onto peninsular land.

Impact:
Guarantees 100% in-water maritime routing across all 14 fleet surveillance vessels and sectors while surfacing unambiguous start and destination terminals.

Owner: Dev 1 / Dev 4
Date: 2026-09-14

## D021 — Authoritative Marine Observation Source of Truth (OSF Fixture)
Status: ACCEPTED

Decision:
1. Establish `data/fixtures/synthetic/incois/osf_hourly_observations.json` as the authoritative single source of truth for SNAPSHOT/SYNTHETIC marine observations across SAMUDRA.
2. `SnapshotConnector` loads `osf_hourly_observations.json` directly and normalizes records via `IncoisOSFNormalizer.normalize()`.
3. `DataService` in `SNAPSHOT` and `SYNTHETIC` modes routes directly through `SnapshotConnector` without hardcoded dummy dictionaries or silent fallback to legacy static dataset files.
4. Legacy `marine_dataset.py` is isolated and cannot override or bypass fixture-backed observation values.

Reason:
Eliminates architectural source-of-truth contradictions where agent reasoning, `ObservationBundle`, and Researcher Lab demo APIs could evaluate differing marine values.

Impact:
End-to-end consistency from synthetic fixture -> INCOIS adapter -> ObservationBundle -> DeterministicRiskEngine -> Agent reasoning -> Researcher Lab API.

Owner: Dev 2 / Dev 4 (Integration & Marine Domain)
Date: 2026-09-14

## D022 — Real Groq LLM Integration with Sandboxed Invariants and Deterministic Safety Gate
Status: ACCEPTED

Decision:
1. Integrate real Groq LLM provider (`llama-3.3-70b-versatile`) into SAMUDRA runtime (`POST /api/v1/chat`) via `LLM_MODE="auto"`, while maintaining 100% offline fallback when `GROQ_API_KEY` is not provided.
2. The LLM is restricted to understanding intent/entities and fluent multilingual explanation synthesis; it NEVER evaluates marine conditions, risk categories, route geometry, or hazard alerts.
3. Strict safety invariance: `RecommendationStatus` (`GO`, `CAUTION`, `NO_GO`, `UNKNOWN`) is computed solely by deterministic domain engines (`DeterministicRiskEngine`, `RouteExposureEngine`, `GeospatialHazardEngine`). Any LLM draft attempting to alter this status is automatically overridden and intercepted.
4. Hallucinated citation gate: Responses from LLM are cross-referenced against authoritative evidence IDs collected during the run; any ungrounded citations (`[EV-...]`) are redacted before delivery.
5. Sandboxed prompt boundary: User messages are wrapped in `<user_query>` tags and sanitized to prevent prompt injection or system prompt overrides.

Reason:
Provides natural language interaction in English, Hindi, and Marathi without compromising maritime safety-critical guarantees and operational truth.

Impact:
Enables true conversational UX with zero hallucinated marine risk, transparent evidence citations, and seamless offline operation.

Owner: Dev 3 (Agent Orchestration & Explainability)
Date: 2026-09-18

## D023 — Groq Model Availability, Analytical Explanation Routing, and ThreadContext Initialization
Status: ACCEPTED

Decision:
1. Configure `qwen/qwen3.8-27b` as the active default/recommended Groq model for SAMUDRA runtime, replacing `llama-3.3-70b-versatile` which returned HTTP 404 `model_not_found` for project keys. Retain full environment override via `LLM_MODEL`.
2. Correct `ANALYTICAL_EXPLANATION` supervisor capability routing from unregistered `"explanation_context"` to real, existing deterministic capabilities: `["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"]` (and `"geospatial_hazard"` if geofence present). The response composer uses deterministic facts and risk assessment as ground truth for LLM analytical narrative.
3. Fix conversation thread context initialization in `RunRepository.create()` to store `ThreadContext(thread_id=thread_id).model_dump(mode="json")` instead of an empty `{}` dictionary, eliminating Pydantic `thread_id Field required` validation warnings.
4. Strengthen offline test isolation in `tests/conftest.py` with an autouse fixture resetting `memory_manager.store` and contract mocks between tests.

Reason:
Fixes runtime failures preventing real Groq model execution, eliminates supervisor abort on analytical/explanation briefings, and prevents memory initialization errors while maintaining all safety-critical invariants.

Impact:
Enables real Groq generation for situational and briefing queries without compromising deterministic safety authority.

Owner: Dev 3 (Agent Orchestration & Explainability)
Date: 2026-09-18

## D024 — Strategic Reconciliation: ORCA_AI_MASTER_CONTEXT.md as Canonical Strategic Source of Truth
Status: ACCEPTED

Decision:
The new `docs/ORCA_AI_MASTER_CONTEXT.md` supersedes the old `docs/ORCA_MASTER_CONTEXT.md` (now archived as `ORCA_MASTER_CONTEXT_v1_ARCHIVED.md`) as the sole strategic and architectural source of truth for ORCA.

Key changes from this reconciliation:
1. Document authority hierarchy established: Code+Tests → ORCA_AI_MASTER_CONTEXT.md → SAFETY.md → API_CONTRACTS.md → IMPLEMENTATION_PLAN.md → PROGRESS.md → DECISIONS.md
2. AGENTS.md updated to reference new master context
3. OWNERSHIP.md updated from 4-member (M1-M4) to 6-role (P1-P6) conceptual model
4. IMPLEMENTATION_PLAN.md reconciled with new P0/P1/P2 priority tiers
5. PROGRESS.md updated with honest regression/gap tables from §30 audit
6. Decision terminology mapping documented: current `NO_GO` ≡ new context's `AVOID`; `RESTRICTED` is a subtype. Code retains existing terms; equivalence is documented.

Reason:
Multiple AI sessions were reading different documents and gradually diverging the project's architecture. A single authoritative context prevents architecture drift.

Alternatives:
- Merge old and new contexts into one document (rejected: new context is comprehensive and intentionally supersedes)
- Keep both as co-equal (rejected: creates exactly the contradiction this reconciliation solves)

Impact:
All AI agents now read `docs/ORCA_AI_MASTER_CONTEXT.md` as their first strategic reference.
PROGRESS.md now honestly tracks regressions (R-1 through R-6) and gaps (G-1 through G-6) identified by the master context audit.

Owner: All
Date: 2026-09-21

## D025 — Supervisor Capability DAG and Specialist Tool Result Reconciliation
Status: ACCEPTED

- Date: 2026-09-23
- Agent/person: Antigravity AI Engine
- Task/context: Unifying conversational LangGraph specialist tool routing with the canonical trip assessment pipeline and M1 contract mocks.
- Decision:
  1. The supervisor planner node (`supervisor_node`) uses the canonical capability DAG `["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"]` when `tool_mode == "contract_mock"` or when `trip_assessment` is unavailable.
  2. In `specialist_tools_node`, when executing `trip_assessment`, the returned `Recommendation` dictionary is systematically unpacked and converted into standard tool state keys (`marine_conditions`, `weather_conditions`, `hazard_bulletins`, `risk_evaluation`) so downstream nodes (`evidence_validator`, `response_composer`) receive complete state regardless of invocation mode.
  3. M1 demonstration stubs (`marine_stub`, `weather_stub`, `risk_stub`) are preserved for contract mock modes while production paths invoke `AssessmentService.assess_trip()`.
- Why: Avoids duplicate decision execution paths while ensuring seamless compatibility across mock, contract, and live operational execution modes.
- Alternatives considered: Forcing all modes to run isolated raw sub-agent calls; rejected because it fragments assessment logic between API and chat.
- Affected areas: `backend/app/agents/graph.py`, `backend/app/services/assessment_service.py`
- Tests/verification: `tests/agent_eval/` (387 passed, 1 skipped).

## D026 — Deterministic Date String Parsing and DB Offline Resilience
Status: ACCEPTED

- Date: 2026-09-23
- Agent/person: Antigravity AI Engine
- Task/context: Hardening domain risk engine and assessment service for arbitrary natural language inputs and offline test environments.
- Decision:
  1. In `backend/app/domain/risk_engine.py`, date parsing for `reference_time` and `return_time` safely catches non-ISO string formats (e.g. conversational expressions like "tomorrow") and safely falls back to UTC `now`, preventing unhandled `ValueError` crashes.
  2. In `backend/app/services/assessment_service.py`, database persistence of `TripAssessmentRecord` is wrapped with a connection timeout safeguard that logs a graceful warning and continues execution when PostgreSQL/PostGIS is unreachable in offline test runs.
- Why: Eliminates runtime 500 crashes during natural conversational flows and guarantees offline test determinism.
- Alternatives considered: Raising 422 HTTP exceptions on non-ISO query inputs; rejected because natural language users frequently supply conversational time references.
- Affected areas: `backend/app/domain/risk_engine.py`, `backend/app/services/assessment_service.py`
- Tests/verification: `test_groq_llm_integration.py`, `tests/agent_eval/`.

## D027 — Multi-AI Collaborative Governance Protocol and Canonical Documentation Standard
Status: ACCEPTED

- Date: 2026-09-23
- Agent/person: Antigravity AI Engine
- Task/context: Establishing repository-wide multi-agent governance across Antigravity, Codex, and human contributors.
- Decision:
  1. Authoritative Strategic Context is crystallized in `docs/ORCA_AI_MASTER_CONTEXT.md` (and mirrored in `docs/ORCA_MASTER_CONTEXT.md`).
  2. A concise `AGENTS.md` at repository root defines the mandatory preflight, working lifecycle, and inviolable safety principles for all AI agents.
  3. `docs/PROGRESS.md` is maintained as the single factual current status board, updated after every meaningful change.
  4. `docs/DECISIONS.md` is maintained as the append-only engineering decision record.
  5. Epistemic principles are enforced across all pipelines: Missing evidence != zero risk; Unknown != safe; Forecast != observation; Mock != live; LLM != deterministic safety authority.
- Why: Prevents architectural drift, duplicate abstractions, stale claims, and silent conflicting decisions across concurrent AI and human sessions.
- Alternatives considered: Letting each agent create separate instructions or roadmaps; rejected due to inevitable context bloat and divergence.
- Affected areas: `AGENTS.md`, `docs/ORCA_AI_MASTER_CONTEXT.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- Tests/verification: Full suite verification.

## D028 — India MarineWatch Multi-Hub Platform Architecture & Real Data Foundation
Status: ACCEPTED

- Date: 2026-09-23
- Agent/person: Backend Platform & Geospatial UX Leads
- Task/context: Establishing real institutional feeds and nationwide GIS infrastructure adapted from Norwegian BarentsWatch multi-service platform.
- Decision:
  1. Ingest real coastal reference data: CMFRI Census landing centres, CAA registered coastal aquaculture farms, Indian maritime boundaries (12nm territorial waters, 24nm contiguous zone, 200nm EEZ, GEBCO depth contours, Angria Bank submerged coral atoll, and Malvan Marine Sanctuary).
  2. Implement the INCOIS Predicted Astronomical Tide (PAT) harmonic engine calibrated with M2, S2, K1, O1 tidal constituents for West Coast ports.
  3. Expose the 10 foundation API contracts: `/forecast/point`, `/forecast/route`, `/hazards/active`, `/fisheries/pfz`, `/ports/nearby`, `/aquaculture/sites/nearby`, `/coast/profile`, `/datasets`, `/search`, `/spatial/query`.
  4. Surface BarentsWatch UX patterns: interactive time scrubber (Now to +48h), layer registry toggles, dual Map/List views, click-to-inspect point panel ("What is here?"), and Open Data Catalogue.
- Why: Transitioning from synthetic fixtures to real data models delivers an authentic national marine intelligence system for India, providing verifiable provenance while strictly prohibiting generative AI hallucinations on critical maritime safety conditions.
- Alternatives considered: Continue exclusively with synthetic fixtures (rejected: does not meet the user's objective to make an authentic real-data system for India).
- Affected areas: `backend/app/api/v1/marinewatch.py`, `backend/app/services/marinewatch_service.py`, `backend/app/domain/tides.py`, `frontend/src/pages/MarineWatchPage.tsx`, `frontend/src/components/marinewatch/*`.
- Tests/verification: `tests/api/test_marinewatch_endpoints.py`, `frontend/src/components/marinewatch/marinewatch.test.ts`.


## D029 — P0/P1 Hard Constraint Ordering, Provenance Fallback Confidence, and Flagship Multi-Turn Engine
Status: ACCEPTED

- Date: 2026-09-23
- Agent/person: Antigravity AI Engine
- Task/context: Fulfilling canonical P0 and P1 requirements from `docs/ORCA_AI_MASTER_CONTEXT.md` and verifying the flagship multi-turn conversational loop.
- Decision:
  1. Enforced hard constraint hierarchical evaluation in `backend/app/domain/risk_engine.py` (Severe Weather / Cyclone -> Prohibited Geofence -> Critical Telemetry Missing -> Wave / Wind Vessel Ceiling -> Port Advisory Warnings).
  2. Implemented dynamic source provider inspection in `risk_engine.py` and decoupled complete fallback telemetry from automatic UNKNOWN degradation. Fallback sources receive tagged quality flags (`fallback_model`) with justified `ConfidenceLevel.MEDIUM` instead of blanket low confidence or collapsing valid predictions into UNKNOWN.
  3. Added canonical P1 intent classes and aliases to `backend/app/agents/intent.py` (`WHY` -> `ANALYTICAL_EXPLANATION`, `WHAT_IF`, `WHAT_CHANGED`, `ALTERNATIVE`, `ALERT_IMPACT`).
  4. Structured analytical explanation composer in `backend/app/agents/graph.py` to deterministically adhere to the canonical 5-step sequence: `[FACT / EVIDENCE]` -> `[RELATION / INFERENCE]` -> `[CONSTRAINT]` -> `[DECISION]` -> `[ACTIONABLE DIRECTIVE]`.
  5. Implemented backend multi-turn `DecisionDelta` in `backend/app/agents/graph.py` using persisted `ThreadContext.metadata["last_risk_assessment"]` to enable true "What changed?" scenario deltas across temporal revisions without requiring redundant round-trip payload retransmission.
  6. Verified the 4-turn flagship flow ("Can I go fishing tomorrow?" -> "Why?" -> "What if I leave at 11?" -> "What changed?") end-to-end in `tests/agent_eval/test_flagship_flow.py`.
- Why: Guarantees deterministic compliance with safety bounds, transparent causal explainability, and multi-turn scenario comparisons without LLM hallucination.
- Alternatives considered: Pure LLM-synthesized what-changed explanations; rejected because mathematical comparison between baseline and revised mission decisions must remain 100% deterministic in Python.
- Affected areas: `backend/app/domain/risk_engine.py`, `backend/app/agents/intent.py`, `backend/app/agents/graph.py`, `tests/agent_eval/test_flagship_flow.py`.
- Tests/verification: `test_flagship_flow.py` (100% passing), `tests/domain/` (18 passing), `tests/agent_eval/` (466 passing, 1 skipped).

## D030 — PostGIS Schema Versioning, SACHET CAP Harmonization, In-Memory Rate Limiting, and Telemetry
Status: ACCEPTED

- Date: 2026-09-23
- Agent/person: Senior Backend / Data Engineer (M2)
- Task/context: Durable persistence, disaster feed ingestion, rate limiting, and production telemetry.
- Decision:
  1. **PostGIS & Alembic Migration**: Added migration `e1a2b3c4d5e6_trip_assessments_and_alerts.py` versioning `saved_trip_subscriptions`, `actionable_alerts`, and `trip_assessments`. Retained GeoAlchemy2 spatial geometry for `map_layers` without forcing heavy PostGIS dependencies during hermetic test executions.
  2. **NDMA SACHET / CAP Integration**: Ingests Common Alerting Protocol (CAP 1.2 XML / JSON). Employs deterministic 2D ray casting for polygons and haversine distance for circular boundaries. Merges into `ConnectorManager` with worst-case safety harmonization against IMD hazard bulletins.
  3. **Backend Rate Limiting**: Implemented `RateLimitMiddleware` with an in-memory sliding window queue keyed by route type and client IP. Exempts health checks and test headers while returning HTTP 429 and `Retry-After`. Avoids premature Redis or distributed complexity for current deployment bounds.
  4. **Observability**: Implemented `ObservabilityMiddleware` injecting `X-Request-ID` and `X-Response-Time-Ms` response headers. Instrumented `ConnectorManager._execute` with execution latency, upstream source, mode, and error state logging, while `RedactingJsonFormatter` prevents secret and coordinate leaks.
- Why: Satisfies all M2 backend invariants: real-source integration, deterministic spatial checks, abuse prevention, production visibility, and epistemic honesty.
- Alternatives considered:
  - Introducing Redis for rate limiting (rejected as premature distributed infrastructure).
  - Merging SACHET alerts blindly over IMD (rejected: authority and worst-case severity must be harmonized without overwriting).
- Affected areas: `backend/alembic/versions/`, `backend/app/connectors/sachet.py`, `backend/app/connectors/manager.py`, `backend/app/api/middleware.py`, `backend/app/main.py`.
- Tests/verification: `tests/connectors/test_sachet_connector.py`, `tests/api/test_rate_limiting.py`, `tests/api/test_observability.py`, `tests/domain/test_spatial_db_repository.py`.

## D031 — Final ORCA Product Definition and Interface Split
Status: ACCEPTED

Decision:
1. ORCA is finalized as the Marine Mission Intelligence platform.
2. ORCA is not another marine data dashboard; it is the intelligence and reasoning layer above existing marine information systems.
3. ORCA has two interfaces sharing one intelligence core: a field-first mobile application and a web/institutional platform.
4. Mobile is the fisherman / field experience, optimized for mission setup, voice, GPS, decision support, WHY / WHAT-IF, map, alerts, and offline operations.
5. Web is the institutional / research / operations experience, optimized for broader analytics, role-specific views, evidence, replay, and operational complexity.
6. Mobile and web must not have separate decision logic; both consume the same ORCA backend / intelligence layer.

Reason:
A single intelligence core with differently scoped interfaces preserves product clarity, avoids duplication, and aligns the system with the final product identity and mission-oriented workflow.

Alternatives:
- Build one interface that tries to do all work (rejected: too heavy, weak for field use, and not aligned with the intended product split)
- Duplicate reasoning logic across mobile and web (rejected: creates drift and inconsistent decisions)

Impact:
The product architecture now clearly distinguishes field-first mobile UX from institution-first web UX while preserving a shared core.
Owner: Product / Architecture
Date: 2026-09-24

## D032 — Final Technology Stack and Distribution Model
Status: ACCEPTED

Decision:
1. Final mobile stack: React Native + Expo + TypeScript.
2. Final web stack: Next.js + React + TypeScript.
3. Web remains the primary frictionless demo and judging surface through the existing deployed web URL.
4. Mobile is a native field product for Android-first deployment using Expo / EAS; iOS remains future-facing.
5. Expo Web is optional and not the primary mobile strategy.
6. The mobile app is distributed as an installable EAS / Android application, not as a Vercel / Render host.
7. The web platform should not be replaced or redesigned in this task.

Reason:
This preserves the intended product flow: zero-install browser demo first, native mobile field experience second, one shared ORCA core behind both.

Alternatives:
- Treat Expo Web as the primary mobile strategy (rejected: it does not match the final native field-product goal)
- Move all product interaction into a second web application (rejected: adds friction for judges and weakens mobile-native field positioning)

Impact:
The documentation and product narrative now distinguish web demo access from native mobile distribution and align both with the shared intelligence layer.
Owner: Product / Architecture
Date: 2026-09-24

## D033 — React to Next.js Incremental Web Migration and Dual-Platform Alignment
Status: ACCEPTED

Decision:
1. Migration Strategy: Adopt an incremental "REUSE → ADAPT → EXTRACT → REWRITE" migration from React 18 / Vite to Next.js (App Router), creating `nextjs/` alongside the existing `frontend/` without deleting `frontend/` until the migration is fully verified.
2. State Management & API: Do NOT force Zustand or TanStack Query on Day 1. Reuse existing hand-rolled fetch clients (`client.ts`), React hooks (`useChat`, `useTripAssessment`, `useAlerts`), and pure TypeScript domain contracts directly, adapting environment variables (`import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*`). Introduce Zustand/TanStack Query later only where justified by real state-management friction.
3. Page Migration Order: Migrate `/fisher` first as the primary operational demonstration and fisherman workflow, followed by `/authority`, `/researcher`, `/marinewatch`, and `/settings`.
4. Shared Intelligence Core: Both Next.js (web institutional/demo) and React Native + Expo (field mobile) consume the exact same FastAPI backend intelligence and domain contracts (`POST /api/v1/chat`, `POST /api/v1/trip-assessments`, etc.). No decision logic, safety rules, or marine reasoning shall be duplicated on clients.
5. Platform Adapter Boundaries: Isolate browser-specific libraries (MapLibre GL DOM, Deck.gl, Web Audio, IndexedDB) to web via client boundaries and dynamic imports (`ssr: false`); mobile will use dedicated native adapters (`@maplibre/maplibre-react-native`, Expo AV, Expo SQLite, Expo Location).

Reason:
Minimizes risk and avoids simultaneous rewrites of routing, UI, and state management while proving end-to-end portability of the working Fisher experience.

Alternatives considered:
- Immediate full rewrite with Zustand, TanStack Query, Tailwind, and shadcn component replacements on day one (rejected: excessive simultaneous change without baseline verification).
- Maintaining separate backends or duplicate decision algorithms for mobile and web (rejected: creates drift, violates canonical safety invariants).

Impact:
`nextjs/` directory initialized for web; shared contracts reused verbatim; Fisher journey established as P0 priority; old `frontend/` preserved until verification is complete.
Owner: Lead Engineer / Architecture
Date: 2026-09-24

## D034 — Field Intelligence Network & Participatory Marine Observation Architecture
Status: ACCEPTED

Decision:
1. Architectural Framing: Introduce the "ORCA Field Intelligence Network" as a structured, privacy-preserving, trust-graded participatory marine observation layer. Reject framing as a generic social network, follower graph, or public social feed.
2. Domain Abstraction: Define canonical `CommunityObservation` and `AggregatedCommunitySignal` domain models within the Source Registry under the new `COMMUNITY` source category (`DataMode.USER_GENERATED`).
3. Core Interaction Loop: Implement the closed intelligence loop: `OBSERVE → REPORT → VERIFY → CORROBORATE → FUSE → REASON → INFORM → LEARN`. Fishermen contribute structured observations in 10-15 seconds and receive aggregated field signals and personal insights in return.
4. Privacy by Design: Enforce `APPROXIMATE` location sharing (5km / H3 spatial grid cell) by default to safeguard artisanal fishing grounds; catch quantities and targeted species are marked `PRIVATE` by default unless contributor explicitly opts in; contributor IDs and vessel identities are strictly scrubbed from peer-facing aggregates.

Reason:
Empowers mariners to act as distributed ground-truth sensors for localized ocean conditions without turning ORCA into an uncurated social network or exposing commercial fishing secrets.

Alternatives considered:
- Building an open social media feed with likes and followers (rejected: distracts from mission intelligence, introduces toxic engagement incentives, lacks scientific validity).
- Keeping ORCA as a pure one-way consumer of government satellite/model data (rejected: ignores invaluable hyper-local mariner knowledge and ground-truth validation).

Impact:
Extends Source Registry with `COMMUNITY` class; establishes `community_observations` DB schema and privacy bounds.
Owner: Product / Architecture
Date: 2026-09-24

## D035 — Strict Evidence Hierarchy and Deterministic Official Supremacy over Community Signals
Status: ACCEPTED

Decision:
1. Inviolable Invariant (C-1): Deterministic official safety constraints (IMD cyclone bulletins, prohibited naval/sanctuary geofences, vessel-specific wave height swamping ceilings) possess absolute authority. Community reports can NEVER override or soften an official `NO_GO` or `RESTRICTED` decision.
2. Invariant C-2 (Epistemic Honesty): The absence of community reports in a sector never implies safety (`Missing community reports != safe`).
3. Invariant C-3 (Explicit Lineage): All community observations surfaced in conversational reasoning or evidence drawers must be explicitly tagged as `[FIELD SIGNAL]`, displaying corroboration count, freshness window, and agreement status.
4. Invariant C-4 (Verifiable Trust Dimensions): Prohibit ungrounded decimal trust percentages (e.g. "87.4% trusted"). Trust is articulated strictly via categorical factual dimensions: identity state (`UNVERIFIED`, `PHONE_VERIFIED`, `ESTABLISHED`), evidence completeness (GPS, media), corroboration count ($N \ge 3$), and agreement with authoritative forecasts.
5. Invariant C-5 (Confidence Modulation Bounds): Community field signals may only modulate confidence between `MEDIUM` and `HIGH` (e.g. lowering confidence when credible field reports contradict an optimistic forecast, or raising confidence for a `CAUTION` advisory when multiple reports corroborate rough currents). Single uncorroborated reports cannot alter decisions.

Reason:
Maritime safety is safety-critical and legally defensible. Crowdsourced observations must inform situational awareness without compromising physical safety or introducing crowd-manipulation attack vectors.

Alternatives considered:
- Allowing crowdsourced reports to vote down an official IMD storm warning (rejected: catastrophic safety and liability risk).
- Collapsing trust into an opaque single score (rejected: creates false sense of precision and obscures provenance).

Impact:
Protects deterministic risk engine; codifies rules C-1 through C-5 across agent reasoning and explanation composing.
Owner: Safety / Architecture
Date: 2026-09-24

## D036 — Non-Blocking Phased Integration of Field Signals
Status: ACCEPTED

Decision:
1. Non-Blocking Status: The Field Intelligence Network is classified as a P1 feature stream. It MUST NOT block the ongoing React 18 → Next.js App Router migration (`W0`–`W8`) or the React Native + Expo fisherman MVP (`M0`–`M9`).
2. P0 Contract Alignment: The only P0 code touchpoint is an optional `source_type` enumeration attribute added to the shared canonical `EvidenceItem` contract (`"OFFICIAL" | "SCIENTIFIC" | "OPERATIONAL" | "COMMUNITY" | "DERIVED"`), with default `"OFFICIAL"` preserving 100% backward compatibility.
3. Execution Phasing: Full implementation (DB schema, API routes, mobile 3-step reporting, grid aggregation) begins during P1 after the core dual-client architecture is verified.

Reason:
Prevents scope creep from delaying the primary judging and demo milestones while guaranteeing clean architectural alignment in advance.

Alternatives considered:
- Forcing full community reporting into the initial P0 mobile MVP (rejected: excessive complexity that risks missing the P0 delivery timeline).

Impact:
Next.js and Expo P0 roadmaps proceed without impediment; contract schema is prepared for seamless P1 integration.
Owner: Lead Architect
## D037 — Integration of India MarineWatch into Operational Dashboards & Standalone Route Retirement
Status: ACCEPTED

Decision:
1. Standalone Route Retirement: Retire the standalone `/marinewatch` route and portal card, eliminating persona bifurcation and redundant map surfaces.
2. Operational Persona Integration:
   - **Researcher Lab (`/researcher`)**: Unified GIS Explorer (`gis` tab with MapLibre GL nationwide interactive map, click-to-query depth profiles, PAT tides, bookmark presets, and time scrubber) and Data Catalogue (§212) (`catalogue` tab with 30 institutional marine datasets).
   - **Authority Command Deck (`/authority`)**: CMFRI 30-Harbour Port Census Registry (`ports` tab with fleet breakdown, quays, VHF radio channels) and CAA Aquaculture Biosecurity Watch (`aquaculture` tab with certified brackishwater farms, salinity, water sources, audit compliance).
   - **Fisher Console (`/fisher`)**: INCOIS Astronomical Predicted Tide (PAT) water elevation above Chart Datum, tidal trends (Flood/Ebb), Next High/Low Water, DGLL coastal lighthouses, GEBCO bathymetric seabed depth in `OceanDetails.tsx`; and pelagic catch targets, recommended gear, distance/bearing in `PFZDetails.tsx`.
3. Dual-Client Parity: Enforce identical architectural parity across both Vite (`frontend/`) and Next.js (`nextjs/`) applications.

Reason:
Puts high-value institutional oceanographic intelligence directly at the point of action for each persona, eliminates navigation clutter, and aligns with the 3 core personas (Fisher, Authority, Researcher).

Alternatives considered:
- Retaining a separate 4th portal dashboard (rejected: disjointed UX, redundant GIS layers, split cognitive load).

Impact:
Portal simplified to 3 core operational cards; `/fisher`, `/authority`, and `/researcher` gain deep nationwide telemetry without regressions.
## D038 — Granular Dissolution of MarineWatch GIS into Fisher Console & Authority Command Deck
Status: ACCEPTED

Decision:
1. Complete Removal of Map Tab from Researcher Lab: Remove the GIS Explorer map tab (`OceanWatchGIS`) entirely from `ResearcherPage`, refining the Researcher Lab into a pure analytical and scientific workstation (Research Query Workbench, Ocean Data Explorer, Data Source Monitor, Scenario Lab, and Data Catalogue §212).
2. Granular Distribution of GIS Capabilities into Fisher Console:
   - Floating National Coastal Bookmarks: 13 quick-jump landmarks across all Indian coastal states directly embedded into the Fisher `MapView`.
   - Floating Multi-Hour Forecast Time Scrubber: Quick timeline scrubber (`Now`, `+3h`, `+6h`, `+12h`, `+24h`, `+48h`) directly embedded into the Fisher `MapView`.
   - Interactive Point Depth & Ocean Telemetry Inspector HUD: Click-to-inspect ocean telemetry querying backend spatial endpoints for seabed depth, distance to shore, continental shelf categorization, INCOIS predicted astronomical tide (PAT) elevation/trend, and nearest DGLL lighthouse aid.
   - Comprehensive Vector Layers: Integrated DGLL landfall lighthouses (optical ranges, elevations, VHF Ch 16), concentric geodesic PFZ thermal front polygons, IMD/INCOIS active hazard corridors, and marine protected areas (MPAs) / naval firing ranges directly into the Fisher base map layer stack.
3. Authority Command Deck Integration:
   - National Coastal Jump selector in the surveillance toolbar to inspect and coordinate maritime assets across all coastal states.
   - Real-time Astronomical Tide (PAT) & Draught Clearance status integrated directly into the CMFRI PortWatch Registry table.
4. Dual-Client Parity: Identical implementations deployed across both `frontend/` (Vite) and `nextjs/` (Next.js) codebases.

Reason:
Puts specialized navigational, bathymetric, and hazard data into the hands of the operators who make real-time at-sea and harbour management decisions (Fishermen and Coast Guard/Port Authorities), while removing map noise from the analytical Researcher persona.

Alternatives considered:
- Keeping an embedded map tab in Researcher Lab (rejected: user explicitly requested full breakdown and removal of map tab from Researcher Lab).
- Splitting features into new separate pages (rejected: causes fragmentation; embedding directly into existing map and operational cards provides immediate contextual value).

Impact:
Eliminates standalone GIS tabs completely; empowers Fisher Console with rich landfall aids, depth inspection, and time scrubbing; enhances Authority Deck with nationwide jurisdiction jumping and port tidal clearance; maintains 100% test integrity.
Owner: Product / Architecture
Date: 2026-09-25

## D039 — Authority Command Deck Layout Resilience & Semantic Design Tokens
Status: ACCEPTED

Decision:
1. Responsive Command Bar Containment: Replaced rigid horizontal flex wrapping on `.authority-command-bar` with contained horizontal scrolling (`overflow-x: auto; scrollbar-width: none`), compact gap spacing, and normalized chip heights, ensuring right-aligned telemetry chips (Verdict, Fleet, Hazards, Evidence) remain accessible across all viewport widths.
2. Complete Semantic CSS Migration for PortWatch & AquaWatch: Deprecated unsupported Tailwind utility classes in `PortWatchRegistry` and `AquaWatchRegistry` (which silently failed in Vite without Tailwind processors), replacing them with dedicated, maintainable semantic CSS classes (`.portwatch-*`, `.aquawatch-*`) in `components.css`.
3. Map Overlay HUD Viewport Margin Decoupling: In `DeckGLMapFoundation`, offset `deckgl-top-overlay` right margin from `10px` to `showControls ? 116px : 10px`, permanently eliminating visual collision with camera controls (`[Tactical 3D] [High Orbit] [2D Flat]`).
4. Strict Dark/Light Theme Tokenization: Replaced hardcoded inline hex colors (`#86efac`, `#f0fdf4`, `#166534`, etc.) with CSS variable tokens (`var(--color-*)`) across all Authority subcomponents, ensuring WCAG contrast compliance and zero visual leaks in dark mode.
5. Dynamic Status Pill Mapping: Configured `ScenarioBenchmarkDeck` to dynamically derive status pill CSS classes from `expected_status` rather than a hardcoded `.status-go` style.
6. 100% Dual-Client Parity: Enforced identical component refactoring and style definitions across Vite (`frontend/`) and Next.js (`nextjs/`).

Reason:
Resolves severe layout and visual breakdowns on the Authority dashboard that caused registry tables and card grids to collapse into unstyled plain text, command bar telemetry to clip off-screen, and map overlays to collide.

Alternatives considered:
- Introducing Tailwind CLI into the Vite build pipeline (rejected: adds build friction and dependency divergence from the pure vanilla CSS variable architecture).
- Statically hiding command bar chips on narrow screens (rejected: loss of critical situational awareness telemetry for operators).

Impact:
Guarantees robust responsive presentation, restores tabular and grid formatting for harbour and aquaculture registries, prevents camera control overlap, and preserves dark/light theme consistency.
Owner: Frontend / Architecture
Date: 2026-09-26

## D040 — Fisher Console Clutter Pruning & Interactive DOM Icon Markers
Status: ACCEPTED

Decision:
1. Operational Ocean Scoping: Completely prune 200nm sovereign Exclusive Economic Zone (EEZ) polygon fills, 12nm Territorial Waters fills, and 8km concentric circle PFZ thermal front polygons from the Fisher Console (`/fisher`) map layers.
2. Macro-Regional Weather Corridor Pruning: Filter active hazard GeoJSON layers so that macro-regional weather corridors spanning > 2.0 degrees (e.g. 700km IMD squall corridors covering 14°N to 21°N) and opposite-coast hazards are excluded from the local mariner map, while local hazards within harbor bounding box (~1.5°) are retained with subtle opacity (0.15 fill, 2.0px stroke).
3. Local Geofence Containment: Scope base boundaries and marine protected areas to local harbor operational vicinity (< 1.5° bbox), styled with subtle outlines (opacity 0.08, line width 1.5).
4. Replacement of Canvas Dots with DOM Icon Markers: Suppress MapLibre canvas circle point layers (`circle-radius: 0`, `circle-opacity: 0`) and render interactive DOM markers with `.marinewatch-custom-marker` and `.marinewatch-marker-inner`:
   - ⚓ `port-marker` for Departure Harbor Stations & Landing Harbours (`#0284c7`)
   - 🎯 `destination-marker` for Voyage Targets & Waypoint Destinations (`#f59e0b`)
   - 🗼 `lighthouse-marker` for DGLL Coastal Landfall Lighthouses (`#eab308`)
   - 🐟 `pfz-marker` for Potential Fishing Zone advisory locations (`#10b981`)
   - 🦐 `aqua-marker` for CAA Aquaculture facilities (`#f97316`)
   - ⚠️ `hazard-marker` for Point Marine Hazards (`#ef4444`)
   - ⛵ `vessel-marker` for Live Vessel Positions and Fleet Replay Tracking (`#2563eb`)
5. Interactive Mariner Experience: Click handlers on all markers open formatted mariner popup cards (`formatFishermanPopup`), hover scales markers by 1.32x with CSS drop-shadows, and container zoom listeners dynamically assign `[data-zoom-tier="overview" | "regional" | "detail"]`.
6. 100% Dual-Client Parity: Synchronized across Vite (`frontend/`) and Next.js (`nextjs/`).

Reason:
Eliminates extreme visual clutter that overwhelmed the fisherman's operational chart with multiple giant overlapping polygon fills, and replaces generic colored dots with intuitive nautical symbols directly recognizable by coastal fishermen.

Alternatives considered:
- Keeping 200nm EEZ with ultra-low opacity (rejected: fishermen operate within nearshore coastal waters; nationwide polygons still trigger zoom distortion and cognitive overload).
- Rendering icons on MapLibre canvas via SDF symbol sprites (rejected: requires external image loading and lacks hardware-accelerated CSS hover transitions, drop-shadows, and dynamic zoom tier adaptation).

Impact:
Provides a clean, calm, professional mariner navigation chart focused purely on the departure station, safe passage routes, lighthouses, and fishing zones.
Owner: Frontend / GIS / Safety
Date: 2026-09-26

## D041 — Dynamic Live Hourly Marine Forecasts and Real-Time Scrubber Integration
Status: ACCEPTED

Decision:
1. Eradicate Hardcoded Approximations: Remove all static coastal heuristic constants (such as fixed `base_wave = 1.2`, static wind, static SST) from `backend/app/services/marinewatch_service.py`.
2. Real-Time Open-Meteo Integration: Route point and route ocean state forecasts to live hourly marine queries (`marine-api.open-meteo.com`) and weather queries (`api.open-meteo.com`), extracting exact values for the targeted timestamp using `_select_hour_index(times, target_dt)`.
3. Physics-Grounded Fallback Modulation: If external forecast providers time out or are offline, calculate time-variant physics-grounded values (diurnal solar wind cycle, tidal modulation, distance-to-shore scaling) so unit and integration tests dynamically respond to time offsets (`+0h`, `+3h`, `+6h`, `+12h`, `+24h`, `+48h`) instead of returning flat constants.
4. API Layer Multi-Hour Parameters: Add `time_offset_hours` and `timestamp` query and body parameters to `GET /forecast/point`, `GET /forecast/route`, and `POST /spatial/query`.
5. Fisher Map Real-Time Telemetry & Scrubber:
   - Wire time scrubber buttons in `MapView.tsx` to fetch dynamic point forecasts and display a floating real-time telemetry badge (`🌊 Wave`, `💨 Wind`, `🌊 Tide`, `🌡️ SST`, `[GO/CAUTION/NO_GO]`).
   - Propagate time offset and departure timestamp to the entire Fisher Console via `onTimeOffsetChange`, dynamically refreshing `missionContext.departure_time`, `TripPlanDetails`, and `OceanDetails`.
   - Update map click spatial query inspector to evaluate ocean state and tidal curves for the selected scrubber hour.
6. Dual-Client Synchronization: Kept 100% parity across `frontend/` and `nextjs/`, retaining all 244 frontend vitest tests and 25 backend pytest tests green.

Reason:
Addresses user feedback ("nothing should be hardcoded. also forecast is not working it is same in fisher map") by connecting live hourly weather and wave APIs and ensuring time scrubber interactions dynamically alter ocean safety, tide elevations, and route recommendations.

Alternatives considered:
- Returning static mock tables with random jitter (rejected: violates epistemic data honesty rule §R05; must use genuine meteorological forecasts and authoritative INCOIS tidal equations).

Impact:
Fishermen and authority operators can step forward in time from +0h up to +48h to inspect projected wave conditions, tides, and wind gusts before leaving port.
Owner: Marine Data / Backend / Frontend
Date: 2026-09-26

## D042 — Production Demo API and Canonical Geography Hardening
Status: ACCEPTED

Decision:
1. All browser API clients must derive their backend base from `VITE_API_BASE_URL` (or the existing Next.js equivalent), with a relative `/api/v1` fallback only for local development proxies.
2. Canonical sector resolution is owned by `backend.app.domain.situation`; demo routes reuse that loader rather than maintaining independent fixture paths or display-name maps.
3. Fixture data remains authoritative when available. The in-memory sector/harbor registry is a geography-only degraded fallback and cannot provide live marine observations or alter deterministic safety decisions.
4. Intentional speech cancellation is not an application error; delayed utterances are invalidated when replaced or stopped so rapid UI transitions cannot enqueue stale guidance.

Reason:
Production failures were caused by mixed frontend origins, cwd-sensitive fixture consumers, and browser cancellation events being treated as failures. These changes harden deployment boundaries without changing the deterministic risk engine or epistemic safety states.

Impact:
Vercel-hosted clients route backend calls consistently, Ratnagiri and other canonical demo sectors remain resolvable when fixture paths are unavailable, and degraded states remain explicit and conservative.

Owner: Platform / UX
Date: 2026-09-26

## D043 — Production Persistence Boundary
Status: ACCEPTED

Decision:
1. Render production and staging require PostgreSQL/PostGIS during application startup and do not silently downgrade persistence to the in-memory offline store.
2. `DATABASE_URL` is the managed-service input; `SYNC_DATABASE_URL` is derived as a psycopg2 URL when not explicitly set, preserving local/test overrides.
3. Schema creation in production is migration-owned (`alembic upgrade head`); development/demo may retain `create_all` for hermetic setup.

Reason:
Silent persistence degradation is unsafe for an operational intelligence system. Render Managed PostgreSQL/PostGIS is the supported production path, while offline stores remain explicitly scoped to local/demo/test environments.

Impact:
Deployment failures become visible at startup, Alembic remains the production schema authority, and no database credentials are introduced into source control.

Owner: Platform / Infrastructure
Date: 2026-09-26

## D037 — M3 Canonical DecisionObject and Structured DecisionDelta Engine
Status: ACCEPTED

- Date: 2026-09-25
- Agent/person: Senior AI/Backend Systems Engineer (M3)
- Task/context: Implement, test, verify, and ship the M3 Decision/Risk/Reasoning MVP.
- Decision:
  1. **Canonical DecisionObject Construction**: Embedded deterministic `DecisionObject` creation into `response_composer_node` within `backend/app/agents/graph.py`. Populated strictly from deterministic state (`DeterministicRiskEngine.evaluate()`, `Recommendation`, `Confidence`, route exposure, and evidence provenance). Never generated or modified by LLM reasoning.
  2. **Additive Contract Compatibility**: Maintained 100% backward compatibility by keeping existing `Recommendation` and `risk_assessment` fields completely intact on backend and frontend contracts. Added `decision_object` and `decision_delta` additively to `ORCAState`, `ChatResponse`, and frontend TypeScript contracts.
  3. **Structured DecisionDelta Engine**: Replaced thin string comparison in `WHAT_CHANGED`, `WHAT_IF`, and `SAFETY` state transitions with canonical Pydantic `DecisionDelta` (`added_factors`, `removed_factors`, `changed_factors`, `temporal_changes`, and deterministic mariner synthesis summary). Maintained historical thread context persistence (`baseline_risk_assessment`).
  4. **Dedicated ALTERNATIVE Intent Branch**: Built an explicit `IntentCategory.ALTERNATIVE.value` handler in `response_composer_node` that extracts validated departure windows and route corridor options from existing risk and route exposure tools. Explicitly outputs "No validated alternative available with current evidence." rather than falling back to demo data or fabricating alternatives.
  5. **Route Corridor Exposure Inferences**: Mapped `RouteExposureEngine` candidates into `DecisionObject.inferences` and `alternatives` with exposure metrics (wave height, route exposure score) without introducing duplicate route calculation engines.
  6. **Resilient Failure Degradation**: Wrapped `DecisionObject` and `DecisionDelta` construction in safe try/except fallback blocks. In the event of schema or data mismatch, runtime preserves canonical `Recommendation`, logs the warning, and safely continues without crashing the pipeline.
- Why: Satisfies all M3 invariants: absolute deterministic safety authority, zero LLM hallucination of decisions/evidence, backward compatibility with existing frontends and APIs, and epistemic honesty.
- Alternatives considered:
  - Allowing the LLM to synthesize the DecisionObject or delta (rejected: violates deterministic safety authority).
  - Breaking or replacing the legacy `Recommendation` schema (rejected: breaks existing frontend consumers and APIs).
  - Building a second route or risk engine (rejected: violates "no duplicate engines" rule).
- Affected areas: `backend/app/agents/graph.py`, `backend/app/agents/state.py`, `backend/app/contracts/chat.py`, `backend/app/services/state_mapper.py`, `frontend/src/types/contracts.ts`, `backend/app/core/config.py`, `tests/agent_eval/test_m3_decision_object.py`, `tests/agent_eval/test_flagship_flow.py`.
- Tests/verification: 17/17 dedicated M3 regression tests passing (`test_m3_decision_object.py`), flagship flow passing (`test_flagship_flow.py`), 405/405 agent_eval tests passing, 85/85 domain tests passing, frontend typecheck passing (0 errors), frontend Vite production build passing.

## D044 — Canonical MissionState Context Preservation Across Operational Lifecycles (M1.1)
Status: ACCEPTED

- Date: 2026-09-26
- Agent/person: Senior AI/Backend Systems Engineer (M1.1)
- Task/context: Implement M1.1 MissionState Context across Assessment, Chat, Voice, What-If, and Alerts.
- Decision:
  1. **Canonical MissionState Bridge**: Reused canonical `MissionState` contract (`backend/app/contracts/mission.py` & `frontend/src/types/mission.ts`) across all operational pipelines (Assessment, Chat, Voice, What-If, Alerts) without introducing a duplicate model or schema redesign.
  2. **Additive-Only Integration**: Maintained 100% backward compatibility by keeping all existing `UserContext`, `TripAssessmentRequest`, `ChatRequest`, and `SavedTripRequest` fields intact. Added `mission_state: Optional[MissionState] = None` additively to request/response contracts and `ORCAState`.
  3. **Operational Parameter Preservation**: Fixed `_build_user_context()` in `routes.py` and `mission_from_user_context()` in `mission.py` to preserve `departure_time`, `return_time`, `target_pfz`, and `parent_assessment_id`. Added property accessors to `MissionState` for clean, safe property access.
  4. **LangGraph Pipeline Pass-Through**: Carried `mission_state` unmodified through `ORCAState` across supervisor, specialist tools, risk evaluation, and response composer nodes.
  5. **Voice Endpoint Expansion**: Augmented the `/voice/chat` multipart form endpoint to receive operational parameters (`departure_time`, `return_time`, `target_pfz`, `parent_assessment_id`) and construct canonical `MissionState` prior to running the agent.
  6. **Frontend State & Cache Isolation**: In `useChat.ts` and `useTripAssessment.ts`, maintained persistent `MissionState` forwarding. In `offline-cache.ts`, eliminated key collision by factoring `departure_time` into `samudra_trip_assessment_${originHarbor}_${craftProfile}_${departureTime}`, with fallback to legacy keys for backward compatibility.
  7. **Decision Type Normalization**: Updated frontend `decision` type to `RecommendationStatus | Recommendation` to natively accommodate both backend status strings and rich recommendation objects without UI crashes.
  8. **In-Memory Alert Attachment**: Attached `MissionState` alongside registered trips in `AlertService._monitored_trips_mission_state` without creating database tables or schema migrations.
- Why:
  Prevents operational context loss across user interaction modalities (Assessment → Chat → Voice → What-If → Alerts), resolves offline cache collision across trips with different departure times, and ensures deterministic risk and reasoning components receive identical voyage parameters.
- Alternatives considered:
  - Redesigning `MissionState` with new relational tables (rejected: out of scope, introduces unnecessary migration risk).
  - Removing legacy `UserContext` fields (rejected: violates additive-only rule and breaks existing API clients and tests).
- Affected areas: `backend/app/contracts/mission.py`, `backend/app/contracts/assessment.py`, `backend/app/contracts/chat.py`, `backend/app/agents/state.py`, `backend/app/agents/graph.py`, `backend/app/services/agent_run_service.py`, `backend/app/services/assessment_service.py`, `backend/app/services/alert_service.py`, `backend/app/services/state_mapper.py`, `backend/app/api/v1/routes.py`, `frontend/src/types/mission.ts`, `frontend/src/types/assessment.ts`, `frontend/src/types/contracts.ts`, `frontend/src/hooks/useTripAssessment.ts`, `frontend/src/hooks/useChat.ts`, `frontend/src/pages/FisherPage.tsx`, `frontend/src/api/client.ts`, `frontend/src/utils/offline-cache.ts`, `tests/integration/test_m1_1_mission_state.py`, `frontend/src/utils/offline-cache.test.ts`.
- Tests/verification: 4/4 acceptance tests passing in `test_m1_1_mission_state.py`, 8/8 contract tests passing in `test_mission_contracts.py` & `test_contracts.py`, 246/246 frontend tests passing in Vitest, 0 errors in TypeScript `tsc --noEmit`.

## D045 — Mission Setup Hardening & Pre-Assessment Isolation (M1.1.5)
Status: ACCEPTED

- Date: 2026-09-26
- Agent/person: Senior Staff Systems Engineer (M1.1.5)
- Task/context: Implement Mission Setup Hardening based on completed audit to guarantee complete, validated MissionState before any assessment, voice, chat, alert, or What-If interaction.
- Decision:
  1. **Deterministic 7-Step Wizard Flow**: Refactored `GuidedTripSetup` into a deterministic 7-step wizard: Harbor, Vessel, Departure DateTime, Return DateTime, Optional PFZ Target, Mission Review, and Confirm & Assess.
  2. **ISO-8601 Temporal Precision**: Eliminated informal strings (`"today"`, `"tomorrow"`) across all frontend and backend contracts. Default timestamps and presets compute explicit ISO-8601 strings. Added native `<input type="datetime-local">` controls.
  3. **Local Wizard State Isolation**: Isolated all wizard adjustments locally inside `GuidedTripSetup` until explicit user confirmation at Step 7 (`Confirm & Assess`). Step transitions (0 to 5) do not mutate global `MissionState` or invoke `onComplete`.
  4. **Pre-Assessment Network Call Suppression**: In `FisherPage`, guarded the assessment effect with `if (sidebarTab === 'voyage') return;` to completely prevent premature network assessment requests while the wizard is active. Exactly one assessment fires upon explicit confirmation.
  5. **Bidirectional Temporal Window Validation**:
     - Frontend: Prevents moving forward or completing if departure is in the past or return is not strictly after departure (`return > departure`).
     - Backend: Added `@model_validator(mode="after")` to `TripAssessmentRequest` strictly enforcing valid ISO-8601 timestamps and `return_time > departure_time`, returning HTTP 422 Unprocessable Entity on violations.
  6. **Voice Pipeline Continuity**: Passed `departure_time`, `return_time`, `target_pfz`, and `parent_assessment_id` through `CallModal` → `useCallSession` → `sendVoiceChat` to guarantee full mission continuity in spoken voice sessions.
  7. **What-If Simulation Preservation**: Guaranteed `WhatIfSimulator.handleApply` preserves `departure_time` (adjusted with duration preserved if offset is specified), `return_time`, `target_pfz`, and `parent_assessment_id`.
  8. **Dual-Client Parity**: Synchronized both `frontend/` (Vite) and `nextjs/` implementations for `GuidedTripSetup`, `FisherPage`, and `types/mission.ts`.
- Why:
  Eliminates partial-state assessments, prevents network floods during mission planning, enforces authoritative safety bounds before any processing, and guarantees seamless context across multimodal interactions.
- Affected areas:
  `backend/app/contracts/assessment.py`, `frontend/src/components/fisher/GuidedTripSetup.tsx`, `frontend/src/pages/FisherPage.tsx`, `frontend/src/types/mission.ts`, `frontend/src/components/mission/WhatIfSimulator.tsx`, `frontend/src/components/call/CallModal.tsx`, `frontend/src/hooks/useCallSession.ts`, `frontend/src/App.tsx`, `nextjs/components/fisher/GuidedTripSetup.tsx`, `nextjs/views/FisherPage.tsx`, `nextjs/types/mission.ts`, `tests/integration/test_m1_1_mission_state.py`, `frontend/src/components/fisher/guided-trip-setup.test.ts`, `frontend/src/components/mission/what-if.test.ts`, `frontend/src/hooks/call.test.ts`.
- Tests/verification:
  Backend pytest 7/7 passing in `test_m1_1_mission_state.py`, frontend vitest 253/253 passing across 19 suites, frontend TypeScript typecheck passing with 0 errors.

## D046 — M1.2 Mission Brief / Why Panel Deterministic Presentation
Status: ACCEPTED

- Date: 2026-09-26
- Agent/person: Senior AI/Backend Systems Engineer (M1.2)
- Task/context: Implement dedicated Mission Brief Panel explaining why ORCA produced the current recommendation using deterministic backend evidence already generated by the risk engine.
- Decision:
  1. **Additive Backend Contract**: Defined canonical `MissionBriefPayload` (summary, recommended_action, positive_factors, negative_factors, confidence, confidence_reasons) and added `brief: Optional[MissionBriefPayload] = Field(None, ...)` to `TripAssessmentResponse` without altering existing `decision` recommendation structure.
  2. **Deterministic Risk Evidence Projection**: Populated `brief` in `AssessmentService.assess_trip` directly from existing `RiskAssessmentPayload` fields:
     - `summary` ← `risk_payload.summary`
     - `recommended_action` ← `risk_payload.recommended_action`
     - `positive_factors` ← `risk_payload.decisive_factors + non_decisive_factors` (on `GO`) / `non_decisive_factors` (on `CAUTION`/`NO_GO`)
     - `negative_factors` ← `[]` (on `GO`) / `risk_payload.decisive_factors` (on `CAUTION`/`NO_GO`)
     - `confidence` ← `risk_payload.confidence_level`
     - `confidence_reasons` ← `risk_payload.confidence_reasons`
     Zero LLM calls, zero synthetic text generation, 100% deterministic safety projection.
  3. **Zero Network Overhead UI**: Implemented `MissionBriefPanel.tsx` consuming in-memory assessment data already available in `FisherDecisionSurface`, rendered directly beneath the recommendation banner with zero new network requests or polling.
  4. **What-If Scenario Delta Support**: Extended `MissionBriefPanel` to dynamically render a "What Changed?" section displaying `delta.changed_factors` or `activeDiff.summary` when counterfactual diffs are present, hiding cleanly otherwise.
  5. **Dual-Client Parity**: Synchronized both React (`frontend/src/components/fisher/MissionBriefPanel.tsx`) and Next.js (`nextjs/components/fisher/MissionBriefPanel.tsx`) clients along with respective `FisherDecisionSurface.tsx` integrations and TypeScript contracts.
- Why:
  Provides immediate, deterministic transparency and explainability for fishermen and operational authorities without introducing latency, LLM hallucination risk, or breaking existing consumers of `TripAssessmentResponse`.
- Affected areas:
  `backend/app/contracts/assessment.py`, `backend/app/services/assessment_service.py`, `frontend/src/types/assessment.ts`, `frontend/src/types/mission.ts`, `frontend/src/components/fisher/MissionBriefPanel.tsx`, `frontend/src/components/fisher/FisherDecisionSurface.tsx`, `frontend/src/components/fisher/mission-brief.test.ts`, `nextjs/types/assessment.ts`, `nextjs/types/mission.ts`, `nextjs/components/fisher/MissionBriefPanel.tsx`, `nextjs/components/fisher/FisherDecisionSurface.tsx`, `nextjs/hooks/useTripAssessment.ts`, `nextjs/views/FisherPage.tsx`, `tests/integration/test_m1_2_mission_brief.py`.
- Tests/verification:
  - Backend integration tests: 3/3 acceptance tests passing in `tests/integration/test_m1_2_mission_brief.py`.
  - Full backend assessment test suite: 18/18 passing in pytest.
  - Frontend test suite: 20 test files, 259/259 tests passing in Vitest (`npm run test`).
  - Frontend TypeScript validation: 0 errors in `tsc --noEmit`.
  - Next.js validation: `tsc --noEmit` and `next build` passing with 0 errors.

## D047 — M1.3 Explainability & Evidence View Implementation
Status: ACCEPTED

- Date: 2026-09-26
- Agent/person: Senior AI/Backend Systems Engineer (M1.3)
- Task/context: Implement ORCA M1.3 Explainability & Evidence View projecting existing deterministic evidence into the Fisher UI.
- Decision:
  1. **Assessment-Level Agent Collaboration**: Extended `TripAssessmentResponse` with additive `agent_collaboration: Optional[AgentCollaborationPayload] = None`. In `AssessmentService.assess_trip()`, invoked `AgentCollaborationEngine.derive_collaboration(...)` directly from deterministic engine outputs (observations, recommendation, evidence items, trace items) without requiring a chat flow, LLM generation, or synthetic explanations.
  2. **Deterministic Threshold Comparison Matrix**: Created `ThresholdTable.tsx` rendering every `ThresholdComparison` in `assessment.evidence` (Metric, Observed, Operator, Threshold, Unit, Impact, Status, Description) with pure impact enum color badges (`SAFE`, `CAUTION_TRIGGER`, `NO_GO_TRIGGER`, `UNKNOWN_TRIGGER`) without inferring additional meaning.
  3. **Assessment-Mode Evidence Drawer**: Upgraded `EvidenceDrawer.tsx` to support both chat evidence and assessment-mode inspection (`assessment.evidence`, `assessment.source_status`, `assessment.brief`) with tabbed navigation (Threshold Matrix, Data Feeds, Brief Confidence, and Agent Trace).
  4. **PFZ Explainability & Multi-Candidate Rationale**: Upgraded `PFZDetails.tsx` to render the top 3 INCOIS PFZ candidates with complete metrics (Rank, Distance nm, Bearing, Depth, SST, Chlorophyll) and deterministic distance advantage rationale comparing Candidate #1 to Candidate #2 without introducing new ranking algorithms or scores.
  5. **Route Exposure Comparison View**: Upgraded `TripPlanDetails.tsx` to render all evaluated route corridors in a comparison matrix (Route Name, Distance, Wave Height, ETA, Fuel, Exposure Score, Risk Rating, Feasibility, Infeasibility reasons) with visual recommendation indicators and zero score recalculations.
  6. **Fisher Decision Surface Canonical Sequential Flow**: Wired `FisherDecisionSurface.tsx` to project all evidence in exact sequence:
     Decision Banner $\rightarrow$ Mission Brief $\rightarrow$ Inspect Evidence $\rightarrow$ Agent Collaboration $\rightarrow$ Ocean Conditions $\rightarrow$ PFZ Explainability $\rightarrow$ Route Comparison.
  7. **In-Memory Zero-Network Invariant**: Ensured all explainability panels operate purely from the in-memory `TripAssessmentResponse`, guaranteeing 0 additional API calls, 0 polling requests, and 0 websocket messages.
- Why:
  Fulfills maritime explainability requirements, giving mariners and operators immediate, deterministic clarity into why safety recommendations, PFZ targets, and route corridors were chosen.
- Affected areas:
  `backend/app/contracts/assessment.py`, `backend/app/services/assessment_service.py`, `frontend/src/types/assessment.ts`, `frontend/src/components/evidence/ThresholdTable.tsx`, `frontend/src/components/evidence/EvidenceDrawer.tsx`, `frontend/src/components/fisher/PFZDetails.tsx`, `frontend/src/components/fisher/TripPlanDetails.tsx`, `frontend/src/components/fisher/FisherDecisionSurface.tsx`, `frontend/src/pages/FisherPage.tsx`, `frontend/src/components/fisher/OceanDetails.tsx`, `tests/integration/test_m1_3_explainability.py`, `frontend/src/components/evidence/m1_3_explainability.test.ts`.
- Tests/verification:
  - Backend integration tests: 3/3 passing in `tests/integration/test_m1_3_explainability.py`.
  - Frontend test suite: 21 test files, 266/266 tests passing in Vitest (`npm run test`).
  - Frontend TypeScript validation: 0 errors in `tsc --noEmit`.

## Decision template

### D0XX — <title>
Status: PROPOSED / ACCEPTED / REJECTED
Decision:
Reason:
Alternatives:
Impact:
Owner:
Date:



