# ORCA / SAMUDRA Operational Progress

> Single operational status board. Strictly factual. No diary narrative.

## Current Release & Workstream State
- Current version: `v0.1.0-p0-data-foundation`
- Active branch: `main`
- Current milestone: **P0 Marine Data & API Integration Foundation**
- Completion status: **COMPLETE & OFFLINE VERIFIED**

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
| **M3** | Agent Orchestration & Explainability | OFFLINE_VERIFIED | Tool adapters, capability catalog registration, trace & evidence contracts, P0-2 Benchmark Runner runtime state isolation, P0-3 robust partial payload extraction in specialist_tools_node & conftest contract mock isolation | pytest scenario & isolation (30 passed), agent_eval (47 passed), domain (25 passed) |
| **M4** | Marine, Geo, Risk & Route Domain | OFFLINE_VERIFIED | Deterministic risk engine (with P0-4 time-stable reference clock support for deterministic regression testing), Shapely geofence evaluation, PFZ Haversine ranking engine, Synthetic demo dataset generator with 5 sectors, 14 canonical monitored vessels, and 420 replay positions across Ratnagiri, Malvan, Goa, Mumbai, and Veraval, and P0-8G three evaluated route alternatives (Safest, Balanced, Direct) via RouteExposureEngine | pytest domain & synthetic (26 passed), observation_bundle (7 passed), route_balanced (53 passed) |

---

## Phase Status Summary
- [x] **Phase 0: Baseline Audit & Data Cleansing** (Canonical layout established, duplicate fixtures pruned)
- [x] **Phase 1: Reference Data Loaders** (`harbors.py` typed loaders & indexing verified)
- [x] **Phase 2: P0 Connectors & Fallback Foundation** (INCOIS OSF/PFZ/SVAS, IMD, Pilot GIS, Open-Meteo)
- [ ] **Phase 3: Real Database / PostGIS Integration** (Docker PostgreSQL/PostGIS container deployment)
- [ ] **Phase 4: Mission Twin Simulation Engine** (P1 — Counterfactual evaluation & temporal forecasting)
- [ ] **Phase 5: Vernacular Voice & Audio Pipelines** (P1 — Whisper / Sarvam AI integration)
