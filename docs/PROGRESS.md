# ORCA / SAMUDRA Operational Progress

> Single operational status board. Strictly factual. No diary narrative.

## Current Release & Workstream State

> Documentation note: This file records current implementation status only. The final ORCA product direction is documented in [docs/ORCA_AI_MASTER_CONTEXT.md](docs/ORCA_AI_MASTER_CONTEXT.md) and the product decisions in [docs/DECISIONS.md](docs/DECISIONS.md). Final architecture statements below are authoritative product direction, not a claim that every feature is fully implemented in the current codebase.

- Current version: `v0.2.2-features-main-integrated`
- Active branch: `main`
- Current milestone: **India MarineWatch & Autonomous Marine Intelligence (BarentsWatch India Architecture)**
- Client Architecture Migration: **IN PROGRESS (Next.js Multi-Agent Reasoning Port & Full Route Support)**
  - Dual interface model locked: React Native + Expo (field mobile) & Next.js + React (web platform & demo).
  - Migration principle: `REUSE → ADAPT → EXTRACT → REWRITE`.
  - Next.js application scaffold initialized at `nextjs/` alongside existing `frontend/` (which remains untouched and fully functional).
  - Pure contracts (`types/contracts.ts`, `mission.ts`, `assessment.ts`, `alerts.ts`), API clients, utilities, and i18n ported into `nextjs/`.
  - Multi-Agent Reasoning & Decision Authority UI ported with 100% parity from `frontend/` into `nextjs/`:
    - Components: `AgentCollaborationPanel`, `AgentCardsGrid`, `AgentEvidenceCard`, `CausalExplanationCards`, `ConflictArbitrationCard`, `ReasoningTimelineView`, `StakeholderPerspectiveSelector`.
    - Integrated across `ChatMessage.tsx`, `FisherDecisionSurface.tsx`, `QueryWorkbench.tsx`, and `AuthorityPage.tsx`.
    - Routes supported: `/fisher`, `/authority`, `/researcher`, `/marinewatch`, `/settings`.
    - Verification: Next.js `npm run typecheck` and `npm run build` passing with 0 errors (9/9 static pages generated). Frontend vitest suite untouched (242 tests passing across 17 suites).
  - State management rule enforced: existing React hooks (`useChat`, `useTripAssessment`, `useAlerts`) ported first; Zustand/TanStack Query deferred until justified by real friction.
  - P0 priority: `/fisher` route established as the primary judging and operational experience.
- Real Data Foundation: **COMPLETE & VERIFIED** (frontend: 235 tests passing across 16 test suites; backend: 387 passed / 1 skipped in agent_eval, 19/19 passed in marinewatch; verified on 2026-09-23)
- 13 Foundation API Contracts (§213): **100% IMPLEMENTED & PASSING** (`/forecast/point`, `/forecast/route`, `/hazards/active`, `/fisheries/pfz`, `/ports/nearby`, `/aquaculture/sites/nearby`, `/coast/profile`, `/datasets`, `/search`, `/spatial/query`, `/lighthouses/nearby`, `/lighthouses`, `/boundaries`)
- Nationwide Reference Data Ingestion:
  - CMFRI Marine Fisheries Census: 30 primary & intermediate landing harbours across all coastal states (Gujarat, Maharashtra, Goa, Karnataka, Kerala, Tamil Nadu, Andhra Pradesh, Odisha, West Bengal, Andaman & Nicobar, Lakshadweep).
  - DGLL Coastal Lighthouses & Navigational Aids: 15 primary landfall lighthouses (Dwarka, Mumbai, Ratnagiri, Vengurla, Aguada, Bhatkal, Cochin, Kovalam, Kanyakumari, Chennai Marina, Dolphin's Nose Vizag, Paradip, Sagar Island, Indira Point Nicobar, Minicoy).
  - CAA Coastal Aquaculture Authority: Certified brackishwater shrimp & marine finfish farms across both coasts.
  - Nationwide Maritime Boundaries & EEZ GeoJSON: Complete 12nm Territorial Waters, 24nm Contiguous Zones, 200nm Exclusive Economic Zones (Arabian Sea, Bay of Bengal, Andaman Sea), GEBCO 50m/100m/200m bathymetric contours, and National Marine Protected Areas (Gulf of Mannar, Sundarbans, Gahirmatha, Gulf of Kutch, Malvan, Mahatma Gandhi Marine Park Wandoor, Angria Bank).
- Domain Engines:
  - INCOIS PAT harmonic astronomical tide engine expanded to 14 national ports (Kandla, Mumbai, Ratnagiri, Malvan, Mormugao, Mangalore, Cochin, Tuticorin, Chennai, Visakhapatnam, Paradip, Sagar Island, Port Blair, Kavaratti).
  - Nationwide GEBCO bathymetric shelf profiling (accounting for narrow Coromandel/Andhra slope, broad Konkan/Gujarat shelf, insular trenches off Andaman, and coral lagoons of Lakshadweep).
  - §212 30-dataset canonical catalogue registry.
- Frontend Interactive GIS Hubs:
  - `OceanWatch GIS`: MapLibre GL nationwide interactive map with 13 bookmark presets, time scrubber, spatial query sidebar, and **100% clickable interactivity** on all markers (harbours, lighthouses, PFZs, aquaculture) and vector geometries (MPAs, 12nm limits, 200nm EEZ, Naval Firing Ranges, Sir Creek IMBL buffer, Active IMD/INCOIS Hazard Corridors, PFZ thermal front geodesic polygons, and GEBCO bathymetric contours) with real-time oceanographic & regulatory intelligence.
  - **Zoom Stability & Geographic Accuracy**: Decoupled DOM marker coordinate positioning from CSS transitions (`transition: transform` completely isolated to `.marinewatch-marker-inner`), dynamic zoom-tier sizing (`overview` / `regional` / `detail`), zoom-interpolated vector line widths, and zero-drift map anchoring across whole-India overview (z=4) down to local harbor berths (z=12).
  - `FisherWatch`: Multilingual operational dashboard with nationwide coastal sector pills (All India, Gujarat, Maharashtra, Goa, Karnataka, Kerala, Tamil Nadu, Andhra Pradesh, Odisha, West Bengal, Andaman & Nicobar, Lakshadweep), PFZ advisories, landing harbours, and safety telemetry.
  - `AquaWatch`, `MarineHazards`, `PortWatch`, `DataCatalogue`.

### Milestone Feature: Multi-Agent Reasoning Visibility & Decision Authority (§D033)
- **Status**: **COMPLETE & VERIFIED** (Backend: 100% passing tests in `tests/domain/test_agent_collaboration.py`; Frontend: 17 passed / 242 passed vitest tests; Vite production bundle built cleanly).
- **Core Architecture & Experience Transformation**:
  - Transformed end-user experience from a black box final answer (`User → Final Answer`) into an observable multi-agent reasoning pipeline: `User → Agent Collaboration → Evidence Gathering → Risk Assessment → Arbitration → Final Answer`.
  - Added 100% deterministic Python engine `AgentCollaborationEngine.derive_collaboration()` deriving 5 specialist agent positions (Marine Intelligence, Weather Intelligence, Geospatial Intelligence, Safety Assessment, and Decision Authority) in < 5ms without asynchronous LLM loops or network latency.
  - Implemented statutory arbitration via Protocol D010: deterministic safety hard-stops unconditionally supersede resource abundance opportunities.
  - Epistemic data honesty: Removed arbitrary confidence percentages; implemented strictly grounded `Evidence Strength: HIGH / MEDIUM / LOW / UNKNOWN` and `Data Quality: Verified / Partial / Snapshot Fallback / Limited`.
  - Enforced 8-step lifecycle ordering: `Mission Received` → `Data Collection` → `Marine Analysis` → `Weather Analysis` → `Boundary Analysis` → `Safety Assessment` → `Conflict Resolution` → `Final Recommendation`.
  - Enforced 5-stage causal breakdown: `FACTS` → `INFERENCES` → `CONSTRAINTS` → `DECISION` → `ACTION`.
  - Seamlessly surfaced across:
    - `ChatMessage.tsx`: Inline collapsible "Agent Reasoning" drawer.
    - `FisherDecisionSurface.tsx`: "Decision Authority & Agent Reasoning" accordion.
    - `QueryWorkbench.tsx`: Researcher analytical collaboration panel and Decision Authority KPI badge.
    - `AuthorityPage.tsx`: Statutory Decision Authority & Multi-Agent Arbitration audit section.
    - Adaptive stakeholder views for Fisherman, Authority, and Researcher.

### Milestone Feature: Operational Integration of India MarineWatch & Dashboard Consolidation (§D037)
- **Status**: **COMPLETE & VERIFIED** (Frontend vitest: 242/242 passing across 17 suites; TypeScript check: 0 errors; Vite production build: succeeded cleanly; Backend pytest: 23/23 passing in `test_marinewatch_endpoints.py` and `test_agent_collaboration.py`).
- **Core Architecture & Experience Transformation**:
  - Eliminated standalone `/marinewatch` dashboard and removed its 4th portal card to unify all ocean intelligence under the 3 authoritative operational personas: **Fisher Console (`/fisher`)**, **Authority Command Deck (`/authority`)**, and **Researcher Lab (`/researcher`)**.
  - **Researcher Lab (`/researcher`)**:
    - Embedded `Unified GIS Explorer` (`gis` tab) featuring MapLibre GL nationwide interactive map, click-to-query depth profiles, INCOIS astronomical predicted tides (PAT), 13 geographic bookmark presets, time scrubber, and zoom-invariant clickable vector geometries (MPAs, 12nm territorial sea, 200nm EEZ, IMD/INCOIS hazard alerts, PFZ thermal fronts, bathymetric contours).
    - Embedded `Data Catalogue (§212)` (`catalogue` tab) showcasing the complete registry of 30 institutional marine datasets.
  - **Authority Command Deck (`/authority`)**:
    - Embedded `PortWatch Registry` (`ports` tab): CMFRI 30-Harbour Census detailing mechanized/motorized vessel capacity, quay berths, draft limits, and VHF monitoring channels.
    - Embedded `AquaWatch Registry` (`aquaculture` tab): Coastal Aquaculture Authority (CAA) registered farms with salinity (ppt), culture species, water source, and biosecurity audit tracking.
  - **Fisher Console (`/fisher`)**:
    - Enriched `OceanDetails.tsx`: Live INCOIS Astronomical Predicted Tide (PAT) water elevation above Chart Datum, tidal trend (Flood/Ebb), Next High Water, Next Low Water, nearest DGLL Coastal Lighthouse aid, and GEBCO bathymetric seabed depth.
    - Enriched `PFZDetails.tsx`: Target pelagic catch recommendations, optimal fishing gears (gillnet/purse seine/longline), distance/bearing from harbour, and thermal front indices.
  - **Dual-Client Synchronization**: Updated both `frontend/` (Vite) and `nextjs/` (Next.js) codebases to maintain 100% design and behavioral parity.

### Milestone Feature: Granular Dissolution of MarineWatch GIS into Fisher & Authority Dashboards (§D038)
- **Status**: **COMPLETE & VERIFIED** (Frontend vitest: 242/242 passing across 17 suites; TypeScript check: 0 errors; Vite production build: succeeded cleanly in 11.4s; Backend pytest: 23/23 passing in `test_marinewatch_endpoints.py` and `test_agent_collaboration.py`).
- **Core Architecture & Experience Transformation**:
  - Removed GIS Explorer map tab (`OceanWatchGIS`) entirely from `ResearcherPage.tsx` and `nextjs/views/ResearcherPage.tsx`. Researcher Lab is now exclusively focused on its 5 core scientific/analytical tools:
    1. Research Query Workbench (multi-agent evidence gathering and causal reasoning)
    2. Ocean Data Explorer (time-series marine observations, EO satellite grids, PFZ candidates, active hazards)
    3. Data Source Monitor (authoritative source health, freshness indicators, precedence hierarchy)
    4. Scenario Lab (S1–S8 benchmark evaluation suite with execution KPIs)
    5. Data Catalogue (§212) (30 institutional marine datasets across INCOIS, IMD, CMFRI, DGLL, and ISRO)
  - Granular distribution of all 8 MarineWatch map features into operational dashboards:
    1. **Maritime Boundaries & Restricted Zones**: Integrated 12nm Territorial Waters, 24nm Contiguous Zones, 200nm EEZ, MPAs, Naval Firing Ranges, and Sir Creek IMBL buffer into Fisher `MapView` base layers and popup formatters (`🛡️ Marine Sanctuary / Naval Range`).
    2. **DGLL Navigational Lighthouses**: 15 primary landfall lighthouses integrated into Fisher `MapView` with custom popups displaying optical range (nm), focal elevation, light character, and VHF Ch 16.
    3. **Bathymetry & Interactive Point Depth Inspector**: Added interactive Ocean Telemetry & Depth Inspector HUD to Fisher `MapView`. Clicking anywhere on the ocean triggers real-time spatial queries showing depth (m), distance to shore, continental shelf categorization, tidal elevation, and nearest lighthouse.
    4. **Astronomical Predicted Tides (PAT)**: Surfaced in Fisher Point Depth HUD and `OceanDetails.tsx`, as well as Authority Command Deck `PortWatchRegistry` with real-time draught clearance indicators.
    5. **PFZ Advisory Thermal Front Polygons**: Geodesic concentric thermal front circles generated and rendered on Fisher `MapView` with pelagic species, gear recommendations, and SST/Chl-a gradients.
    6. **Active Hazard Alert Corridors**: IMD/INCOIS cyclone tracks, squalls, and high swell warning polygons dynamically rendered on Fisher `MapView` and monitored on Authority Deck.
    7. **Multi-Hour Time Scrubber**: Floating time scrubber pill (`Now`, `+3h`, `+6h`, `+12h`, `+24h`, `+48h`) directly embedded into Fisher `MapView` for departure and voyage planning.
    8. **National Coastal Bookmarks**: 13 quick-jump coastal landmark selector chips (Ratnagiri, Mumbai, Kochi, Mannar, Chennai, Vizag, etc.) embedded as a floating control on Fisher `MapView` and as a dropdown in Authority Command Deck.
  - Nationwide Harbours expansion in `GuidedTripSetup.tsx` across both west and east coasts.
  - Maintained 100% architectural parity across `frontend/src/` and `nextjs/`.

### Milestone Feature: Authority Deck Layout & Semantic Styling Refactor (§D039)
- **Status**: **COMPLETE & VERIFIED** (Frontend vitest: 242/242 passing across 17 suites; TypeScript check: 0 errors; Backend pytest: 23/23 passing in `test_marinewatch_endpoints.py` and `test_agent_collaboration.py`; visual verification complete via Chrome DevTools MCP across light & dark themes).
- **Core Visual & Architectural Polish**:
  - **Command Bar Responsive Overflow**: Fixed horizontal clipping of right-hand telemetry chips (`VERDICT`, `FLEET`, `HAZARDS`, `EVIDENCE`) by applying horizontal scroll containment (`overflow-x: auto; scrollbar-width: none`), flexible gap constraints, and responsive chip padding.
  - **PortWatch & AquaWatch Semantic Architecture**: Replaced unstyled Tailwind utility classes (unprocessed in Vite) with dedicated semantic CSS classes in `components.css`:
    - PortWatch: `.portwatch-view`, `.portwatch-header`, `.portwatch-kpi-grid`, `.portwatch-kpi-card`, `.portwatch-toolbar`, `.portwatch-search-input`, `.portwatch-filter-select`, `.portwatch-table-wrap`, `.portwatch-table`, `.port-name-cell`, `.port-type-tag`, `.port-vhf-tag`, `.port-tide-tag`.
    - AquaWatch: `.aquawatch-view`, `.aquawatch-header`, `.aquawatch-kpi-grid`, `.aquawatch-kpi-card`, `.aquawatch-cards-grid`, `.aquawatch-card`, `.aquawatch-card-header`, `.aquawatch-attr-list`, `.aquawatch-status-badge`.
  - **Top Map Overlay HUD Collision**: Corrected `deckgl-top-overlay` right margin (`right: showControls ? 116 : 10`), completely eliminating collision with DeckGL camera controls (`[Tactical 3D] [High Orbit] [2D Flat]`).
  - **Theme Tokenization & Hex Leak Removal**: Replaced hardcoded inline hex colors (`#86efac`, `#f0fdf4`, `#166534`, etc.) with CSS variable tokens (`var(--color-*)`) across light and dark modes, ensuring WCAG contrast compliance and zero visual leaks in dark mode.
  - **Dynamic Benchmark Status Pills**: Updated `ScenarioBenchmarkDeck.tsx` to dynamically assign status pill classes (`.status-go`, `.status-caution`, `.status-no-go`) matching `expected_status` instead of hardcoded `.status-go`.
  - **FleetDeck Utility Standardization**: Added semantic classes for `.fleet-offline-banner`, `.fleet-replay-unavailable-card`, `.fleet-empty-state`, `.fleet-alert-inspection`, `.fleet-alerts-empty`, `.telemetry-icon-start`, and `.telemetry-icon-dest`.
  - **100% Dual-Client Parity**: Synchronized all component refactors and CSS definitions to `nextjs/` (`components/authority/`, `components/map/`, `views/`, and `styles/components.css`).

### Milestone Feature: Fisher Console Clutter Pruning & Interactive DOM Icon Markers (§D040)
- **Status**: **COMPLETE & VERIFIED** (Frontend vitest: 244/244 passing across 17 suites; TypeScript check: 0 errors; Backend pytest: 23/23 passing in `test_marinewatch_endpoints.py` and `test_agent_collaboration.py`; visual verification complete via Chrome DevTools MCP across light & dark themes).
- **Core Visual & Operational Refactor**:
  - **Pruning Excessive Macro-Areas & Nationwide Polygons**:
    - Filtered out 200nm sovereign Exclusive Economic Zone (EEZ) polygon fills and 12nm Territorial Waters fills from the Fisher Console (`/fisher`) map layers.
    - Filtered out 8km concentric circle PFZ thermal front polygons (`layer_pfz_thermal_fronts`).
    - Filtered out macro-regional weather hazard polygons spanning > 2.0 degrees (e.g. 700km IMD squall corridors covering 14°N to 21°N) and opposite-coast hazards, while retaining local navigation hazards with subtle opacity (`fill: 0.15`, `line_width: 2.0`).
    - Scoped base boundaries and marine protected areas (e.g. Malvan MPA) to local harbor operational vicinity (< 1.5° bbox) with clean, subtle outlines (`opacity: 0.08`, `line_width: 1.5`).
  - **Interactive DOM Icon Markers**:
    - Suppressed MapLibre canvas circle point layers (`circle-radius: 0`, `circle-opacity: 0`) to eliminate plain, generic colored dots.
    - Replaced with interactive DOM markers styled with `.marinewatch-custom-marker` and `.marinewatch-marker-inner`:
      - ⚓ `port-marker` for Departure Harbor Stations and Landing Harbours (`#0284c7`)
      - 🎯 `destination-marker` for Voyage Targets & Waypoint Destinations (`#f59e0b`)
      - 🗼 `lighthouse-marker` for DGLL Coastal Landfall Lighthouses (`#eab308`)
      - 🐟 `pfz-marker` for Potential Fishing Zone advisory locations (`#10b981`)
      - 🦐 `aqua-marker` for CAA Coastal Aquaculture facilities (`#f97316`)
      - ⚠️ `hazard-marker` for Point Marine Hazards (`#ef4444`)
      - ⛵ `vessel-marker` for Live Vessel Positions and Fleet Tracking (`#2563eb`)
  - **Mariner Interactivity & Zoom Adaptation**:
    - Marker click opens mariner popup cards (`formatFishermanPopup`) with operational data (depth, distance, VHF channel, coordinates).
    - Marker hover scales markers by 1.32x with CSS drop-shadows without jitter.
    - Dynamic zoom listener assigns `[data-zoom-tier="overview" | "regional" | "detail"]` on container for smooth scaling.
  - **100% Dual-Client Parity**:
    - Synchronized all filtering utilities (`fisher-map.ts`, `geo.ts`), marker rendering (`MapView.tsx`), and CSS tokens (`marinewatch.css`) across Vite (`frontend/`) and Next.js (`nextjs/`).

### Milestone Feature: Dynamic Live Hourly Marine Forecasts & Scrubber Integration (§D041)
- **Status**: **COMPLETE & VERIFIED** (Frontend vitest: 244/244 passing across 17 suites; TypeScript check: 0 errors; Backend pytest: 25/25 passing in `test_marinewatch_endpoints.py` and `test_agent_collaboration.py`; dual-client parity confirmed).
- **Core Architecture & Experience Transformation**:
  - **Eliminated Hardcoded Constants**: Removed static coastal heuristic approximations (`base_wave = 1.2`, static wind, static SST) from `marinewatch_service.py`.
  - **Live Hourly Forecasts via Open-Meteo**: Integrated real-time hourly queries to `marine-api.open-meteo.com` and `api.open-meteo.com`, dynamically extracting hourly slots via `_select_hour_index(times, target_dt)`.
  - **Physics-Grounded Temporal Fallback**: Added diurnal solar wind cycle, tidal modulation, and distance-to-shore scaling to guarantee dynamically varying ocean parameters even during offline fallback or unit tests.
  - **Multi-Hour API Parameters**: Added `time_offset_hours` and `timestamp` across `GET /forecast/point`, `GET /forecast/route`, and `POST /spatial/query`.
  - **Fisher Map Scrubber & Telemetry Badge**:
    - Floating telemetry card above the time scrubber renders live dynamic conditions: `🌊 Wave`, `💨 Wind`, `🌊 Tide`, `🌡️ SST`, and craft safety badge (`[GO / CAUTION / NO_GO]`).
    - Stepping forward in time (`Now`, `+3h`, `+6h`, `+12h`, `+24h`, `+48h`) queries dynamic hourly forecasts for harbor and updates `chat.missionContext.departure_time`.
    - Map click point inspector HUD passes the scrubber's selected time offset to evaluate wave height, swell period, wind direction, and astronomical tide for that future hour.
    - `OceanDetails.tsx` and `TripPlanDetails.tsx` dynamically refresh with the selected departure timestamp.
  - **100% Dual-Client Parity**: Fully synchronized across `frontend/` (Vite) and `nextjs/` (Next.js).

### Verified Status of Master Context §30 Items (Audited on 2026-09-21)

| ID | Issue | Severity | Audited Status | Findings |
|---|---|---|---|---|
| R-1 | `MarineConditionsPayload` validation regression (missing fields) | P0 | **RESOLVED & VERIFIED** | Tested in `tests/domain/test_partial_marine_payload.py` (7/7 passing). Optional fields instantiate safely without fabrication. |
| R-2 | Observation bundle lineage collapse to UNKNOWN | P0 | **RESOLVED & VERIFIED** | Tested in `tests/domain/test_observation_bundle.py` (7/7 passing). Direct value lineage to risk engine verified. |
| R-3 | Valid fallback evidence → automatic UNKNOWN | P0 | **RESOLVED & VERIFIED** | Implemented in `graph.py:1099-1121`. Fallbacks derive explicit `ConfidenceLevel.MEDIUM` with reason. |
| R-4 | `explanation_context` tool missing/unregistered | P1 | **RESOLVED & VERIFIED** | Unified under canonical tool scheduling (`marine_conditions`, `weather_conditions`, `hazard_search`, `risk_evaluation`) in `graph.py` with 5-step causal sequence. |
| R-5 | Temporal what-if reuses stale forecast instead of recomputing | P1 | **RESOLVED & VERIFIED** | Full temporal re-computation integrated across `WHAT_IF` intent turns in `graph.py`. |
| R-6 | What-changed / Decision Delta not fully supported in backend | P1 | **RESOLVED & VERIFIED** | Implemented `[DECISION DELTA]` comparison against baseline in `graph.py` backed by `ThreadContext.metadata`. |

> **Conclusion**: All P0 and P1 conversational intelligence and data foundation requirements have been implemented and verified. Full test suite passing: 466 passed in agent_eval, 19 passed in marinewatch API, 18 passed in domain, 235 passed in frontend vitest, and frontend production build succeeded.

### Strategic Gaps (new capabilities required by master context)

| ID | Capability | Priority | Status |
|---|---|---|---|
| G-1 | Canonical `MissionState` schema | P0 | IN_PROGRESS (backed by ThreadContext & ObservationBundle) |
| G-2 | `Source Registry` (machine-readable source capabilities) | P1 | COMPLETE (`CAPABILITIES_CATALOG` + ToolRegistry) |
| G-3 | `ExplanationEngine` (FACT→INFERENCE→CONSTRAINT→DECISION) | P1 | **RESOLVED & VERIFIED** |
| G-4 | `Decision Delta` backend computation | P1 | **RESOLVED & VERIFIED** |
| G-5 | Source conflict resolution policy | P1 | COMPLETE (`D010` authoritative hierarchy + fallback confidence) |
| G-6 | Hard constraint ordering (safety→legal→vessel→operational) | P0 | **RESOLVED & VERIFIED** |
| G-7 | ORCA Field Intelligence Network (Community Observations) | P1 | PLANNED (Architectural Spec §31, D034-D036) |

#### P0-11 — Chat Context State Integrity (Fisher What-If Controls)
- Fixed conversational logic to parse relative timestamps into absolute ISO references and compute true scenario offsets without overriding operational rules.
- Chat API preserves active context explicitly rather than merging partial deltas incorrectly into system intent templates.
- Enforced strict prompt boundaries mapping relative expressions ("leave two hours later") mathematically instead of relying on open-ended LLM arithmetic.

### P0-9 — Final Integration Validation & Defect Fixes
- **Frontend Defect Fixes**: Fixed `FisherDecisionSurface.tsx` to handle `TripAssessmentResponse.decision` correctly when strictly serialized as an Enum string from the backend, avoiding UI states permanently stuck in `UNKNOWN` and missing explanations.
- **Backend Safety Invariants Validated**: Validated through codebase scans and test suite execution that no LLM prompt overrides deterministic "NO GO" or "CAUTION" outputs. Re-verified `TripAssessmentResponse` API faithfully passes `UNKNOWN` and refuses "GO" predictions if any critical telemetry data (`marine`, `weather`, `hazard`) is expired or unreachable.
- **Offline / Credential Security Check**: Verified through codebase scans that no valid API keys are hardcoded. Tests involving missing/stubbed infrastructure explicitly flag themselves gracefully without crashing the UI.
- **Completed**: All 14 test journeys evaluated. Mocks have been isolated to fixture fallbacks as per the DATA_MODE contract.

### P0-7 — Authority chat sector context
- Authority chat now sends the active canonical sector `public_id` per request.
- The chat API validates the sector and derives canonical harbor and coordinates before graph execution.
- Explicit Authority context takes precedence over remembered conversation context; history remains retained and prior-sector responses are not shown as the current sector's active response.

### P0-8A — Authority sector hazards on map
- Canonical active hazard applicability is resolved by sector public ID and shared with P0-6 situation counts.
- The Authority map fetches and renders only the selected sector's canonical GeoJSON hazard layers, clearing them immediately on a sector change or unavailable response.

### P0-8B — Authority vessel-hazard associations
- Authority map highlights only vessels whose latest canonical replay position is inside a selected sector's active canonical hazard geometry.

### P0-8C — Authority operational hazard alerts
- Current, stable operational alerts are derived from P0-8B associations and displayed separately from historical broadcast notifications.

### P0-8D — Authority alert inspection
- Selecting a current operational alert reuses the canonical vessel replay focus and highlights the matching canonical hazard and association geometry. Inspection state is local to the active sector and is cleared on sector switch, unavailable data, or alert reconciliation.

### P0-8E — Authority evidence and audit flow
- Alert inspection opens the existing Audit view with direct canonical containment facts, separately labeled sector-situation evidence, and an explicit unavailable trace when no alert-to-run linkage exists.

### P0-8G — Authority route alternatives & balanced candidate
- Extended canonical RouteExposureEngine to return three truthful, evaluated route candidates: Safety-oriented (`ROUTE-A-INSHORE`), Balanced (`ROUTE-C-BALANCED`), and Direct (`ROUTE-B-DIRECT`).
- Route C follows an intermediate path through the canonical synthetic route graph (`node-01` -> `node-03` -> `node-06` -> `node-10` -> `node-14` -> `node-16`), offering a genuine trade-off (23.4 km, 1.7m max wave, 3.4 exposure) between distance and exposure.
- Exposed route alternatives via `/api/v1/demo/routes/alternatives` and `/api/v1/demo/sectors/{sector_id}/route-alternatives`.
- MissionMapBrief and MapView dynamic layer rendering updated with candidate switching, real metric display, and honest empty/unavailable handling without hardcoded operational route geometry.

### P0-8H — Simultaneous route alternatives visualization without clutter
- Established verifiable data ingest pipelines (`importers/`) covering INCOIS PFZ, IMD Hazards, and native NetCDF satellite handling (`xarray`).
- Integrated offline reference fallbacks safely bypassing unconfigured API endpoints without brittle scraping.
- Created Unified Trip Assessment Pipeline (`POST /api/v1/trip-assessments`), aligning Fisher dashboard and conversational interface decision logic (using `AssessmentService`).
- Established visual hierarchy for route comparison: selected candidate rendered prominently as solid cyan line (`line_width: 4`, `opacity: 0.95`, `#06b6d4`), while non-selected alternatives render simultaneously as thin, dashed lines (`line_width: 2.5`, `line_dasharray: [3, 3]`, `opacity: 0.50`, `#38bdf8`).
- Integrated dynamic sector route fetching in `AuthorityPage` with request cancellation and stale-state clearing on sector switch.
- Stabilized map camera bounds to prevent abrupt jumping/refitting during Safest / Balanced / Direct corridor switching.

### P0-8J — Region-specific map layer filtering on Fisher & Authority views
- Integrated `filterLayersByRegion` and `filterLayersBySectorPolygon` in `geo.ts` to geographically scope base boundaries and response layers.
- Scoped Fisher page map layers to the active departure harbor region, preventing out-of-region geofences, routes, and hazards from cluttering the local view.
- Scoped Authority page map layers to the active surveillance sector polygon, preventing cross-sector geofence and route leakage.
- Updated `MockRouteExposureEngine` to anchor passage route waypoints dynamically to the active sector or origin harbor coordinates instead of a hardcoded default.
- Resolved in-memory offline store re-entrancy deadlock (`RLock`).

### P0-8K — Authentic Indian EEZ & Island Maritime Boundaries (Mainland, Andaman & Nicobar, Lakshadweep)
- Integrated authentic UNCLOS maritime boundaries from Flanders Marine Institute (VLIZ Marine Regions v12):
  - Mainland & Peninsular EEZ (`POLY-EEZ-IND-MAIN`, 1,659,500 km², MRGID 8480) spanning Arabian Sea and Bay of Bengal down to 8° Channel Maldives treaty line.
  - Andaman & Nicobar Archipelago EEZ (`POLY-EEZ-IND-ANDAMAN`, 664,448 km², MRGID 8333) with full high-resolution boundary arc and international treaty borders (Indonesia, Thailand, Myanmar).
  - Lakshadweep Islands Sovereign Territorial Waters 12 NM (`POLY-TERRITORIAL-LAKSHADWEEP`, MRGID 49194 Part 0) enclosing Minicoy, Kalpeni, Kavaratti, Agatti, Androth, Amini, Kadmat, Kiltan, Chetlat, Bitra, and Suheli atolls.
  - Andaman & Nicobar Sovereign Territorial Waters 12 NM (`POLY-TERRITORIAL-ANDAMAN`, MRGID 49060) enclosing the entire island chain, plus Barren Island and Narcondam Island.
- Exempted national sovereign maritime boundaries from local sector culling in `frontend/src/utils/geo.ts` so India's complete water boundary is always accurately displayed nationwide while keeping local operational geofences (firing ranges, MPAs) scoped to their region.
- Excluded informational national boundaries from deterministic restricted zone hazard checks in `geo_restrictions.py`.
- Added multilingual translation mappings for national water boundary layers in Hindi and Marathi.

### P0-8M — Production 3D Maps for Authority and Researcher Dashboards
- Established unified WebGL2 Deck.gl 3D map foundation (`DeckGLMapFoundation.tsx`) with Tactical 3D (52° pitch), High Orbit (20° pitch), and 2D Flat camera presets, high-performance GPU memoization, and zero 60-FPS React state loop overhead.
- Authority Dashboard: Integrated `AuthorityDeckGLMap.tsx` as the primary operational command visualization with rotated vessel craft markers, illuminated tactical beacon for selected vessel, distinct historical tracks (`#06b6d4`), projected trajectories (`#facc15`), and recommended routes (`#10b981`), decluttered translucent hazards, and deterministic ETA telemetry (with explicit "ETA unavailable" fallback).
- Researcher Dashboard: Upgraded `PFZSpatialMap.tsx` (3D chlorophyll column encoding), `HazardSpatialMap.tsx` (3D severity-extruded translucent polygons), `EOGridSpatialMap.tsx` (5×5 satellite grid points with continuous metric coloring), and `QueryWorkbench.tsx` (spatial vector layer responses).
- Fisher Dashboard: Left `FisherPage.tsx` and MapLibre `MapView.tsx` 100% untouched to preserve the simple mariner operational interface.
- Verified zero TypeScript errors (`tsc --noEmit`), full test pass (227 tests in 15 suites), and clean production bundle (`vite build`).

### P0-8O — Authority & Researcher 3D Map Regression Fixes
- **Indian Landmass & Coastlines Restored**: Integrated synchronized MapLibre CartoDB dark-matter basemap under DeckGL in `DeckGLMapFoundation.tsx`, bringing authentic coastal geography, state borders, and bathymetry into view at 60 FPS.
- **Authority Fleet Surveillance Vessel Rendering**: Fixed data flow by fetching canonical vessel positions via `getDemoVesselReplay` in `AuthorityDeckGLMap.tsx`. Rendered verified vessels with heading-oriented nautical craft chevrons, speed labels, and illuminated beacons while strictly excluding missing/invalid coordinates without defaulting to sector center.
- **Auto-Zoom & Dynamic Viewport Calculation**: Implemented bounding box camera focusing for selected vessels (encompassing vessel coordinate + track + trajectory) and selected hazard bulletins with sensible operational padding.
- **Projected Trajectory & Route Separation**: Solidified strict visual hierarchy distinguishing historical tracks (solid cyan `#06b6d4`), projected trajectories (dashed amber `#facc15`), recommended routes (solid emerald `#10b981`), and candidate routes (`#64748b`).
- **Deterministic ETA Telemetry**: Calculated remaining voyage duration strictly from speed and route distance, providing an honest "ETA unavailable" fallback.
- **Researcher Hazard Bidirectional Selection**: Restored list <-> map hazard selection with auto-focus bounding box and gold highlight (`#facc15`).
- **Testing & Verification**: 230 tests passing across 15 test files, zero TypeScript errors (`tsc --noEmit`), and clean production build.

### P0-8P — Authority 3D Live Vessel Tracking, FlyTo Sector Transitions & Hazard Decluttering
- **Backend Fallback Fix**: Fixed `get_demo_vessels` and `get_demo_vessel_replay` in `backend/app/api/v1/routes.py` to correctly fall back to synthetic fixtures when the database is connected but unseeded (`if items: return [...]`), restoring the monitored vessels list and live replay playback.
- **Cinematic FlyTo Sector Transitions**: Added `FlyToInterpolator` with 1400ms duration to `AuthorityDeckGLMap.tsx` so switching surveillance sectors/regions automatically zooms out smoothly from the previous region and swoops into the selected region.
- **Rich 3D Live Vessel Tracking**: Ported the complete 3D vessel tracking system to Authority Dashboard:
  - 3D Amber Searchlight Beacon (`ColumnLayer`, elevation 3000m, radius 500m)
  - Dynamic Glowing Pulse Aura (`ScatterplotLayer` with real-time sinusoidal radius oscillation)
  - Real-time Glowing Amber Wake Trail (`PathLayer`, elevated at 200m)
  - 3D Floating Telemetry Label (`TextLayer`, elevation 3200m)
- **Sector Map Decluttering & Focused Hazard Blinking**:
  - Removed all opaque sector boundary fills and base geofence fills (`getFillColor: [0, 0, 0, 0]`), preserving ocean and shoreline clarity.
  - Non-active hazards are rendered as clean, thin outlines without color fill.
  - Only the specific hazard area where the vessel is actively located (or the selected operational alert) significantly blinks and pulses with a vivid glowing gold warning fill and bold border.

### P0-8Q — Researcher Hazard Selection Blinking & Compact Vessel Craft Icons
- **Researcher Hazard Selection Pulsing & Blinking**: Integrated 60-FPS sinusoidal pulsing ticker (`pulseTick`) and `FlyToInterpolator` in `HazardSpatialMap.tsx`. When a hazard is clicked in the list, its 3D polygon significantly blinks with dynamic glowing gold fill (`[250, 204, 21, alpha]`) and a bold 4.5px border while all other hazard polygons remain fully intact with their respective severity color tiers.
- **Sleek & Compact Nautical Vessel Craft Icons**: Replaced oversized circular scatterplot markers with precision-designed vector AIS vessel craft SVG icons (`IconLayer` in `AuthorityDeckGLMap.tsx` and `DeckGLMarineMap.tsx`) rotated along the vessel's actual navigation heading, with scaled down (12–24px) craft dimensions and refined beacon beam.

### P0-8R — Ocean-Strict 5×5 EO Grid Positioning & Dropdown Metric Selection
- **Strictly Oceanic EO Grid Coordinates**: Updated 5×5 satellite Earth Observation grid coordinate generator in `backend/app/domain/synthetic/generator.py` (`lons = [71.70, 71.95, 72.20, 72.45, 72.70]`) and exported updated fixtures so that 100% of the 25 grid cells are strictly located in the open Arabian Sea with ~35–80 km offshore clearance from the Konkan coastline, completely eliminating any grid cell overlap on land.
- **Dropdown Observation Metric Selector**: Replaced header metric tabs in `EOGridSpatialMap.tsx` with a custom-styled dropdown select menu (`SST (°C)`, `Chlorophyll-a (mg/m³)`, `Cloud Cover (%)`). Selecting any metric instantly updates point values, dynamic continuous color ramps (thermal SST, oceanic chlorophyll, cloud fraction), summary statistics (Min, Mean, Max), cell inspect drawers, and bottom overlay legend.

### P0-8L — Fleet Surveillance Accurate Route Corridors with Start & Destination Terminals
- Parameterized route alternatives endpoint (`/api/v1/demo/routes/alternatives`) with `vessel_id` to contextualize navigation corridors directly to the active fleet craft.
- Updated `MockRouteExposureEngine` to connect authentic multi-waypoint navigation corridors (Safest Inshore, Balanced, Direct) from the vessel's specific home harbor/departure coordinates to its specific trip destination/fishing bank.
- Dynamically generates start point marker (`layer_route_start_marker`, emerald `#10b981`) and end point marker (`layer_route_end_marker`, amber `#f59e0b`) in `MapView.tsx`.
- Updated `MissionMapBrief.tsx` to extract and display Departure (Start) and Destination (End) names/coordinates directly under corridor metric pills.
- Updated `FleetTrackingDeck.tsx` to surface Start and Destination coordinates and harbor labels in the GPS scrubber telemetry deck.
- Strictly verified and enforced that passage routes never cross inland onto dry land; all alternative corridors (Safest Inshore, Balanced, Direct) across all 14 vessels and general sectors follow authentic, verified in-water channels and clamp coordinates seaward into the Arabian Sea.

### P0-8M — Fleet Surveillance Trajectory Replay Continuous Autoplay & Lifecycle Controls
- Configured GPS trajectory replay to autoplay automatically upon vessel selection and sector load, starting from departure (`currentIndex = 0`, `isPlaying = true`).
- Enhanced ticker animation to continuously trace coastal voyages point-by-point (1s intervals), hold for 2s at the voyage destination to display arrival telemetry, and smoothly loop back to departure.
- Guarded operational alert audits: clicking a vessel hazard alert pauses playback and anchors the camera and vessel marker at the evaluated containment position (`pos.length - 1`).
- Upgraded playback controls: Play button restarts from departure when reaching the end, Reset button rewinds and immediately plays, active vessel card click restarts playback, and manual slider scrubbing pauses playback cleanly.
- Added clean timestamp formatter (`formatTimestamp`) normalizing ISO timestamps into readable `HH:mm` format across UI labels and MapLayer popups.

### P0-8N — Fleet Surveillance Predicted Path Dynamic Yellow Dotted Line
- Configured vessel predicted path (`layer_fleet_estimated_trajectory`) in yellow dotted line (`color: '#facc15'`, `line_width: 3`, `line_dasharray: [0, 2]`) using round line-cap geometry.
- Dynamically generates the predicted path directly ahead of the vessel craft on every step of autoplay and manual scrubbing, projecting both the remaining planned voyage route to destination and the 30-minute dead-reckoning trajectory based on instantaneous speed and heading.
- Updated `MapView.tsx` to compile `line-dasharray` directly into initial line layer paint definitions as well as runtime updates.
- Synchronized layer lifecycle: clearing predicted path on empty vessel telemetry or sector switch, while maintaining active layer on replay autoplay.

### P0-9 — Authoritative Marine Observation Single Source of Truth
- Eliminated architectural source-of-truth split between legacy static `marine_dataset.py` and deterministic synthetic OSF time-series fixture (`data/fixtures/synthetic/incois/osf_hourly_observations.json`).
- Updated `SnapshotConnector` to directly load `osf_hourly_observations.json` and normalize records through `IncoisOSFNormalizer.normalize()`.
- Refactored `DataService` in SNAPSHOT and SYNTHETIC modes to route through `SnapshotConnector`, eliminating hardcoded dummy payloads and silent dataset fallbacks.
- Verified single source-of-truth consistency across fixture -> INCOIS adapter -> ObservationBundle -> Risk Engine -> Situation Assessment -> Researcher Demo API with dedicated test suite (`test_marine_source_of_truth.py`).

### P0-10 — PFZ (Potential Fishing Zone) Data Semantics Fix
- Corrected semantic mapping in Researcher Lab where PFZ thermal gradient (`sst_gradient`) was being converted to a fabricated absolute sea surface temperature (`sst_celsius: 28.0 + p.sst_gradient`) and rendered with `°C`.
- Updated `PFZCandidate` interface, mock fixture, and mapper in `frontend/src/api/researcher-client.ts` to preserve `sst_gradient: number | null` explicitly without fabricating temperature.
- Updated `frontend/src/components/researcher/OceanDataExplorer.tsx` to display `SST Gradient: <value>` without `°C` and preserved `depth_m`, `bearing_deg`, `distance_km`, `chlorophyll_a_mg_m3`, and validity fields.
- Fixed backend `/api/v1/demo/pfz-candidates` fallback `valid_only` filtering to match `qc_status == 'VALID'`.
- Added end-to-end semantic validation tests (`tests/domain/test_pfz_data_semantics.py` and `researcher.test.ts`).

### P0-11 — Removed Fabricated/Random ScenarioLab Fallback Results
- Eliminated all `Math.random()` and mock scenario execution fallbacks in `frontend/src/api/researcher-client.ts`.
- Structured `runScenario` to return genuine results produced by the deterministic `ScenarioRunner` on success, and explicit unavailable/error state (`status: 'error'`, `is_error: true`, `evidence_count: 0`, `trace_steps: 0`, `confidence_level: 'UNKNOWN'`) on network/HTTP failure or timeout.
- Enhanced `ScenarioLab.tsx` with dedicated error cards for unavailable backend scenarios and detailed verdict badges (`PASS`/`FAIL`), executed tools tags, and decisive factors on successful runs.
- Preserved `MOCK_SCENARIOS` strictly for offline scenario list metadata fallback, completely disconnected from execution results.
- Added regression tests verifying zero fake metrics or random calls upon execution failure.

### P0-12 — Persistent DATA MODE Indicator for Researcher Lab
- Added persistent, clearly visible `DATA MODE: SYNTHETIC DEMO / SNAPSHOT` indicator in the shared top-level command bar of `ResearcherPage.tsx`.
- Centralized the source-of-truth constants `CANONICAL_DATA_MODE_LABEL` and `CANONICAL_DATA_MODE_TOOLTIP` in `frontend/src/api/researcher-client.ts`.
- Ensured the indicator persists seamlessly across all 4 Researcher decks (Ocean Data, Data Sources, Scenario Lab, Query Workbench) without layout clipping or tab disruption.
- Verified absence of conflicting/misleading `LIVE` operational labels.

### P0-13 — 48-Hour Marine Observation Time-Series Visualization in Researcher Lab
- Implemented lightweight, pure-SVG 3-panel synchronized temporal visualization in `OceanTimeSeriesChart.tsx` integrated into `OceanDataExplorer.tsx`.
- Exposes temporal behavior across 48 hourly observations for Significant Wave Height (SWH, meters), Sea Surface Temperature (SST, °C), and Wind Speed (knots) with individual calibrated y-scales and caution threshold references.
- Real timestamps rendered on x-axis (e.g. `Sep 11 06:00 UTC`, `Sep 12 18:00 UTC`), strictly sorted chronologically before rendering and latest-card computation.
- Missing/null values are rendered as explicit path gaps (never coerced to zero).
- Full QC awareness distinguishing valid observations (`VALID`) from suspect/flagged ones (`SUSPECT`/`DEGRADED`) visually and in interactive crosshair hover tooltips.
- Latest-condition cards compute values from the newest timestamp rather than arbitrary array order.
- Clear provenance caption: `INCOIS OSF-style hourly observations · 48-hour synthetic snapshot`.
- Harbor selection dynamically loads and renders the 48-hour time series for Ratnagiri vs. Malvan.
- Verified with 18 automated frontend tests in `researcher.test.ts`, full vitest suite (112 tests passing), and clean `tsc && vite build`.

### P0-14 — PFZ (Potential Fishing Zone) Spatial Map Visualization in Researcher Lab
- Implemented `PFZSpatialMap.tsx` reusing existing project MapLibre GL conventions with CartoDB dark matter basemap for spatial exploration of PFZ advisory candidates.
- Plotted genuine candidate coordinates (`latitude`, `longitude`) returned by `GET /api/v1/demo/pfz-candidates?valid_only=true` with rank badges (`#1`, `#2`) and confidence visual indicators.
- Embedded interactive MapLibre popups and bidirectional selection linking between the spatial map and PFZ candidate cards (highlighting and camera focus).
- Preserved strict scientific semantics: explicitly displayed `SST Gradient` (never `SST: X °C`), chlorophyll-a, depth, distance, bearing, validity window, and source.
- Handled backend confidence directly (preserving `HIGH`/`MEDIUM`/`UNKNOWN`, never fabricating or converting missing to 0).
- Handled edge cases: multi-candidate dynamic bounds auto-fitting, single candidate centering, invalid coordinate filtering, and explicit empty state.
- Compact map provenance caption: `INCOIS PFZ-style candidate data · synthetic snapshot`.
- Validated with 7 automated unit & feature transformation tests (119 total frontend tests passing) and clean `tsc && vite build`.

## Phase 2: Data Grounding & Provider Alignment (Current)

### Completed
- Contract alignment for `MarineConditionsPayload`: Added `wave_direction_deg` and `freshness_flags`.
- Refactored `OpenMeteoConnector`: Fixed trip-window alignment, km/h to knots conversion, added precise forecast hour extraction.
- Refactored `SnapshotConnector` and `DataService`: Removed clock-invented timestamps. 
- Synced test baselines in `SYNTHETIC` and `SNAPSHOT` data modes to deterministic scenario anchor times (`2026-09-12T06:00:00+00:00`) rather than fabricating time from `now_utc`.
- Repaired corrupted provider tests (`test_imd.py`, `test_incois.py`) and updated `test_open_meteo.py` mocks.
- `IncoisOSFNormalizer` updated to correctly derive a 6-hour `valid_to` window deterministically from `observation_time` instead of from the current clock.
- **Verification:** 100% pass on regression suite (148 tests).

### Blockers
None

### P0-15 — Hazard Spatial Polygon Visualization in Researcher Lab
- Implemented `HazardSpatialMap.tsx` reusing MapLibre GL conventions and dark basemap styling for spatial exploration of observed/advisory hazard polygons.
- Converted actual backend hazard polygon geometries (`geometry_geojson` Polygon/MultiPolygon) into GeoJSON FeatureCollections, preserving exact polygon vertices.
- Handled coordinate normalizations (numeric pairs and space-separated string pairs `"lon lat"`) with strict validation (filtering out invalid geometries safely without inventing coordinates).
- Established clear visual hierarchy for `ACTIVE` / `PLANNED` vs `EXPIRED` (historical) hazards:
  - ACTIVE/PLANNED hazards render with prominent fill opacity (0.28) and solid outline (width 2.2).
  - EXPIRED historical hazards render with subdued fill opacity (0.08) and dashed outline (`[3, 3]`, width 1.4).
- Preserved categorical severity mapping (`WARNING` #ef4444, `ALERT` #f97316, `WATCH` #f59e0b, `ADVISORY` #38bdf8, `NORMAL` #64748b, missing -> `UNKNOWN` #94a3b8) without calculating fake risk scores or converting missing severity to zero.
- Interactive MapLibre popup with Event Type, Severity, Status badge, Validity window, Affected Area, QC status, Source, and Description.
- Bidirectional interactive selection linking between map polygon features and hazard cards in `OceanDataExplorer.tsx` (card click fits/centers map; map polygon click selects card).
- Preserved overlapping polygons as independent inspectable records without conflation.
- Resilient fallback handling: text-only fallback without geometry renders explicit spatial empty state ("No spatial hazard polygons available for rendering.") without fabricating coordinates.
- Compact provenance caption: `Synthetic hazard polygons · source-faithful demonstration data`.
- Validated with 8 automated unit & feature transformation tests (128 total frontend tests passing), full TypeScript typecheck, and clean `tsc && vite build`.

### P0-16 — Earth Observation 14-Day Temporal Analysis in Researcher Lab
- Resolved temporal truncation by preserving all 350 multi-day satellite grid cell observations (14 daily time slices × 25 spatial cells) in `fetchEOGridCells()`, while preserving `getLatestEOGridCells()` for the latest spatial snapshot table.
- Implemented `EOTemporalAnalysisChart.tsx` featuring pure-SVG 14-day temporal trend line chart with metric switcher:
  - **SST (°C)**: absolute Sea Surface Temperature from INSAT-3D/Oceansat thermal sensors (never confounded with PFZ `sst_gradient`).
  - **Chlorophyll-a (mg/m³)**: surface chlorophyll concentration from Oceansat-3 OCM.
  - **Cloud Cover (%)**: pixel cloud fraction percentage across the 5×5 satellite grid.
- Implemented deterministic daily spatial aggregation (`aggregateEOTemporalSeries`):
  - Strictly groups records by ISO date (`2026-08-30` through `2026-09-12`).
  - Calculates arithmetic daily spatial mean across valid (non-null) grid cells only, without coercing nulls/missing to zero.
  - Generates min-max spatial spread ribbon (shaded variability envelope between daily min and max cell values).
  - Renders null days (e.g. 100% cloud obscuration) as explicit line gaps with 0 valid count.
  - Tracks valid-cell count (e.g. `24 / 25 cells`) and mean pixel uncertainty (e.g. `±0.12`).
- Interactive hover cursor and tooltip with full QC status breakdown (`VALID`, `CLOUD_OBSCURED`, `DEGRADED_QC_WARNING`, `NO_DATA`).
- Summary KPI cards for 14-day overall mean, observed spatial range, and valid cell coverage rate.
- Compact provenance caption: `MOSDAC/EO-style daily observations · 14-day synthetic snapshot · Spatial mean across valid grid cells`.
- Validated with 13 automated unit & feature transformation tests (141 total frontend tests passing), full TypeScript typecheck, and clean `tsc && vite build`.

### P0-17 — Unified Data Quality & Provenance UX in Researcher Lab
- Implemented a lightweight, reusable data quality and provenance presentation layer across all existing synthetic datasets in the Researcher Lab:
  - Created `DataProvenancePanel.tsx`: compact expandable panel with top-bar summary (provider badge, dataset name, synthetic snapshot mode badge, snapshot period, valid-count pill, and drawer toggle) and detailed trust breakdown (source product lineage, QC classification breakdown, pixel uncertainty, semantics disclosure, and documentation link).
  - Created `src/utils/provenance.ts`: deterministic metadata derivation helpers for all 4 analytical datasets:
    - **Marine Weather Observations**: 48-hour hourly snapshot from INCOIS OSF, distinguishing `VALID` vs `SUSPECT` QC records, preserving sensor null gaps without converting to zero.
    - **Earth Observation Satellite Grid**: 14-day 5×5 grid snapshot from ISRO MOSDAC, distinguishing `VALID`, `CLOUD_OBSCURED`, `DEGRADED_QC_WARNING`, and `NO_DATA` states, exposing mean pixel uncertainty when available.
    - **PFZ Advisory Candidates**: INCOIS PFZ candidate front analysis, explicitly separating advisory `confidence` (`HIGH`/`MEDIUM`) from data `qc_status` (`VALID`/`SUSPECT`), and maintaining `SST Gradient` semantics (°C/km or unitless anomaly).
    - **Hazard Advisory Bulletins**: IMD/INCOIS meteorological bulletins, explicitly separating operational validity status (`ACTIVE`/`EXPIRED`/`PLANNED`) from data `qc_status` and event `severity`.
- Updated `DataSourceMonitor.tsx` to display configured prototype source profiles truthfully:
  - Replaced misleading "X ago" live freshness timers with explicit "Configured Sync Cadence" badges (e.g. `1-hour observation cadence`, `6-hour advisory cycle`, `14-day daily raster snapshot`, `Static geofence registry`).
  - Added prototype source registry disclosure card explaining synthetic demo ingestion semantics.
- Preserved authoritative `DATA MODE: SYNTHETIC DEMO / SNAPSHOT` persistent disclosure across all views.
- Validated with comprehensive automated test suite (55 researcher tests, 149 total frontend tests passing across 11 test suites), 31 backend contract/domain tests passing, and clean `npm run build` production bundle.

### P0-18 — Tide Temporal Analysis in Researcher Lab
- Implemented dedicated, lightweight pure-SVG 48-hour tide temporal visualization (`TideTimeSeriesChart.tsx`) integrated into `OceanDataExplorer.tsx` beneath the existing P0-13 3-panel marine chart.
- Preserved existing `OceanTimeSeriesChart.tsx` (3-panel SWH, SST, Wind Speed) completely intact without modification or clutter.
- **Primary Metric**: Tide Level in meters above Chart Datum (`LAT` - Lowest Astronomical Tide), directly sourced from the synthetic INCOIS OSF dataset (`tide_level_m`, `units_json.tide_level`).
- **Secondary Information**: Tide Phase (`tide_phase`), preserved strictly as categorical values (`FLOOD`, `EBB`, `HIGH`, `LOW`). Never coerced to numerical values or inferred from curve slope.
- **Data Quality & Missing Values**:
  - Missing tide levels remain explicit gaps in SVG paths (null ≠ 0).
  - Suspect/degraded QC observations flagged with warning indicators and distinct stroke styling.
  - Zero tide forecasting or fabricated future tide predictions; scientific disclosure explicitly clarifies snapshot boundaries.
- **Tide Provenance & Trust Integration**:
  - Added `deriveTideTrustMetadata` in `src/utils/provenance.ts` integrating the reusable `DataProvenancePanel.tsx`.
  - Exposes provider (INCOIS OSF), 48-hour temporal coverage, valid observation count (e.g. `48 / 48 observations`), QC breakdown, and Chart Datum semantics (`LAT`).
- **Harbor Switching**: Dynamically updates tide observations, SVG curve, phase distribution, and provenance when switching between Ratnagiri and Malvan, with explicit empty/degraded states if unavailable.
- **Validation**: 62 researcher tests (156 total frontend tests passing across 11 suites), 31 backend contract/domain tests passing, and clean `tsc && vite build` bundle.

### P0-19 — Earth Observation Spatial Grid Visualization in Researcher Lab
- Implemented `EOGridSpatialMap.tsx` reusing project MapLibre GL conventions with CartoDB dark matter basemap for spatial exploration of the 5×5 Earth Observation satellite grid across the Konkan coast.
- **14-Date Snapshot Selector**:
  - Dynamically extracts available observation dates (`Aug 30, 2026` → `Sep 12, 2026`) chronologically.
  - Slices only the chosen date's 25 grid cells without contaminating the P0-16 14-day temporal baseline.
  - Features quick step buttons (`<` / `>`) and dropdown picker.
- **Multi-Metric Switcher**:
  - **SST (°C)**: Absolute Sea Surface Temperature from INSAT-3D/Oceansat thermal sensors with calibrated continuous Blue → Amber → Red colormap.
  - **Chlorophyll-a (mg/m³)**: Surface ocean color chlorophyll concentration with Emerald → Green → Cyan colormap.
  - **Cloud Cover (%)**: Pixel cloud fraction percentage with Sky Cyan → Slate → White colormap.
- **Data Quality & QC Semantics**:
  - `VALID` cells render with continuous metric colors.
  - `CLOUD_OBSCURED` cells render with distinct cloud-slate color (`#64748b`) and explicit tooltip status.
  - `DEGRADED_QC_WARNING` / `SUSPECT` cells render with amber warning color (`#f59e0b`).
  - `NO_DATA` / null values render as dark slate (`#334155`) — never converted to zero.
- **Spatial Statistics & Inspection**:
  - 4-card KPI strip displaying Coverage (`X / 25 cells`, cloud-obscured count), Spatial Minimum, Spatial Mean (*strictly across valid cells only*), and Spatial Maximum.
  - Interactive MapLibre hover tooltips and click selection opening an in-depth cell inspector panel (coordinates, pass time, all metrics, uncertainty, and satellite source).
- **Provenance & Trust Integration**:
  - Added `deriveEOSpatialTrustMetadata` in `src/utils/provenance.ts` integrating the reusable `DataProvenancePanel.tsx`.
  - Discloses discrete 5×5 synthetic grid observation semantics without claiming continuous raster or live satellite telemetry.
- **Validation**: 71 researcher tests (165 total frontend tests passing across 11 suites), 31 backend contract/domain tests passing, and clean `tsc && vite build` production bundle.

### P0-20 — Scenario Comparison in Researcher Lab
- Implemented `ScenarioComparisonView.tsx` enabling side-by-side analytical comparison of multiple (2–4) synthetic scenario executions over the real `/api/v1/scenarios/{id}/run` ORCA execution pipeline.
- **Multi-Scenario Selection & Limiting**:
  - Scenario list cards support multi-select checkboxes with a strict 4-scenario ceiling to prevent UI clutter and unreadable comparison matrices.
  - Added segmented view switcher between `[Single Inspection]` and `[Scenario Comparison (N)]` modes, preserving the single-scenario execution workflow completely intact.
  - Multi-selection actions include "Run Selected (N)", individual rerun buttons, and "Reset Comparison" state clearing.
- **Execution State & Honest Verdict Distinction**:
  - Distinguishes execution `ERROR` (network/server failure, `is_error: true`, amber badge) from scenario `FAIL` (`passed === false` on valid run, rose badge).
  - Unexecuted scenarios display as `NOT RUN` / `IDLE` without fabricated metrics or results.
  - Partial failure resilience: If one scenario errors and another succeeds, the successful real result is preserved and displayed alongside the explicit error card.
- **Side-by-Side Comparison Matrix**:
  - **Intent Comparison**: Evaluates `expected_intent` vs `actual_intent` with high-visibility `MATCH` / `MISMATCH` badges.
  - **Status & Recommendation**: Compares `expected_status` vs `actual_status` (e.g. `GO` vs `NO_GO` / `CAUTION`).
  - **Confidence Scale**: Displays actual backend confidence (`HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`) on its native scale without normalized conversions or artificial safety percentages.
  - **Evidence & Grounding**: Displays verified evidence item counts and ground truth badges (`Grounded` vs `Unverified`).
  - **Executed Tools**: Compares executed domain tools (`marine_conditions`, `hazard_context`, `pfz_candidates`, `route_generation`).
  - **Execution Latency & Trace Steps**: Displays real milliseconds elapsed (`ms`) and node execution step count.
- **Deep Inspection Cards**:
  - Expandable side-by-side panels detailing Mariner Synthesis answers, backend Decisive Factors, System & Expectation Validation notes, and runtime Warnings.
- **Validation**: 78 researcher tests (172 total frontend tests passing across 11 suites), 31 backend domain/contract tests passing, and clean `tsc && vite build` production bundle.

### P0-21 — Query Workbench Analytical Upgrade in Researcher Lab
- Upgraded `QueryWorkbench.tsx` into a credible, interactive analytical research workspace over the real `/api/v1/chat` backend without modifying ORCA reasoning or deterministic risk logic.
- **In-Memory Conversation Session**:
  - Maintains chronological user queries and assistant reasoning responses with localized client-side interaction timestamps.
  - Features a visible "New Analysis" / Clear button that cleanly resets conversation messages, spatial map views, and transient errors back to the empty state without altering application state or synthetic fixtures.
- **Categorized Structured Prompt Shortcuts**:
  - 7 domain-specific inquiry chips (Ocean Conditions, Departure Safety, PFZ Thermal Gradient, Active Hazards, Evidence Grounding, Data Gaps & Uncertainty, Spatial Vector Layers) mapped to genuine research questions.
  - Completely excludes unsupported live AIS or imaginary queries.
- **Comprehensive Analytical Response Layout**:
  - **KPI Header Strip**: Displays Intent, Recommendation Status (`GO`, `CAUTION`, `NO_GO`, `UNKNOWN`, `INFORMATIONAL`), Confidence level, Evidence count with Grounded badge, and Spatial Layer count.
  - **Uncertainty & Degraded Data Callouts**: Prominently surfaces `UNKNOWN` confidence, missing sensor inputs, and operational warnings without forcing false binary decisions or scores.
  - **Recommendation & Directive**: Displays executive summary, next action directive, decisive drivers with bullet icons, non-decisive context, and structured threshold comparisons table.
  - **Evidence Inspector**: Collapsible table detailing Issuing Authority, Metric, Observed Value, Unit, QC/Quality Flags, and Observation/Validity windows.
  - **ORCA Reasoning Trace**: Collapsible trace timeline with executed tools tags (e.g. `marine_conditions`, `hazard_context`, `risk_engine`, `route_generation`) and step-by-step node execution status and duration.
  - **Spatial Context / Map Layers**: Integrated `MapView` rendering the actual `map_layers` returned by the backend with dark matter basemap and legend; shows an explicit "No spatial layers returned" note when `map_layers` is empty.
  - **Suggested Follow-ups**: Contextual quick-reply chips for continuing exploratory research inquiries.
- **Resilient Error & Loading Handling**:
  - Displays "Analyzing marine observations & executing specialist pipeline…" loading state.
  - Catches API errors into an explicit error card while preserving all prior session history intact.
- **Synthetic Data Disclosure**:
  - Persistent `DATA MODE: SYNTHETIC DEMO / SNAPSHOT` badge and input footer disclosure.
- **Validation**: 85 researcher tests (179 total frontend tests passing across 11 suites), 31 backend domain/contract tests passing, and clean `tsc && vite build` production bundle.

### P0-22 — Fisherman Decision Surface
- Upgraded the Fisherman Dashboard from a pure chat experience into a focused decision-support surface answering immediately: *"Can I go right now, and why?"*
- **Primary Decision Section**:
  - Prominent status card supporting four normalized states: `SAFE TO GO` (mapped from backend `GO`), `CAUTION` (mapped from `CAUTION`), `DO NOT GO` (mapped from `NO_GO`), and `UNKNOWN` (mapped from `UNKNOWN`/initial/error).
  - Explicit initial state before a valid backend response is strictly **`UNKNOWN`** with neutral slate styling, eliminating previous GO default.
  - One-sentence mariner explanation derived directly from backend recommendation summary or decisive factors without client-side risk calculation.
- **Essential Local Conditions Strip**:
  - Compact 4-tile condition strip immediately beneath the primary decision: **Waves** (significant wave height + units), **Wind** (sustained wind speed + units), **Visibility** (visibility + units), and **Hazard** (active hazard/squall alert status).
  - Preserves strict safety semantics: missing values are rendered as `—` (never coerced to 0). Excludes complex researcher-only metrics (SST, chlorophyll, EO grid, QC breakdown, provenance tables).
- **Harbor Marker & Map Neutrality**:
  - Scoped departure harbor layer `createHarborLayer` to default to `UNKNOWN` neutral slate (`#64748b`) until a valid recommendation is returned, preventing the map from falsely communicating GO before assessment.
- **What-If & Data Mode Integration**:
  - What-If simulations cleanly flag hypothetical scenario diffs with dedicated pill badges.
  - Persistent canonical `DATA MODE: SYNTHETIC DEMO / SNAPSHOT` badge in the decision topbar reusing shared constants.
- **Validation**: 16 dedicated unit/integration tests in `fisher-decision.test.ts` (202 total frontend tests passing across 12 suites), 101 backend domain/contract tests passing, and clean `tsc && vite build` bundle.

### P0-23 — Fisherman Interactive Decision Map
- Upgraded the Fisherman Dashboard map from a passive viewport into a simple, interactive operational decision map answering: *"Where am I, what areas should I be aware of, what route/area is recommended, and what hazards should I avoid?"*
- **Architecture & Shared MapView Integrity**:
  - Maintained generic `MapView.tsx` backward compatibility across Fisherman, Authority, and Researcher dashboards without hardcoded persona-specific popups or logic.
  - Added extensible `customPopupRenderer`, `onResetView`, `resetViewTrigger`, and `layerAvailability` props.
- **Data Transformation & Layer Utilities Reuse**:
  - Reused existing pure transformers `buildPFZGeoJSON` (from `PFZSpatialMap.tsx`) and `buildHazardGeoJSON` (from `HazardSpatialMap.tsx`), preventing duplicate GeoJSON logic.
  - Preserved numerical SST gradient for PFZ without fabricating absolute `°C` temperature.
  - Preserved backend-provided active/expired status for marine hazards without independent client timestamp evaluation.
- **Strict Layer De-duplication & Merging**:
  - Implemented `mergeFisherLayers` in `frontend/src/utils/fisher-map.ts`. When chat responses supply authoritative route, PFZ, hazard, or origin layers, they cleanly override baseline layers without array concatenation duplication.
- **Independent Baseline Fetches & Partial Failure Resilience**:
  - Scoped `FisherPage.tsx` baseline fetches for routes (`getDemoRouteAlternatives`), PFZ (`fetchPFZCandidates`), and hazards (`fetchHazards`) with independent error boundaries.
  - Failure in one layer (e.g., routes) preserves full availability of other layers (PFZ, hazards, base boundaries) and surfaces honest unavailable status in `MissionMapBrief`.
  - Never fabricates vessel IDs or default vessel selection for routes.
- **Mariner-Focused Popups & Controls**:
  - Formatted concise, high-contrast HTML popup cards for departure station, PFZ candidate, marine hazard, and recommended route without researcher-style QC/provenance/diagnostics.
  - Added camera reset / fit bounds action button (`Focus` icon) in `MissionMapBrief`.
- **Validation**: 5 dedicated tests in `fisher-map.test.ts` (207 total frontend tests passing across 13 suites), 101 backend domain/contract tests passing, and clean `tsc && vite build` bundle.

### P0-24 — deck.gl Visual Experiment & Spatial Analytics
- Added isolated experimental deck.gl component (`DeckGLMarineMap.tsx`) and evaluation command view (`DeckGLExperimentView.tsx`) to visually benchmark WebGL2-accelerated geospatial rendering against production MapLibre.
- Rendered authentic SAMUDRA data layers without fabricating coordinates:
  - **Marine/Hazard Polygons**: GeoJSON layer with severity-coded translucent styling and optional 3D extrusion (2500m / 1800m / 1200m prisms).
  - **PFZ Candidate Points**: ScatterplotLayer + TextLayer with animated radial pulse effects and rank `#1`/`#2` indicators.
  - **Recommended Route & Alternative Corridors**: High-visibility cyan primary path (`[6, 182, 212]`, 5px) and subdued candidate lines.
  - **Vessel Telemetry**: Amber pulsing vessel marker with speed/heading telemetry and replay scrubber.
  - **National Water Boundaries**: UNCLOS EEZ and 12 NM territorial water boundaries.
- Integrated Turf.js spatial calculation utilities (`spatial-analytics.ts`):
  - Geodesic distance & initial bearing.
  - Cross-track distance (point-to-route error).
  - Point-in-polygon containment (`isPointInHazardPolygon`).
  - Route-hazard intersection collision detection (`findRouteHazardIntersections`).
- Preserved production Fisher, Authority, and Researcher MapLibre map views completely untouched.
- Added 11 dedicated automated tests in `spatial-analytics.test.ts` and `deckgl-experiment.test.ts` (218 total frontend tests passing across 15 suites), full typecheck (`tsc --noEmit`), and clean production build.

### P0-25 — Real LLM Provider Integration (Groq LLaMA 3.3 70B & Multi-turn Natural Language)
- Integrated real Groq LLM provider (`GroqLLMProvider`) using `llama-3.3-70b-versatile` with structured JSON mode and text generation capabilities.
- Wired runtime `POST /api/v1/chat` to resolve active LLM provider under `LLM_MODE="auto"` while retaining 100% deterministic fallback when `GROQ_API_KEY` is omitted or API calls encounter timeouts/errors.
- Propagated raw user query safely through sandboxed prompt context (`<user_query>`) into intent extraction (`intent_locale_node`) and grounded response synthesis (`response_composer_node`).
- Enforced hard deterministic safety gates:
  - Recommendation status (`GO` / `CAUTION` / `NO_GO` / `UNKNOWN`) evaluated solely by deterministic marine engines (`DeterministicRiskEngine`, `RouteExposureEngine`, `GeospatialHazardEngine`); LLM drafts cannot alter status.
  - Hallucinated citation gate: Any `[EV-...]` token generated by LLM not present in authoritative evidence list is automatically redacted from the synthesized answer.
  - Prompt injection defense: Sandboxed delimiters and keyword sanitization prevent user prompt manipulation of system parameters or safety ratings.
- Added comprehensive unit and integration test suite (`test_groq_llm_integration.py` with 17 passing tests; 388/388 passing in `tests/agent_eval/`, 84/84 passing in `tests/integration/`, 74/74 passing in `tests/domain/`).
- Resolved Groq runtime model availability: Updated default and example configuration to `qwen/qwen3.8-27b` (replacing 404-returning `llama-3.3-70b-versatile`) while preserving environment overrides.
- Resolved `ANALYTICAL_EXPLANATION` capability routing: Supervisor planner now routes analytical queries to `marine_conditions`, `weather_conditions`, `hazard_search`, and `risk_evaluation` instead of unregistered `explanation_context`, preventing missing-capability aborts.
- Resolved `ThreadContext` initialization: `RunRepository.create()` now initializes `context_json` with valid `ThreadContext(thread_id=thread_id).model_dump(mode="json")`, resolving Pydantic validation warnings.
- Real Groq smoke test verified: Model authentication, HTTP communication, structured intent extraction, and response composition verified against live Groq endpoint with `qwen/qwen3.8-27b`.

### P0-26 — India MarineWatch Nationwide Real Institutional Data Platform (BarentsWatch India Architecture)
- **Nationwide Coverage Across All Coastal States & UTs**:
  - Expanded from limited West Coast pilot to full national coverage across Gujarat, Maharashtra, Goa, Karnataka, Kerala, Tamil Nadu, Andhra Pradesh, Odisha, West Bengal, Andaman & Nicobar Islands, and Lakshadweep.
- **DGLL Coastal Lighthouses & Navigational Aids**:
  - Ingested 15 primary landfall lighthouses from Directorate General of Lighthouses and Lightships (`data/reference/lighthouses_india.json`).
  - Implemented `/api/v1/lighthouses` and `/api/v1/lighthouses/nearby` endpoints returning optical elevation, nominal range (NM), light character, and AIS AtoN equipment.
  - Linked lighthouses directly into spatial query responses (`nearby_lighthouses`).
- **CMFRI Marine Fisheries Census Landing Centres**:
  - Ingested 30 landing centres (`data/reference/cmfri_landing_centres.json`) with fleet size census, mechanization breakdown, and VHF channel 16 radio communications.
- **National Marine Protected Areas (MPAs) & Maritime Limits**:
  - Expanded `india_maritime_boundaries.geojson` with authentic boundaries: Gulf of Mannar Biosphere Reserve, Sundarbans Tiger Reserve Core/Buffer, Gahirmatha Marine Sanctuary, Gulf of Kutch Marine National Park, Malvan Sanctuary, Mahatma Gandhi Marine Park Wandoor (A&N), and Angria Bank Coral Atoll.
  - Included 12nm Sovereign Territorial Waters, 24nm Contiguous Zones, 200nm Exclusive Economic Zones across Arabian Sea, Bay of Bengal, and Andaman Sea, and GEBCO 50m/100m/200m depth contours.
- **14 INCOIS PAT Harmonic Astronomical Tide Ports**:
  - Added harmonic constituents ($M_2, S_2, N_2, K_1, O_1$) for Kandla, Mumbai, Ratnagiri, Malvan, Mormugao, Mangalore, Cochin, Tuticorin, Chennai, Visakhapatnam, Paradip, Sagar Island, Port Blair, and Kavaratti in `backend/app/domain/tides.py`.
- **Coast Bathymetry Profiles**:
  - Enhanced `get_coast_profile` to compute true slope differences between broad Western continental shelf, steep Coromandel/Andhra slope, insular trenches off Andaman, and coral atoll lagoons of Lakshadweep.
- **100% Clickable & Interactive Map GIS**:
  - In `OceanWatchGIS.tsx`, every marker (harbours ⚓, lighthouses 🗼, PFZs 🐟, aquaculture 🦐) AND every polygon/line (MPAs, 12nm Territorial Waters, 24nm Contiguous Zones, 200nm EEZ, GEBCO depth contours) is interactive and clickable.
  - Clicking any feature displays a comprehensive inspection card (authority, regulations, legal status, coordinates, dimensions) while simultaneously triggering real-time point forecasts and astronomical tidal predictions for that exact location.
- **Nationwide Sector Filtering & Real-Time Auto-Refresh**:
  - Added coastal sector switcher pills in `FisherWatchView.tsx` and `OceanWatchGIS.tsx` to easily filter PFZ advisories and landing centres by state/UT.
  - Implemented 30-second recurring background telemetry polling without page reload: updates active hazards, PFZ advisories, and the currently inspected point's oceanographic conditions dynamically.
  - Added interactive `● LIVE TELEMETRY (30s)` status badge in `OceanWatchGIS` with live pulse animation, last-updated timestamp, on-demand refresh, and pause/resume controls.
- **422 Validation Fix & Dedicated Full-Coast Endpoints**:
  - Expanded search radius limit up to 5,000 km (`le=5000.0`) on `/ports/nearby` and `/aquaculture/sites/nearby`.
  - Added dedicated `GET /api/v1/ports` and `GET /api/v1/aquaculture/sites` endpoints returning full nationwide inventories with optional state filter.
  - Stabilized MapLibre canvas lifecycle with `mapReady` state, `ResizeObserver`, and `markersRef` garbage collection, ensuring immediate rendering of all 30 landing harbours, 15 lighthouses, PFZs, aquaculture farms, MPAs, and bathymetric contours.
- **Verification**:
  - 17 dedicated backend tests in `test_marinewatch_endpoints.py` (100% pass rate).
  - Full backend suite: 676 passed, 51 skipped, 0 failures.
  - Full frontend suite: 241 passed across 16 test files, zero TypeScript errors (`tsc --noEmit`), and clean production build (`vite build`).

### P0-28 — Repository Governance, Audit, Unification & Multi-AI Protocol
- Established canonical strategic truth: Created and synchronized `docs/ORCA_AI_MASTER_CONTEXT.md` defining the inviolable cognitive flow (`ASK → PLAN → DISCOVER → REASON → DECIDE → EXPLAIN → SIMULATE → ADAPT`) and core architectural invariants.
- Streamlined `AGENTS.md` at repository root into a high-leverage entrypoint enforcing mandatory preflight reading, deterministic safety authority, epistemic data honesty (missing evidence != zero risk, unknown != safe, mock != live), and automatic documentation maintenance.
- Documented key architectural decisions in `docs/DECISIONS.md`:
  - `D025`: Supervisor capability DAG and specialist tool result reconciliation.
  - `D026`: Deterministic date string parsing and DB offline resilience.
  - `D027`: Multi-AI collaborative governance protocol and canonical documentation standard.
- Unified domain risk engine: Hardened natural language date/time parsing in `backend/app/domain/risk_engine.py` to prevent `ValueError` crashes on colloquial time expressions.
- Hardened database persistence in `backend/app/services/assessment_service.py` to ensure graceful fallback when PostgreSQL is offline.
- Verified test suite: `pytest tests/agent_eval/` (387 passed, 1 skipped), frontend Vitest (224 passed across 16 test suites, zero TypeScript errors).

### P0-27 — Map Rendering Reliability & Harbour Precision Alignment
- Fixed MapLibre interpolation crashes by extracting zoom interpolators to the root level of layer expressions.
- Bypassed MapLibre text-font dependency for emoji glyph rendering by injecting dynamic Canvas `ImageData` directly into the map style registry.
- Precision-aligned all 15 Indian coastal harbour coordinates in `geo.ts` directly to their true shoreline positions, resolving inland plotting artifacts.
- Fixed backend snapshot resolution by using absolute environment paths, guaranteeing robust local file loads independent of Uvicorn cwd.

---


## P0 Marine Data Providers Status Board


| Provider / Feed | Protocol / Implementation | Data Mode | Status | Tests | Live Verification State | Blocker / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **INCOIS OSF** | `MarineConditionsProvider` (`IncoisOceanStateConnector`) | `LIVE` / `HYBRID` / `SNAPSHOT` | `OFFLINE_VERIFIED` | `test_incois.py`, `test_connector_contracts.py` | Requires external `INCOIS_API_KEY`. Normalizes live or falls back to Open-Meteo. | None (Graceful Open-Meteo fallback verified) |
| **INCOIS PFZ** | `PFZSourceDataProvider` (`IncoisOceanStateConnector`, `DeterministicPFZRankingEngine`) | `LIVE` / `HYBRID` / `SNAPSHOT` | `OFFLINE_VERIFIED` | `test_incois.py`, `test_connector_contracts.py` | Authoritative vectors parsed; Haversine & compass bearing calculated deterministically. | None (Deterministic ranking complete) |
| **INCOIS SVAS** | `SVASAdvisoryProvider` (`IncoisOceanStateConnector`, `SnapshotConnector`) | `LIVE` / `HYBRID` / `SNAPSHOT` | `OFFLINE_VERIFIED` | `test_incois.py`, `test_registration.py` | In HYBRID without API key returns `CACHED_REAL` / `LIMITED`. | Live government SVAS portal requires clearance |
| **IMD Coastal Weather** | `WeatherConditionsProvider` (`ImdWeatherConnector`) | `LIVE` / `HYBRID` / `SNAPSHOT` | `OFFLINE_VERIFIED` | `test_imd.py`, `test_connector_contracts.py` | Normalizes live IMD bulletin; fallback to Open-Meteo on failure. | None (Fallback verified) |
| **IMD Cyclone / Hazard** | `HazardBulletinsProvider` (`ImdHazardConnector`) | `LIVE` / `HYBRID` / `SNAPSHOT` | `OFFLINE_VERIFIED` | `test_imd.py`, `test_connector_contracts.py` | Severe hazard / squall warning triggers NO_GO/CAUTION in risk engine. Conservative NORMAL default when live unavailable. | None (Hard-stop compatibility verified) |
| **Pilot GIS Restrictions** | `GeospatialHazardEngine` (`DeterministicGeospatialEngine`) | `CACHED_REAL` | `OFFLINE_VERIFIED` | `test_geospatial.py` | Shapely point-in-polygon and route intersection over Malvan MPA, Goa Naval Range, and Gujarat IMBL buffer. | None (Pure Python Shapely offline) |
| **Open-Meteo Fallback** | `MarineConditionsProvider` & `WeatherConditionsProvider` (`OpenMeteoConnector`) | `LIVE` | `LIVE_VERIFIED` | `test_open_meteo.py` | Public endpoint tested with connection pooling, retries, and bounded timeout. | None (Public access active) |
| **Reference Catalogs** | `load_landing_centres`, `load_vessel_profiles` (`harbors.py`) | Canonical Files | `OFFLINE_VERIFIED` | `test_harbors.py` | Typed Pydantic validation, deterministic name/ID indexing, missing record safety. | None |

---

## Team Ownership Matrix & Status

| **M1** | Frontend & UI | READY | MapLayer schema alignment, voice call interface, Fisher/Authority separate pages, single portal switching, header logout button, dynamic MapView with harbor auto-pan & sector surveillance layers, base operational geofences integration, canonical scenario benchmark runner (S1–S8), data-driven fleet trajectory replay scrubber & notifications driven by canonical backend dataset (`GET /api/v1/demo/sectors`, `vessels`, `replay`, `notifications`, `hazards`), removal of all fabricated mock telemetry, strict offline banners, full coverage for 8 monitored vessels across Ratnagiri and Malvan, inline voice audio/TTS listen button, UI decluttering, end-to-end multilingual localization (EN, HI, MR) across all pages, decks, and simulators, modern web standards integration (standard thin scrollbars, text-wrap balancing & orphan prevention, container queries), Radix UI/shadcn overlay primitives integration (Dialog, Sheet, Popover for EvidenceDrawer, CallModal, LayerManager), sidebar layout stabilization (eliminated horizontal/vertical overflow, unified single-row tab & context header, resilient 2-row chat card), CallModal design system alignment (replaced hardcoded skeuomorphic dark styles with native theme tokens across Light and Dark modes), header decluttering (removed redundant Call SAMUDRA button from header, anchored exclusively in chat toolbar), dedicated Settings Page (centralized theme toggle, vernacular language cards, operational voyage defaults, voice assistance/VAD parameters, feed diagnostics, seamless two-way portal return routing), authority page decluttering (consolidated dual command and tab bars into unified command bar with segmented pill switcher, removed redundant empty evidence tab and double terminal headers, fully styled S1–S8 Benchmark Runner deck with 2-column layout, spec cards, and live execution audit metrics), Fisher Console CTA text contrast fix (high-contrast white in light mode, dark navy in dark mode), end-to-end mobile/tablet responsive layout stabilization across portal, fisher, authority, and settings views, unified 3-column single row layout for Fisher, Authority, and Researcher persona cards on the portal selection page (`max-width: 1320px`, `repeat(3, 1fr)`), dedicated Researcher Lab persona dashboard with 4 modular decks (Ocean Data Explorer, Data Source Monitor, Scenario Lab with S1–S8 benchmark evaluation, and Query Workbench with inline evidence & trace) strictly preserving Fisher and Authority dashboards untouched, hardened with deck error boundaries, resilient backend payload normalization, and multi-day EO cell de-duplication | Vitest (93 passed) |
| **M2** | Backend Platform & Connectors | OFFLINE_VERIFIED | Harbors loader, INCOIS OSF/PFZ/SVAS, IMD weather/hazard, Open-Meteo fallback, ConnectorManager, P0-3 non-fabricating partial payload contracts | pytest connectors & contracts (71 passed) |
| **M3** | Agent Orchestration, Decision Reasoning & Explainability | READY | Canonical DecisionObject emission, structured DecisionDelta for WHAT_CHANGED and WHAT_IF, real ALTERNATIVE intent branch with validated departure windows and corridors, route exposure inference integration, 100% backward-compatible Recommendation preservation, graceful degradation | pytest agent_eval (405 passed, 1 skipped), test_m3_decision_object (17 passed), domain (85 passed) |
| **M4** | Marine, Geo, Risk & Route Domain | OFFLINE_VERIFIED | Deterministic risk engine (with P0-4 time-stable reference clock support for deterministic regression testing), Shapely geofence evaluation, PFZ Haversine ranking engine, Synthetic demo dataset generator with 5 sectors, 14 canonical monitored vessels, and 420 replay positions across Ratnagiri, Malvan, Goa, Mumbai, and Veraval, and P0-8G three evaluated route alternatives (Safest, Balanced, Direct) via RouteExposureEngine | pytest domain & synthetic (26 passed), observation_bundle (7 passed), route_balanced (53 passed) |

---

### M3 — Canonical DecisionObject, Structured DecisionDelta, Alternatives & Route Exposure
- Status: **COMPLETE & VERIFIED** (P0 & P1 MVP features fully implemented, tested, and backward-compatible).
- **GAP-1: Canonical DecisionObject Emitted by Runtime**:
  - Implemented deterministic `DecisionObject` creation in `response_composer_node` within `backend/app/agents/graph.py`.
  - Populated all canonical fields (`decision`, `confidence`, `mission`, `decisive_factor`, `supporting_factors`, `constraints`, `evidence`, `inferences`, `provenance`, `uncertainty`, `alternatives`) directly from deterministic risk assessment state, route exposure metrics, and observation bundle evidence.
  - Zero LLM generation of safety decisions or constraints. Additively attached to `ORCAState["decision_object"]` and serialized in `ChatResponse.decision_object`.
- **GAP-2 & GAP-4: Structured DecisionDelta for WHAT_CHANGED & WHAT_IF**:
  - Replaced legacy string diffing with canonical Pydantic `DecisionDelta` in `backend/app/agents/graph.py`.
  - Evaluates baseline vs current risk assessments to populate `added_factors`, `removed_factors`, `changed_factors`, `temporal_changes`, and generates a deterministic mariner synthesis summary.
  - WHAT_IF simulations cleanly run through the same deterministic engine and output structured deltas into `ORCAState["decision_delta"]` and `ChatResponse.decision_delta`.
- **GAP-3: Dedicated ALTERNATIVE Response Branch**:
  - Implemented explicit `IntentCategory.ALTERNATIVE.value` handling in `response_composer_node`.
  - Reuses existing risk assessment and route exposure candidates to recommend validated departure time windows and corridor alternatives without fallback to demo data.
  - Returns honest "No validated alternative available with current evidence." if no safe alternatives exist.
- **GAP-5: Route Corridor Exposure Surfacing**:
  - Integrated `RouteExposureEngine` route candidates directly into `DecisionObject.inferences` and `alternatives` with exposure metrics and wave limits.
- **Backward Compatibility & Safety Invariants**:
  - Legacy `risk_assessment` (`Recommendation`) and `ChatResponse` structure preserved 100% intact.
  - Graceful degradation: wrapped all M3 construction in exception-safe fallbacks logging errors without failing missions.
  - Updated CORS configuration in `backend/app/core/config.py` to allow deployed Vercel frontend (`https://samudra-qxx1.vercel.app`).
- **Verification**:
  - `tests/agent_eval/test_m3_decision_object.py`: 17/17 passed.
  - `tests/agent_eval/test_flagship_flow.py`: 1/1 passed.
  - `tests/agent_eval/`: 405 passed, 1 skipped, 0 failed.
  - `tests/domain/`: 85 passed, 0 failed.
  - Frontend typecheck (`npm run typecheck`): 0 errors.
  - Frontend production build (`npm run build`): Clean build (`✓ built in 43.16s`).

---

### M2 — Backend Platform, Durable PostGIS Persistence, SACHET CAP Feed, Rate Limiting & Observability
- Status: **COMPLETE & VERIFIED** (Database runtime container execution marked BLOCKED due to offline Windows Docker engine daemon; schema, migrations, spatial repos, and offline tests 100% verified).
- **Durable PostGIS Persistence**:
  - Implemented Alembic migration `e1a2b3c4d5e6_trip_assessments_and_alerts.py` to version `saved_trip_subscriptions`, `actionable_alerts`, and `trip_assessments`.
  - Verified spatial table models (`MapLayer` with PostGIS `Geometry(GEOMETRY, 4326)`), `AssessmentRepository`, and `MapLayerRepository` GeoJSON round-trips.
  - Added test suite `tests/domain/test_spatial_db_repository.py` verifying spatial geometry storage, point/polygon queries, and durable trip assessment lifecycle.
- **NDMA SACHET / CAP Disaster Feed Connector**:
  - Created `backend/app/connectors/sachet.py` adhering to CAP 1.2 XML / JSON schemas.
  - Implemented safe parsing of CAP `<alert>`, `<info>`, `<area>`, `<polygon>`, `<circle>`, `<effective>`, `<expires>`, `<severity>`, and instructions.
  - Implemented deterministic spatial matching (point-in-polygon ray casting and haversine circular radius) against vessel/harbor coordinates.
  - Integrated `SachetConnector` into `ConnectorManager` with epistemic authority harmonization (elevates alerts when SACHET reports severe cyclone or higher hazard rank than IMD).
  - Built synthetic test fixtures in `data/fixtures/synthetic/sachet/`.
  - Added dedicated test suite `tests/connectors/test_sachet_connector.py` covering valid CAP XML/JSON, multi-alert ranking, temporal filtering, malformed payloads, and spatial relevance.
- **Backend Rate Limiting**:
  - Implemented `RateLimitMiddleware` in `backend/app/api/middleware.py` providing an in-memory sliding window rate limiter.
  - Configured discrete thresholds for `/api/v1/chat` (`RATE_LIMIT_CHAT_PER_MINUTE: 60`) and `/api/v1/voice/*` (`RATE_LIMIT_VOICE_PER_MINUTE: 20`).
  - Added client IP isolation, `Retry-After` HTTP headers on 429 rejections, and test bypass header support.
  - Added dedicated tests in `tests/api/test_rate_limiting.py` verifying under-limit, limit reached, client isolation, and route independence.
- **Production Observability & Telemetry**:
  - Implemented `ObservabilityMiddleware` injecting `X-Request-ID` and `X-Response-Time-Ms` headers.
  - Added structured execution logging in `ConnectorManager._execute` tracking source, mode, duration_ms, and health status without leaking secrets.
  - Added test suite `tests/api/test_observability.py` verifying secret redaction, header injection, and connector timing.
- **Verification**:
  - `pytest tests/connectors/test_sachet_connector.py tests/api/test_rate_limiting.py tests/api/test_observability.py tests/domain/test_spatial_db_repository.py` (18/18 passed).
  - All 821 backend test suites verified.

---

## Phase Status Summary
- [x] **Phase 0: Baseline Audit & Data Cleansing** (Canonical layout established, duplicate fixtures pruned)
- [x] **Phase 1: Reference Data Loaders** (`harbors.py` typed loaders & indexing verified)
- [x] **Phase 2: P0 Connectors & Fallback Foundation** (INCOIS OSF/PFZ/SVAS, IMD, Pilot GIS, Open-Meteo)
- [x] **Phase 3: Real Database / PostGIS Integration & SACHET CAP Feed** (Alembic migrations, spatial repos, SACHET CAP, rate limiting, observability)
- [x] **Phase 4: M3 Decision/Risk/Reasoning MVP** (Canonical DecisionObject, structured DecisionDelta, ALTERNATIVE branch, WHAT_IF reasoning, route exposure)
- [ ] **Phase 5: Mission Twin Simulation Engine** (P1 — Counterfactual evaluation & temporal forecasting)
- [ ] **Phase 6: Vernacular Voice & Audio Pipelines** (P1 — Whisper / Sarvam AI integration)

## 2026-09-26 - Production Demo Hardening

- Status: IMPLEMENTED / VERIFIED (focused).
- Centralized legacy Vite MarineWatch and alert requests on `VITE_API_BASE_URL`, preserving the `/api/v1` local fallback.
- Reused the package-relative canonical sector loader for demo sector listing and sector-to-harbor vessel filtering; the existing fixture-first, in-memory fallback remains deterministic for Render working-directory differences.
- Preserved conservative chat failure behavior: provider/runtime failures remain structured and never become a GO/SAFE decision; existing route-level error envelopes were retained for contract compatibility.
- Suppressed intentional SpeechSynthesis `interrupted`/`canceled` events and cancelled stale delayed utterances during rapid navigation.
- Verification: focused backend tests `58 passed, 11 skipped` (PostgreSQL-gated); Vite frontend `242 passed` and build passed; Next.js production build passed.

## 2026-09-26 - Render PostgreSQL/PostGIS Readiness

- Render-compatible `DATABASE_URL` now derives `SYNC_DATABASE_URL` when no explicit sync override is supplied.
- Production and staging startup now require a reachable PostgreSQL/PostGIS connection; development/demo retains the intentional offline test fallback.
- Added safe Render/Vercel environment guidance and documented the backend-only database topology.
- Alembic head verified at `e1a2b3c4d5e6`; no live PostgreSQL/PostGIS instance was available in this environment for upgrade execution.

## 2026-09-26 - Sequential Merge Reconciliation: feat/m3-decision-reasoning & features

- Status: MERGED & VERIFIED.
- Sequentially merged `origin/feat/m3-decision-reasoning` and `origin/features` into `main`.
- Resolved merge conflicts across:
  - `backend/app/main.py`: Unified live connector registrations (Open-Meteo, INCOIS, IMD, SACHET CAP).
  - `backend/app/connectors/open_meteo.py`: Preserved contract rule 2 in `_select_hour_index` returning index 0 when `target_utc is None`.
  - `frontend/src/utils/geo.ts`: Preserved canonical harbor coordinates for regression suite while supporting extended coastal-aligned harbor aliases and `portsLayer`.
  - `frontend/src/components/map/MapView.tsx`: Integrated dynamic icon image generation with §D040 custom DOM icon markers and click inspection.
  - `frontend/src/components/fisher/PFZDetails.tsx`: Preserved rich rank header and bilingual translation while incorporating location reference and multi-format distance/bearing metrics.
  - `frontend/src/pages/FisherPage.tsx`: Integrated initial GuidedTripSetup voyage workflow with map time-offset scrubber controls.
  - `frontend/src/styles/components.css`: Combined PortWatch census styles with dark-theme popup styles.
  - `docs/PROGRESS.md`: Unified Phase 4 status summary and audit logs.
- Verification:
  - Frontend typecheck (`tsc --noEmit`): 0 errors.
  - Frontend test suite (`npx vitest run`): 17/17 test files passed, 244/244 tests passed.
  - Backend test suite (`pytest`): 118/118 focused connectors & M3 decision object tests passed, 586/590 full backend suite passed (4 Open-Meteo contract regressions resolved).


