# ORCA Current State Audit

Audit basis: repository code and tests inspected on 2026-10-01. Status describes this checkout, not deployed services. `docs/DEMO_VIDEO_SCRIPT.md` was already untracked and was left untouched.

## 1. Executive Snapshot

- **Working:** Python FastAPI backend and React/TypeScript Vite web client; the current web app is not Next.js.
- **Working:** Fisher guided trip setup posts a `TripAssessmentRequest` and renders a deterministic assessment, brief, condition cards, PFZs and routes.
- **Working:** A separate `/chat` path executes a bounded LangGraph with intent, planning, tools, evidence validation and response composition.
- **Working:** `MissionState`, `Recommendation`, `DecisionObject`, `DecisionDelta`, evidence and trace contracts exist; the two entry paths do not share one execution graph.
- **Working:** Safety thresholds, vessel limits, temporal validity, PFZ ranking and route exposure are implemented in Python domain code.
- **Mock/demo:** `DEMO` and `SNAPSHOT`/`SYNTHETIC` data paths, synthetic institutional records, and deterministic demo routes exist. They are not live official telemetry.
- **Partially working:** External INCOIS/IMD/Open-Meteo/SACHET connectors exist, but official base URLs include placeholders and live availability was not verified.
- **Partially working:** PostgreSQL persistence is attempted when configured; in-memory offline stores support runs when DB is absent. No database service was verified here.
- **Partially working:** What-If sends a chat request with changed parameters and computes a client-side comparison; its baseline may be the last chat response rather than the displayed Fisher assessment.
- **Working:** MapLibre/deck.gl map, geofences, evidence views, voice UI, alerts, Authority and Researcher demo screens are implemented.
- **Planned/unimplemented in this checkout:** native Expo mobile app; mobile appearance is responsive web layout.
- **Working verification:** 7 selected backend tests and all 283 frontend tests passed; production build was started separately and its final result is recorded below.

## 2. Actual Architecture

```text
React/Vite App (Fisher | Authority | Researcher)
  |-- Fisher plan -> POST /api/v1/trip-assessments
  |     -> AssessmentService -> DataService -> connector/demo/fixture payloads
  |     -> ObservationBundle -> DeterministicRiskEngine
  |     -> PFZ + route engines -> TripAssessmentResponse -> Fisher decision/map
  |-- Chat / What-If -> POST /api/v1/chat
  |     -> AgentRunService -> LangGraph StateGraph
  |     -> tool registry/provider adapters -> evidence gate -> risk/response
  |     -> ChatResponse -> chat, evidence drawer, decision delta
  |-- Authority/Researcher -> /api/v1/demo/* and /api/v1/marinewatch/*
  +-- browser IndexedDB assessment cache, geolocation and speech APIs

FastAPI -> optional PostgreSQL/SQLAlchemy repositories; in-memory offline store
```

There are **two assessment entry paths**. The Fisher card's primary decision does not traverse LangGraph. `AssessmentService` creates an `agent_collaboration` presentation payload from observations, risk and a constructed trace; that trace is not proof that its named agents executed. See `backend/app/services/assessment_service.py` and `backend/app/agents/graph.py`.

## 3. End-to-End Execution Flow

Strongest reproducible path: choose Fisher on `PortalPage`, complete `GuidedTripSetup` with Ratnagiri, craft, time window and auto PFZ. `FisherPage.handleCompletePlan` selects the decision tab; its effect calls `useTripAssessment.assessTrip`. The hook posts JSON to `/api/v1/trip-assessments` and caches the response in IndexedDB. The route calls `AssessmentService.assess_trip`; it resolves or creates canonical `MissionState`, obtains marine/weather/hazard via `DataService`, merges hourly forecast into `ObservationBundle`, and calls `DeterministicRiskEngine.evaluate`. It derives a mission brief, threshold comparisons, stability and safe window. A separate PFZ ranking and route evaluation runs; in `DEMO` mode the returned PFZ/route cards are replaced with scenario constants. The response is rendered by `FisherDecisionSurface`, `OceanDetails` and map helpers. Errors or absent critical payloads yield `UNKNOWN`/hold language. See `frontend/src/pages/FisherPage.tsx`, `frontend/src/hooks/useTripAssessment.ts`, `backend/app/api/v1/assessments.py`, `backend/app/services/assessment_service.py`.

Chat and What-If take another path: `useChat` calls `/api/v1/chat`; `AgentRunService` dispatches `run_orca_graph` in a worker thread. The graph runs intent/locale, optional clarification, supervisor, specialist tools, evidence validator, response composer and terminal nodes. The response carries recommendation, evidence, trace, map layers and mission state. `useChat.simulateWhatIf` constructs a new current-clock departure/12-hour return, calls chat, then computes `DecisionDiff` in the browser. The displayed Fisher baseline assessment is passed as `parent_assessment_id`, but the client comparison baseline is `activeResponse?.recommendation.status ?? 'READY'`.

## 4. Implemented Capabilities

| Capability | Status | Actual implementation | Key files |
|---|---|---|---|
| Fisher trip decision | Working/demo | Unified assessment response, deterministic risk and brief | `services/assessment_service.py`, `domain/risk_engine.py`, `pages/FisherPage.tsx` |
| Natural language agent | Working with demo data | LangGraph workflow, typed tool results and guarded response | `agents/graph.py`, `services/agent_run_service.py` |
| Mission context | Partially working | Canonical mission models and request state; browser hook synchronizes assessment into chat | `contracts/mission.py`, `hooks/useChat.ts`, `hooks/useTripAssessment.ts` |
| PFZ | Demo/partial | Geodesic ranking; DEMO response uses fixed candidates | `domain/pfz.py`, `services/assessment_service.py` |
| Waves/wind/visibility/tide | Demo/partial | Typed marine/weather payloads, hourly forecast and estimated tide fields | `services/data_service.py`, `contracts/observation.py`, `domain/tides.py` |
| Safety, hazards, geofencing | Working with available data | Vessel thresholds, hazard hard stops, deterministic geometry | `domain/risk_engine.py`, `domain/geo_restrictions.py` |
| Route alternatives | Working/demo | Deterministic exposure evaluation; DEMO response replaces output with constants | `domain/route_engine.py`, `scenarios/fisher_demo.py` |
| Explanation/evidence | Partially working | Threshold/provenance response and chat evidence gate; assessment collaboration trace is synthesized | `agents/evidence.py`, `agents/response.py`, `services/assessment_service.py` |
| What-If/DecisionDelta | Partially working | Chat recomputation and browser diff; baseline consistency caveat above | `hooks/useChat.ts`, `utils/counterfactual.ts`, `components/mission/WhatIfSimulator.tsx` |
| Alerts/notifications | Demo/partial | Alert API, monitor loop, Fisher alert panel, synthetic notifications | `api/v1/alerts.py`, `core/worker.py`, `hooks/useAlerts.ts` |
| Voice/locales | Partially working | Transcription/chat endpoints, speech hooks, English/Hindi/Marathi/Tamil/Telugu resources | `api/v1/routes.py`, `services/stt_service.py`, `services/tts_service.py`, `hooks/useVoiceRecorder.ts` |
| Auth/roles | Demo only | Client role selection; no enforced login found in primary app flow | `App.tsx`, `pages/PortalPage.tsx` |
| Mobile | Unimplemented native | Responsive web tabs; no Expo app in repository | `App.tsx`, `frontend/package.json` |

## 5. Data & Integrations

| Source | Live/Mock/Cached | Used by | Current status |
|---|---|---|---|
| `scenarios/fisher_demo.py` | Mock/demo | Assessment DEMO mode | Controlled fixed conditions, PFZ and routes |
| `data/source_snapshots/`, synthetic generator | Snapshot/synthetic | DataService, demo APIs, tests | Reproducible local data, not current observations |
| INCOIS ocean/PFZ connectors | Intended live, fallback | DataService/provider tools | Code exists; configured official URL is placeholder; live retrieval unverified |
| IMD weather/hazard connectors | Intended live, fallback | DataService/provider tools | Code exists; configured URL is placeholder; live retrieval unverified |
| Open-Meteo | External fallback | INCOIS/IMD connector paths | HTTP connector exists; reachability/results not verified |
| SACHET | External alerts | Alert connector | Placeholder URL/key defaults; live results unverified |
| PostgreSQL/PostGIS | Optional database | repositories, runs, assessments, synthetic demo records | Schema/repositories exist; local service not verified; fallback in-memory data exists |
| Browser IndexedDB | Cached | Fisher assessment hook | Last assessment reused offline; expiry changes status to `UNKNOWN` after six hours |

`DataService` modes include `DEMO`, `SNAPSHOT`, `SYNTHETIC` and live-facing branches. Frontend Fisher defaults to `VITE_DATA_MODE=HYBRID` while backend global `DATA_MODE` defaults to `SNAPSHOT`; `/chat` follows backend settings, and assessment takes the request's mode. Thus the two UI surfaces can show different source snapshots and decisions. The `DataService` docstring's claim that `LIVE` never falls back disagrees with its broad exception fallback to snapshot. `get_weather_conditions` and hazard use `SNAPSHOT` in an earlier combined `SNAPSHOT/SYNTHETIC` branch, so later dedicated snapshot branches are unreachable.

## 6. Decision & Reasoning Pipeline

`MissionState` is built from user context or supplied directly. The assessment uses it for origin, vessel, times and destination. The graph carries mission state and conversation/thread context through its nodes. The supervisor selects capabilities; specialist tools return normalized results; evidence validation checks claims; deterministic risk sets the recommendation. The graph then builds a `DecisionObject` from that recommendation and composes a response without allowing the language model to alter status. Numeric and threshold authority is Python code, not LLM text.

The assessment path separately builds `ObservationBundle`, computes `RecommendationStatus`, threshold rows, confidence reasons, stability and safe window. It returns `TripAssessmentResponse`, not the graph's canonical `DecisionObject`. Marine/weather/hazard are required for a full assessment; missing components cause `UNKNOWN`. PFZ and route failures are logged and can leave their arrays empty without changing the already computed trip decision. `map_layers` is `{}` in this response; Fisher map helpers combine assessment candidates/routes with separately fetched base layers.

What-If's `DecisionDiff` is assembled in `useChat` from the new chat response and previous **chat** response. The server also defines `DecisionDelta` and graph support for baseline comparisons, but this Fisher control does not directly call a dedicated delta endpoint. Its `timeOffsetHours` is applied to the current browser clock, not necessarily to the plan's departure; the apply button shifts the plan's stored departure/return instead. This can make simulation and applied plan differ.

## 7. Frontend / UX

The Vite SPA has portal selection, Fisher, Authority, Researcher and Settings. Fisher has guided plan, decision, assistant, map, evidence, Mission Twin, alerts, speech and geolocation. Authority and Researcher expose synthetic sector/fleet/replay/analytics and data exploration views. Navigation is local React state, with responsive tabs under narrow viewports. Role selection is a UI choice rather than authenticated authorization. Browser speech, GPS and IndexedDB require browser/device support; their presence does not establish native mobile support.

Strongest demo: explicitly set Fisher `VITE_DATA_MODE=DEMO`, use the Ratnagiri guided plan, show the labelled assessment/thresholds/map, then demonstrate chat/What-If while describing the two decisions as separate computations. The script's fixed September 29 departure is already past on audit date 2026-10-01; use a valid supported demo window or verify the resulting stale/unknown state before recording.

## 8. Backend / API

FastAPI mounts `/api/v1` and marinewatch routes. Key endpoints include `POST /trip-assessments`, `POST /chat`, `POST /voice/transcribe`, `POST /voice/chat`, `GET /health`, run/map layer retrieval, scenario endpoints, base layers, alerts, `/demo/*` sector/fleet/PFZ/hazard/route/replay/notification endpoints, and `/marinewatch/*`. Important contracts are in `contracts/{assessment,chat,mission,observation,alerts,situation}.py`; corresponding frontend types are in `frontend/src/types/`. Middleware adds CORS, request IDs, size/rate limits and observability. Settings are environment driven from `.env`; official provider URLs default to placeholders, and database URL defaults to a placeholder credential.

## 9. Test / Build Verification

| Command | Result |
|---|---|
| `python -m pytest tests/api/test_assessments.py tests/integration/test_fisher_demo_scenario.py tests/agent_eval/test_flagship_flow.py -q` | Initial collection blocked by inherited `DEBUG=release` (Pydantic boolean validation). |
| Same command with process-local `DEBUG=false` | **7 passed**, one LangGraph deprecation warning. |
| `npm.cmd test` in `frontend` | **22 files, 283 tests passed**; one test logged missing i18next instance warning. |
| `npm.cmd run build` in `frontend` | **Passed** (`tsc && vite build`); Vite warned that the main chunk is 2.82 MB and i18n dynamic import shares a static import. |

`npm` without `.cmd` was blocked by this machine's PowerShell script execution policy; that is an environment shell issue. No live upstream or database smoke check was run.

## 10. Current Gaps & Risks

- **P0 — Demo consistency:** Fisher assessment and chat/What-If have separate pipelines and data mode controls. A baseline card and simulated delta can describe different underlying data or baseline states (`FisherPage.tsx`, `useChat.ts`).
- **P0 — Demo reproducibility:** Fisher defaults to `HYBRID`, whereas the video describes controlled `DEMO DATA`; `DEMO` must be configured explicitly. The selected September 29 date is in the past at audit time.
- **P1 — Provenance:** Assessment `source_metadata.provenance_mode` labels every non-demo/non-snapshot source `LIVE`, even when source quality or actual fallback may be more nuanced. DEMO PFZ/routes are post-evaluation constants, so displayed alternatives are not necessarily the evaluated result.
- **P1 — Live readiness:** Official connector URLs default to placeholders; live services, keys, storage and deployed API were not verified. `DataService` has fallback behavior inconsistent with some comments/mode claims.
- **P1 — What-If semantics:** Simulation uses browser now plus offset and a 12-hour window, while Apply uses the current mission times; comparison baseline is chat `activeResponse` or `READY`, not Fisher assessment.
- **P1 — Authentication:** Role selection exposes institutional views without an observed authorization gate in the UI/API path. Confirm access requirements before production use.
- **P2 — Native/mobile target:** The strategic documents specify Expo/Next.js; executable client is a responsive Vite SPA and no Expo tree was found. This is a documented target versus current code discrepancy, not a runtime failure.
- **P2 — Documentation:** `docs/SAFETY.md` uses `NO_GO`; newer mission architecture mentions `AVOID`, while executable recommendation contracts use `NO_GO`. Align the contract intentionally before changing states.

## 11. Do Not Break

Preserve `TripAssessmentRequest/Response`, `ChatRequest/Response`, `MissionState`, source provenance and explicit data modes; deterministic risk/hard-stop precedence; geodesic PFZ and route/geofence calculations; graph evidence and response status gates; the Fisher guided trip path; offline expiry to `UNKNOWN`; synthetic demo namespace isolation; run/trace/map-layer APIs; existing backend and frontend tests. Preserve unrelated user work, including untracked `docs/DEMO_VIDEO_SCRIPT.md`.

## 12. Recommended Context for Next Engineering Prompt

ORCA currently has one FastAPI intelligence backend and one React/Vite web app. Its strongest verified path is the Fisher guided trip assessment against explicit demo fixtures: deterministic Python risk, explainable threshold rows, PFZ/route cards and map. Its distinctive implemented pieces are canonical mission contracts, a bounded LangGraph chat path, deterministic vessel/temporal/spatial safety rules, evidence/provenance fields and a counterfactual UI. The largest engineering need is to make Fisher assessment, chat and What-If use one consistent mission snapshot and baseline, then make demo mode explicit and validate true provider availability before any live claims. Keep safety authority in Python and preserve the existing API contracts and test coverage.

