# ORCA Synthetic Demo Data Seeding Foundation

## 1. Overview & Purpose

ORCA is an AI-powered maritime decision support copilot for artisanal and motorized fishing communities along the Indian coastline.

In prototype and offline development modes (`DATA_MODE=SYNTHETIC`), ORCA utilizes a deterministic, highly realistic synthetic dataset (`ORCA_DEMO_V1`) seeded into the backend datastore. This eliminates any dependency on live external provider APIs, private API keys, or unpredictable real-time network states during development, demonstrations, and automated testing.

Crucially, rather than inventing ad-hoc frontend dummy data, ORCA uses a **3-tier data architecture** based directly on **official Indian marine and meteorological data provider schemas**.

---

## 2. 3-Tier Provider-Faithful Architecture

The data pipeline flows through three distinct layers:

```
+-------------------------------------------------------------------------------+
| 1. OFFICIAL SOURCE SCHEMA & SYNTHETIC FIXTURE GENERATION                     |
|    - INCOIS Ocean State Forecast & PFZ advisories                            |
|    - IMD Coastal & Marine Weather bulletins / Hazard warnings                |
|    - MOSDAC / ISRO Satellite Earth Observation grids (SST, Chlorophyll)       |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| 2. SOURCE ADAPTERS & NORMALIZERS                                             |
|    - IncoisOSFNormalizer / IncoisPFZNormalizer                               |
|    - ImdWeatherNormalizer / ImdHazardNormalizer                              |
|    - MosdacEONormalizer                                                      |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| 3. ORCA INTERNAL CANONICAL REPOSITORIES & DOMAIN SERVICES                 |
|    - SyntheticDemoRepository / DataService                                   |
|    - LangGraph ORCA Agent Tools & Safety Rules                                |
|    - REST Endpoints (/api/v1/demo/*) & Frontend UI (Mapbox, Cards)           |
+-------------------------------------------------------------------------------+
```

---

## 3. Official Provider Schemas & Field Mappings

| Provider | Official Service / Document | Source Field Format | Normalized ORCA Metric |
| :--- | :--- | :--- | :--- |
| **INCOIS** | Ocean State Forecast (OSF) | `WND_SPD_KTS`, `WND_DIR_DEG`, `MAX_WND_GUST_KTS` | `wind_speed_knots`, `wind_direction_deg`, `wind_gust_knots` |
| **INCOIS** | Ocean State Forecast (OSF) | `SIG_WAVE_HT_M`, `WAVE_PRD_SEC` | `wave_height_m`, `wave_period_sec` |
| **INCOIS** | Ocean State Forecast (OSF) | `SURF_CURR_SPD_KTS`, `SURF_CURR_DIR_DEG` | `current_speed_knots`, `current_direction_deg` |
| **INCOIS** | Ocean State Forecast (OSF) | `TIDE_HT_M`, `TIDE_PHASE`, `TIDE_DATUM` | `tide_level_m`, `tide_phase`, `tide_datum` |
| **INCOIS** | Potential Fishing Zone (PFZ) | `SECTOR_LAT`, `SECTOR_LON`, `VALID_UPTO`, `REMARKS` | `latitude`, `longitude`, `valid_to`, `confidence` |
| **IMD** | Marine Weather Bulletin | `WIND_DIR_DEG`, `WIND_SPEED_KT`, `WEATHER_CODE` | `wind_speed_knots`, `sea_surface_temp_c` |
| **IMD** | Hazard / Cyclone Warning | `BULLETIN_NO`, `SEVERITY`, `WARNING_TEXT`, `GEOM` | `DemoHazardEvent` (`severity`, `status`, `geometry`) |
| **MOSDAC** | OceanSat / INSAT Products | `SST_KELVIN` (converted to °C), `CHLOR_A_MG_M3` | `sst_c`, `chlorophyll_mg_m3`, `cloud_fraction` |

---

## 4. Dataset Composition (`ORCA_DEMO_V1`)

The dataset comprises **1,122 deterministic records** spanning **15 relational models**:

| Model | Table Name | Count | Key Features |
| :--- | :--- | :---: | :--- |
| `DemoStakeholder` | `demo_stakeholders` | 5 | Multi-role personas (`fisher`, `harbor_master`, `coast_guard`, `fleet_operator`, `admin`) |
| `DemoHarbor` | `demo_harbors` | 5 | Ratnagiri, Mumbai Coastal, Malvan, Kochi, and Goa demo harbors |
| `DemoFisher` | `demo_fishers` | 8 | Preferred languages (English, Hindi, Marathi), craft profiles |
| `DemoVessel` | `demo_vessels` | 14 | Trawlers, motorized fiberglass boats, traditional canoes |
| `DemoTrip` | `demo_trips` | 18 | Planned, active, and completed fishing voyages |
| `DemoMarineObservation`| `demo_marine_observations`| 194 | 97 hourly slots per harbor across -24h/+72h |
| `DemoEOGridCell` | `demo_eo_grid_cells` | 350 | 25 spatial cells across 14 daily time slices (SST & Chlorophyll) |
| `DemoPFZCandidate` | `demo_pfz_candidates` | 12 | Valid, expired, and out-of-radius test candidates with confidence tags |
| `DemoGeofence` | `demo_geofences` | 5 | Naval firing range, Malvan Marine Sanctuary, security zone, shallow reef, operational area |
| `DemoRouteNode` | `demo_route_nodes` | 24 | Water-only safe navigation waypoints |
| `DemoRouteEdge` | `demo_route_edges` | 32 | Navigable topological sea lanes with hazard exposure weights |
| `DemoHazardEvent` | `demo_hazard_events` | 10 | Squall alerts, gale warnings, high swell advisories, thunderstorms |
| `DemoNotification` | `demo_notifications` | 20 | Role-linked safety alerts and trip status notifications |
| `DemoVesselReplayPosition` | `demo_vessel_replay_positions` | 420 | Timestamped GPS replay positions |

**Total Records:** `1,122`

---

## 5. Quality & Edge Cases Represented

The synthetic dataset specifically embeds realistic real-world data quality anomalies so that safety filters, warning badges, and agent reasoning can be verified:

1. **Missing Data is NOT Zero (`missing ≠ 0`)**:
   - Sentinel `-999.0` or `null` values represent unrecorded sensors (e.g. absent gust sensors). Missing metrics remain `None` and are never coerced to zero.
2. **Stale Data is NOT Current (`stale ≠ current`)**:
   - `DemoMarineObservation` contains records where `is_stale=True` (e.g. observation timestamp > 6 hours older than `REFERENCE_TIME`).
3. **Degraded Quality Flags (`qc_status = "DEGRADED"`)**:
   - Observations during heavy cloud cover or buoy drift are flagged as `DEGRADED` or `CLOUD_OBSCURED`.
4. **Expired & Distant PFZ Advisories**:
   - PFZ candidates include expired advisories (`valid_to < REFERENCE_TIME`) and advisories beyond operational craft range (> 50 km) to test filtering rules.
5. **Active vs Expired Marine Hazards**:
   - Hazard events include active severe weather polygons and closed/expired bulletins.

---

## 6. Seeding CLI Script

The database can be seeded or reset at any time using `scripts/seed_demo.py`:

```bash
# Display summary without modifying the database
python scripts/seed_demo.py --dry-run

# Seed the database (idempotent upsert)
python scripts/seed_demo.py

# Cleanly purge existing records in the target namespace before seeding
python scripts/seed_demo.py --reset

# Run with detailed debug output
python scripts/seed_demo.py --verbose --reset

# Seed into a custom namespace
python scripts/seed_demo.py --namespace CUSTOM_TEST_RUN
```

---

## 7. REST Endpoints (`/api/v1/demo/*`)

The backend exposes read-only endpoints to inspect seeded demo entities:

- `GET /api/v1/demo/manifest` — Complete dataset manifest and quality metadata
- `GET /api/v1/demo/stakeholders` — List all stakeholders
- `GET /api/v1/demo/harbors` — List all harbors
- `GET /api/v1/demo/fishers` — List all fishers
- `GET /api/v1/demo/vessels` — List all vessels
- `GET /api/v1/demo/trips` — List all fishing trips
- `GET /api/v1/demo/marine-observations?harbor_id=harbor-ratnagiri` — Hourly observations
- `GET /api/v1/demo/eo-grid-cells?cell_id=cell-0-0` — Satellite EO grid cells
- `GET /api/v1/demo/pfz-candidates?valid_only=true` — PFZ candidates
- `GET /api/v1/demo/geofences` — Restricted maritime zones and sanctuaries
- `GET /api/v1/demo/routes` — Navigable route nodes and edges
- `GET /api/v1/demo/hazards?status=ACTIVE` — Marine hazard advisories
- `GET /api/v1/demo/notifications?role=fisher` — Multi-role safety notifications
- `GET /api/v1/demo/vessels/vessel-01/replay` — Recorded vessel GPS track

---

## 8. Exported Source Fixtures

Source-partitioned JSON fixtures are stored on disk under `data/fixtures/synthetic/`:
- `data/fixtures/synthetic/incois/`
- `data/fixtures/synthetic/imd/`
- `data/fixtures/synthetic/mosdac/`
- `data/fixtures/synthetic/orca/`
- `data/fixtures/synthetic/manifest.json`

To regenerate all JSON fixture files:
```bash
python -m backend.app.domain.synthetic.dump_fixtures
```
