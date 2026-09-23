# ORCA Master Implementation Plan

> Reconciled with `docs/ORCA_AI_MASTER_CONTEXT.md` §31-36 on 2026-09-21.
> Strategic priorities: P0 (must-fix regressions + core reasoning) → P1 (high-value reasoning) → P2 (strategic extensions).
> See the master context for the authoritative priority definitions.

## Strategy
Build a complete product in independent vertical slices. Four members work in parallel, integrate continuously into `develop`, and promote only verified releases to `main`.

Separate MVP, production hardening, and post-MVP expansion.

## Current Priority Mapping

The new strategic context defines three priority tiers that cut across phases:

### P0 — Must Fix / Core Foundation
- Fix schema/payload regressions (Phase 2 scope)
- Fix observation bundle lineage (Phase 3 scope)
- Fix fallback confidence (Phase 3 scope)
- Freeze canonical MissionState (Phase 4 scope)
- Implement temporal validity (Phase 4 scope)
- Implement hard constraints (Phase 4 scope)
- Mission-first decision UI (Phase 4 scope)
- Voice → MissionState integration (Phase 5 scope)

### P1 — High-Value Reasoning
- Source Registry + planner-driven evidence plan (Phase 6 scope)
- ExplanationEngine (Phase 6 scope)
- Trajectory exposure engine (Phase 4 scope)
- Intent classes: WHY, WHAT_IF, WHAT_CHANGED (Phase 6 scope)
- Cached-real fixtures + explicit data modes (Phase 2 scope)
- Source conflict policy (Phase 6 scope)
- Decision Delta + safe alternatives (Phase 6 scope)
- Multilingual continuity (Phase 5 scope)

### P2 — Strategic Extensions
- Decision robustness / sensitivity (Phase 12 scope)
- Time-dependent routing (Phase 12 scope)
- SACHET and selected connectors (Phase 11 scope)
- Mission replay / audit trace (Phase 12 scope)
- Low-bandwidth channels (Phase 11 scope)
- ORCA-MarineEval benchmark (Phase 7 scope)
- Historical fisheries analysis (Phase 12 scope)
- Field UX hardening (Phase 10 scope)

## Phase 0 — Repository & Contract Baseline
**All**
- Verify repository/test baseline
- Reconcile docs with code
- Lock API/data/safety contracts
- Establish branch model
- Establish CI/test gates
- Establish observability and release rules

Exit: clean baseline, green tests, branches ready.
Release: `v0.1.0-baseline`

## Phase 1 — Platform Vertical Slice
M1 frontend: shell, chat, API client, recommendation UI, shared TS contracts.
M2 backend: FastAPI lifecycle, config, `/chat`, health, error envelope, serialization.
M3 agents: LangGraph state, intent, clarification, supervisor, response-composer interfaces.
M4 domain: normalized models, risk interface, geospatial/tool interfaces.

Integration: one fixture-backed request flows UI -> API -> graph -> deterministic tool -> response.
Release: `v0.2.0-platform`

## Phase 2 — Deterministic Marine Core (P0 Data Integrations)
Integrates approved P0 MVP sources:
- INCOIS Ocean State Forecast (OSF): SWH, swell, currents, SST
- INCOIS Potential Fishing Zones (PFZ): candidate coordinates, fronts
- INCOIS SVAS: small vessel safety advisory indices
- IMD Marine: sea/coastal bulletins, port warnings, cyclone alerts
- Pilot-Region GIS: geofences, naval firing zones, MPAs, IMBL
- Open-Meteo Marine: real-time fallback/redundancy adapter
- Landing centres and vessel profiles reference catalogs

M1: map/recommendation UI.
M2: repository/data adapters and LIVE/HYBRID/SNAPSHOT controller.
M3: intent/context extraction and planner.
M4: geodesics, PFZ ranking, geofencing, hazards, route exposure, deterministic risk.

Integration: all specialist tools return canonical ToolResult.
Release: `v0.3.0-domain`

## Phase 3 — Evidence & Provenance Fabric
M1: evidence drawer, trace UI, map layers.
M2: source metadata, freshness/validity normalization, connector caching.
M3: evidence validation, source conflicts, provenance-aware composition.
M4: cross-tool spatial/temporal consistency.

Exit: recommendations trace to authoritative evidence or deterministic computation.
Release: `v0.4.0-evidence`

## Phase 4 — Mission Twin MVP
Implement:
- mission object
- mission timeline
- candidate area/route generation
- safety/regulatory elimination
- opportunity/risk ranking
- best safe option
- alternatives
- what-if time/vessel/destination changes
- explanation of decision changes

Release: `v0.5.0-mission`

## Phase 5 — Multilingual + Voice
M1: voice UX, localization.
M2: STT/TTS endpoints and provider adapters.
M3: language orchestration, localized responses, memory.
M4: marine terminology and multilingual scenario validation.

Release: `v0.6.0-voice`

## Phase 6 — Alternatives, Conflicts & Adaptation
- source-conflict reasoning
- safest/balanced/opportunity modes
- mission re-planning
- changed warning/time/location handling
- explicit uncertainty
- "why decision changed?"

Release: `v0.7.0-adaptive`

## Phase 7 — Demo / Release Candidate
All:
- canonical scenarios S1–S8
- LIVE/HYBRID/SNAPSHOT verification
- full frontend build
- backend integration
- provider failure tests
- stale-data tests
- provenance audit
- prompt-injection/security tests
- accessibility/usability pass
- deployment rehearsal

Release: `v0.8.0-rc`

# Production Track

## Phase 8 — Production Platform
- auth/authz
- rate limiting
- durable Postgres/PostGIS
- migrations
- secrets management
- structured logs
- metrics/tracing
- health/readiness
- model gateway and prompt versioning
- source health monitoring
- data quality monitoring
- resilient degraded-state UX

Release: `v0.9.0-production-staging`

## Phase 9 — Reliability, Security & Scale
- load/concurrency tests
- provider outage simulation
- database failover
- cache strategy
- disaster recovery
- threat model
- dependency/security scanning
- privacy/data minimization
- regional configuration
- audit logs

Release: `v0.10.0-hardening`

## Phase 10 — Pilot Deployment
Start with one validated geography.
- pilot users
- telemetry
- feedback loop
- time-to-decision metrics
- comprehension studies
- false-positive/false-negative analysis
- escalation process
- comparison against official sources

Release: `v1.0.0-pilot`

## Phase 11 — Ecosystem Integrations
Only after access/permission verification:
- deeper MOSDAC
- authorized VCSS/Nabhmitra context
- SARAT
- state/UT regulatory datasets
- WhatsApp/low-bandwidth channels
- additional official sources

Classify sources:
`LIVE | LIMITED | CACHED_REAL | HISTORICAL | MOCK`

Release: `v1.1.0-integrations`

## Phase 12 — Advanced Intelligence
- Mission Twin expansion
- counterfactual optimization
- outcome feedback
- personalized opportunity/safety tradeoffs
- research mode
- long-horizon mission planning
- national scaling
