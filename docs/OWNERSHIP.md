# ORCA Ownership & Parallel Work Model

## Branch model
- `main` — release-ready production
- `develop` — continuous integration
- Feature/fix branches — per task

Flow:
`feature/* -> develop -> main`

## Conceptual Responsibility Areas

The team maps to 6 conceptual ownership areas defined in `docs/ORCA_AI_MASTER_CONTEXT.md` §34.
One team member may own multiple areas.

### P1 — Frontend / UX
Owns:
- `frontend/**`
- frontend tests
- API client
- mission-first decision UI
- map/recommendation/evidence/trace UI
- voice UX
- What-if / Decision Delta UI
- localization

Does not own:
- risk formulas
- connector implementation
- LangGraph routing
- raw provider calls

### P2 — Backend / API / Orchestrator
Owns:
- `backend/app/api/**`
- `backend/app/contracts/**`
- `backend/app/connectors/**`
- `backend/app/repositories/**`
- `backend/app/core/**`
- MissionState canonical schema
- planner / orchestration contracts
- intent classification
- source registry
- runtime modes
- integration contracts
- migrations/deployment config

Does not own:
- agent prompts/routing
- domain mathematics
- frontend implementation

### P3 — Marine Data / Connectors
Owns:
- connector adapters (INCOIS, IMD, Open-Meteo, etc.)
- cached-real fixtures
- source provenance metadata
- data mode classification
- timestamp / validity / quality normalization

Does not own:
- API routing
- frontend
- agent orchestration

### P4 — GIS / Spatial / Temporal
Owns:
- `backend/app/domain/**` (geometry, geofencing, trajectory)
- `backend/app/tools/**`
- `data/fixtures/**`
- domain/scenario tests
- temporal window selection
- route exposure calculations
- alternative generation
- time-dependent route cost

Does not own:
- FastAPI routes
- frontend
- LLM prompt design

### P5 — Decision / Evidence
Owns:
- deterministic risk engine
- hard constraint ordering (safety → legal → vessel → operational)
- confidence derivation
- ExplanationEngine
- Decision Object / Decision Delta
- source conflict resolution
- evaluation benchmarks

Does not own:
- connector HTTP calls
- frontend rendering
- voice pipeline

### P6 — Voice / Integration
Owns:
- STT / TTS services
- language continuity across turns
- voice mission updates
- future low-bandwidth channel adapters

Does not own:
- mission reasoning logic
- deterministic safety calculations
- map rendering

## Shared / Coordinated
- `docs/ORCA_AI_MASTER_CONTEXT.md`
- `docs/API_CONTRACTS.md`
- `docs/CANONICAL_DATA_CONTRACTS.md`
- `docs/SAFETY.md`
- frontend shared contract types
- root CI/deployment files

Shared change protocol:
1. Identify affected areas
2. Record decision in `docs/DECISIONS.md`
3. Update contract
4. Update consumers
5. Test
6. Merge to develop

No silent cross-area modifications.
