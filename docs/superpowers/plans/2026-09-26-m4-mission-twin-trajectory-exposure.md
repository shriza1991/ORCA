# M4 Mission Twin & Dynamic Trajectory Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining M4/P4 Domain & GIS responsibilities by implementing the Dynamic Trajectory Exposure Engine, Time-Dependent A* Current Vector Routing, Temporal Departure Window Scanner (+48h forecast envelope), and Proactive Trajectory Geofence Monitoring.

**Architecture:** Extend SAMUDRA's deterministic Python domain stack (`backend/app/domain/`) with waypoint timeline interpolation, current-vector edge weighting in `MarinePathfinder`, hourly forecast exposure analysis, and proactive boundary lookaheads. Pure Python deterministic algorithms with zero LLM hallucination in safety and navigation loops.

**Tech Stack:** Python 3.12, Shapely, Pydantic v2, pytest.

**Spec:** `docs/ORCA_AI_MASTER_CONTEXT.md` §11 (Trajectory Exposure), §12–13 (Temporal Validity & Route Reasoning), §16 (Boundary Triggers), §20 (Time-Dependent Routing), §34 (P4 Scope), `docs/PROGRESS.md` Phase 5.

## Global Constraints
- Pure Python deterministic domain calculations; no LLM evaluation of navigation, boundaries, or risk.
- 100% backward-compatible schemas in `backend/app/agents/integrations/dev4.py`.
- Epistemic data honesty: missing forecast hours or current feeds must be explicitly recorded in `missing_data_state` rather than silently fabricated.
- All existing tests must continue to pass; new tests must achieve 100% pass rate.

---

### Task 1: Contract Extensions in Dev 4 Interfaces

**Files:**
- Modify: `backend/app/agents/integrations/dev4.py`
- Test: `tests/domain/test_route_engine.py`

**Interfaces:**
- Consumes: Existing `EvaluatedRouteItem`, `RouteExposurePayload`, `GeospatialHazardPayload`.
- Produces: Extended `EvaluatedRouteItem` with `waypoint_timeline`, `current_adjusted`; extended `RouteExposurePayload` with `departure_windows`, `optimal_departure_recommendation`; extended `GeospatialHazardPayload` with `time_to_cross_hours`, `projected_intersection`.

- [ ] **Step 1: Write tests verifying new contract schemas serialize and maintain backward compatibility**
- [ ] **Step 2: Add extended fields to `EvaluatedRouteItem`, `RouteExposurePayload`, `GeospatialHazardPayload` in `dev4.py`**
- [ ] **Step 3: Run existing route tests to verify 0 regressions**

---

### Task 2: Dynamic Trajectory Exposure Engine (Waypoint ETA x Hourly Marine Conditions)

**Files:**
- Create: `backend/app/domain/trajectory_exposure.py`
- Modify: `backend/app/domain/route_engine.py`
- Test: `tests/domain/test_trajectory_exposure.py`

**Interfaces:**
- Consumes: Route waypoints `List[List[float]]`, vessel craft profile `str`, departure time `datetime`, hourly marine forecast series `List[MarineConditionsPayload]`.
- Produces: `TrajectoryExposureResult` containing:
  - `waypoint_timeline`: `List[WaypointTimePoint]` with `[lon, lat]`, `eta_hours`, `eta_iso`, `wave_height_m`, `wind_knots`, `exposure_score`.
  - `peak_wave_height_m`: maximum wave height encountered along the actual journey timeline.
  - `peak_exposure_waypoint`: coordinates and time offset of highest risk point.
  - `integrated_exposure_score`: composite exposure score.

- [ ] **Step 1: Write failing unit test `tests/domain/test_trajectory_exposure.py`**
- [ ] **Step 2: Implement `TrajectoryExposureEngine` in `backend/app/domain/trajectory_exposure.py`**
- [ ] **Step 3: Integrate trajectory exposure into `DeterministicRouteExposureEngine.evaluate_routes` in `backend/app/domain/route_engine.py`**
- [ ] **Step 4: Run pytest on `test_trajectory_exposure.py` and verify all tests pass**

---

### Task 3: Time-Dependent Marine Routing with Ocean Current Vectors

**Files:**
- Modify: `backend/app/domain/marine_routing.py`
- Test: `tests/domain/test_marine_routing_currents.py`

**Interfaces:**
- Consumes: `MarinePathfinder.find_path`, with optional `current_vector_fn: Callable[[float, float], Tuple[float, float]]` (u_knots, v_knots).
- Produces: A* optimal path that minimizes travel time and fuel consumption by favoring favorable current streams and avoiding strong opposing currents while remaining strictly seaward.

- [ ] **Step 1: Write failing test in `tests/domain/test_marine_routing_currents.py` testing current vector effect**
- [ ] **Step 2: Implement current vector velocity adjustment in `MarinePathfinder` A* edge cost**
- [ ] **Step 3: Run pytest on `test_marine_routing_currents.py` and verify passing**

---

### Task 4: Temporal Departure Window Optimization (+48h Envelope)

**Files:**
- Create: `backend/app/domain/departure_window.py`
- Modify: `backend/app/domain/route_engine.py`
- Test: `tests/domain/test_departure_window.py`

**Interfaces:**
- Consumes: Origin harbor, destination, craft profile, earliest departure datetime, hourly marine forecasts (up to 48h).
- Produces: `List[DepartureWindowCandidate]` evaluated for GO/CAUTION/NO_GO, plus `optimal_window`: recommends delaying or advancing departure if doing so turns a NO_GO/CAUTION into a safe GO.

- [ ] **Step 1: Write failing test in `tests/domain/test_departure_window.py`**
- [ ] **Step 2: Implement `DepartureWindowEvaluator` in `backend/app/domain/departure_window.py`**
- [ ] **Step 3: Wire into `DeterministicRouteExposureEngine`**
- [ ] **Step 4: Run pytest and verify passing**

---

### Task 5: Proactive Trajectory Geofence & Boundary Monitoring

**Files:**
- Modify: `backend/app/domain/geo_restrictions.py`
- Test: `tests/domain/test_proactive_geofence.py`

**Interfaces:**
- Consumes: Vessel position `[lon, lat]`, speed in knots, heading in degrees, lookahead duration in hours (default 2.0h).
- Produces: `GeospatialHazardPayload` with `projected_intersection: bool`, `time_to_cross_hours: Optional[float]`, `restriction_name: Optional[str]`.

- [ ] **Step 1: Write failing test in `tests/domain/test_proactive_geofence.py`**
- [ ] **Step 2: Implement `check_projected_trajectory_hazards` in `DeterministicGeospatialEngine`**
- [ ] **Step 3: Run pytest and verify passing**

---

### Task 6: Full Verification & Documentation

**Files:**
- Update: `docs/PROGRESS.md`
- Update: `docs/DECISIONS.md`
- Verification: Run all backend tests, all agent eval tests, and frontend tests.
