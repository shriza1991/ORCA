# ORCA — Canonical Marine, Weather, Hazard & PFZ Data Contracts

**Classification**: Architecture Specification & Data Dictionary  
**Milestone**: M2–M15 Normalization Standard  
**Problem Statement**: SIH 2026 PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents

---

## 1. Architectural Normalization Pattern

ORCA strictly isolates external data provider schemas (INCOIS, IMD, MOSDAC, Open-Meteo) from the downstream cognitive and rendering layers.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   EXTERNAL PROVIDERS & CONNECTORS                      │
│      INCOIS OSF / PFZ  │  IMD Weather / Hazards  │  Open-Meteo         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Provider Schemas)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    ADAPTER & NORMALIZATION LAYER                       │
│  - Formulates typed ToolResult & EvidenceItem collections              │
│  - Assigns ISO-8601 UTC timestamps, source URLs, and quality badges    │
│  - Converts physical measurements to standard SI/nautical units        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Normalized Domain Models)
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ AGENT STATE     │        │ RISK & DOMAIN   │        │ FRONTEND UX     │
│ (ORCAState)     │        │ ENGINES         │        │ (React + TS)    │
│                 │        │                 │        │                 │
│ - Task Planning │        │ - Risk Matrix   │        │ - Chat & Advice │
│ - Evidence Gate │        │ - Geodesic PFZ  │        │ - Vector Maps   │
│ - Multi-turn    │        │ - Geofencing    │        │ - Evidence Card │
└─────────────────┘        └─────────────────┘        └─────────────────┘
```

### Core Invariants:

1. **No Provider Leaks into Prompts or Calculations**: Agents and risk engines never parse raw vendor HTML/JSON structures.
2. **Standard Units**:
   - Waves / Swell / Elevation: **meters ($m$)**
   - Wind Speed / Current Velocity: **knots ($kn$)**
   - Distance: **nautical miles ($nm$)** or **kilometers ($km$)**
   - Coordinates: **EPSG:4326 ($[lon, lat]$)**
   - Timestamps: **ISO-8601 UTC ($YYYY-MM-DDTHH:MM:SSZ$)**
3. **Evidence-First Provenance**: Every numerical assertion in the agent answer must link back to an `EvidenceItem` with valid source metadata.

---

## 2. Domain Data Contracts

### 2.0 Unified assessment forecast

The Fisher assessment response is the single observation snapshot for weather,
marine, tide, map telemetry, route cards, and deterministic What-If evaluation.
Open-Meteo marine data may provide `sea_surface_temperature` and
`sea_level_height_msl`; tide direction is derived from consecutive hourly
values and is labelled estimated. Open-Meteo weather `visibility` is normalized
to kilometers. Forecasts used for a mission must cover the complete return
window; otherwise the deterministic engine cannot return `GO`.

### 2.1 Marine Conditions (`marine_conditions`)

_Issuing Authorities_: INCOIS (Ocean State Forecast), Open-Meteo Marine (Fallback)

```python
class MarineConditionsPayload(BaseModel):
    harbor: str                              # Target coastal station or landing center
    significant_wave_height_m: float         # Significant wave height (SWH) in meters (>= 0.0)
    swell_height_m: Optional[float]          # Swell height in meters (>= 0.0)
    swell_period_sec: Optional[float]        # Swell period in seconds (>= 0.0)
    surface_current_knots: Optional[float]   # Surface current speed in knots
    sea_surface_temp_c: Optional[float]      # Sea surface temperature (SST) in °C
    tide_level_m: Optional[float]             # Tide height in meters above the source datum
    tide_phase: Optional[str]                 # FLOOD, EBB, HIGH, LOW when supplied
    observed_at: str                         # Measurement observation timestamp (ISO-8601 UTC)
    valid_to: str                            # Forecast validity expiration (ISO-8601 UTC)
    source_name: str                         # "INCOIS Ocean State Forecast"
    source_url: Optional[str]                # Official bulletin URL
```

Demo/SYNTHETIC payloads retain explicit demo source names and must not carry an institutional live-feed URL as their provenance URL. Tide values are passed through only when present in the same canonical marine record.

#### Normalized Metric Mapping (`EvidenceItem`):

- `metric_name="significant_wave_height"`, `metric_unit="meters"`
- `metric_name="swell_period_sec"`, `metric_unit="seconds"`
- `metric_name="sea_surface_temp_c"`, `metric_unit="celsius"`

---

### 2.2 Weather Conditions (`weather_conditions`)

_Issuing Authorities_: India Meteorological Department (IMD)

```python
class WeatherConditionsPayload(BaseModel):
    harbor: str                              # Monitored coastal station
    wind_speed_knots: float                  # Sustained wind speed in knots (>= 0.0)
    wind_gust_knots: Optional[float]         # Peak wind gust in knots (>= 0.0)
    wind_direction_deg: Optional[float]      # Compass direction (0.0 to 360.0 degrees)
    visibility_km: Optional[float]           # Horizontal visibility in kilometers
    observed_at: str                         # Observation timestamp (ISO-8601 UTC)
    valid_to: str                            # Forecast expiration (ISO-8601 UTC)
    source_name: str                         # "IMD Coastal Weather Bulletin"
    source_url: Optional[str]                # Official bulletin URL
```

#### Normalized Metric Mapping (`EvidenceItem`):

- `metric_name="wind_speed_knots"`, `metric_unit="knots"`
- `metric_name="wind_gust_knots"`, `metric_unit="knots"`
- `metric_name="visibility_km"`, `metric_unit="kilometers"`

---

### 2.3 Severe Weather & Hazards (`hazard_search` & `geospatial_hazard`)

_Issuing Authorities_: IMD Cyclone Warning Division, Naval Maritime Authorities

#### A. Atmospheric Hazard Bulletin (`HazardBulletinPayload`)

```python
class HazardBulletinPayload(BaseModel):
    harbor: str                              # Monitored coastal sector
    cyclone_warning_active: bool             # Active cyclone or deep depression flag
    squall_alert: bool                       # Active gale / squall warning flag
    bulletin_id: Optional[str]               # Official warning bulletin ID (e.g., "IMD-BOB-04")
    severity: str                            # "NORMAL" | "WATCH" | "ALERT" | "WARNING" | "SEVERE"
    headline: Optional[str]                  # Warning summary headline
    valid_from: str                          # Advisory start timestamp (ISO-8601 UTC)
    valid_to: str                            # Advisory expiration timestamp (ISO-8601 UTC)
    source_name: str                         # "IMD Cyclone Warning Division"
    source_url: Optional[str]
```

#### B. Geospatial Boundary & Geofencing (`GeospatialHazardPayload`)

```python
class GeospatialHazardPayload(BaseModel):
    intersected: bool                        # True if coordinates intersect restricted polygon
    restriction_name: Optional[str]          # Polygon label (e.g., "Naval Firing Range Foxtrot")
    restriction_type: Optional[str]          # "NAVAL_RANGE" | "MPA" | "SHALLOW_REEF" | "IMBL"
    distance_to_boundary_km: Optional[float] # Distance to boundary perimeter
    hard_stop: bool                          # True triggers unconditional NO_GO
    restricted: bool                         # True triggers CAUTION advisory
```

---

### 2.4 Potential Fishing Zones (`pfz_search`)

_Issuing Authorities_: INCOIS PFZ Mission / ISRO Oceansat

#### A. Raw Satellite Feature Payload (`PFZSourceDataPayload`)

```python
class PFZSourceDataPayload(BaseModel):
    features: List[Dict[str, Any]]           # Raw GeoJSON features with SST gradients & chlorophyll
    bulletin_date: str                       # Advisory publication date (ISO-8601 UTC)
    valid_to: str                            # Forecast window validity (ISO-8601 UTC)
    source_name: str                         # "INCOIS PFZ Mission"
    source_url: Optional[str]
```

#### B. Geodesically Ranked PFZ Payload (`PFZRankingPayload`)

```python
class PFZCandidatePayload(BaseModel):
    candidate_id: str                        # "PFZ-RAT-01"
    latitude: float                          # Decimal degrees (EPSG:4326)
    longitude: float                         # Decimal degrees (EPSG:4326)
    distance_nautical_miles: float           # Geodesic great-circle distance
    bearing_degrees: float                   # Navigation compass bearing (0-360°)
    water_depth_m: Optional[float]           # Bathymetric depth
    sea_surface_temp_c: Optional[float]      # Temperature at front
    chlorophyll_mg_m3: Optional[float]       # Ocean chlorophyll density
    rank: int                                # 1-indexed proximity & productivity score

class PFZRankingPayload(BaseModel):
    origin_harbor: str
    total_candidates: int
    ranked_candidates: List[PFZCandidatePayload]
```

---

### 2.5 Vessel Safety Advisory Services (`svas_advisory`)

_Issuing Authorities_: INCOIS SVAS (Small Vessel Advisory Services)

```python
class SVASAdvisoryPayload(BaseModel):
    harbor: str                              # Target coastal station or harbor
    craft_profile: str                       # traditional_non_motorized | motorized_boat | mechanized_trawler
    advisory_status: str                     # "SAFE" | "CAUTION" | "DANGER" | "NO_SAILING"
    safety_index: Optional[float]            # Dimensionless composite risk index (0.0 - 10.0)
    capsizing_risk: Optional[str]            # "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH"
    warning_statement: str                   # Official vernacular-ready safety advisory
    issued_at: str                           # Advisory release timestamp (ISO-8601 UTC)
    valid_to: str                            # Advisory expiration timestamp (ISO-8601 UTC)
    source_name: str = "INCOIS SVAS"         # Official issuing authority
    source_url: Optional[str]
```

---

### 2.6 Disaster Alerts & Emergency Bulletins (`disaster_alert`)

_Issuing Authorities_: NDMA SACHET / CAP (Common Alerting Protocol), IMD

```python
class DisasterAlertPayload(BaseModel):
    alert_id: str                            # SACHET CAP identifier
    category: str                            # "MET" (Meteorological), "SAFETY", "RESCUE"
    urgency: str                             # "Immediate" | "Expected" | "Future"
    severity: str                            # "Extreme" | "Severe" | "Moderate" | "Minor"
    certainty: str                           # "Observed" | "Likely" | "Possible"
    event_headline: str                      # Warning headline (e.g., "Very Severe Cyclonic Storm Warning")
    instruction: Optional[str]               # Prescribed emergency action
    area_description: str                    # Target coastal districts or marine sectors
    polygon_coordinates: Optional[List[List[float]]] # Boundary perimeter if available
    effective_from: str                      # ISO-8601 UTC
    expires_at: str                          # ISO-8601 UTC
    source_name: str = "NDMA SACHET / CAP"   # Alert authority
    source_url: Optional[str]
```

---

### 2.7 Canonical Reference Datasets (`reference_data`)

_Issuing Authorities_: State Fisheries Departments, CMFRI, MoEFCC, Indian Navy

#### A. Landing Centre Reference (`LandingCentreRecord`)

```python
class LandingCentreRecord(BaseModel):
    id: str                                  # "HARB-RAT-01"
    name: str                                # "Ratnagiri"
    state: str                               # "Maharashtra"
    latitude: float                          # 16.99
    longitude: float                         # 73.28
    source: str                              # "Department of Fisheries"
    updated_at: str                          # ISO-8601 UTC
```

#### B. Vessel Safety Profile Reference (`VesselProfileRecord`)

```python
class VesselLimits(BaseModel):
    wave_caution_m: float
    wave_nogo_m: float
    wind_caution_knots: float
    wind_nogo_knots: float
    gust_caution_knots: float
    gust_nogo_knots: float
    swell_caution_m: float
    swell_nogo_m: float

class VesselProfileRecord(BaseModel):
    profile_id: str                          # "motorized_boat"
    category: str                            # "FRP Motorized Fishing Boat"
    length_overall_m: float                  # 9.5
    beam_m: float                            # 2.1
    draft_m: float                           # 0.9
    engine_type: str                         # "Outboard Motor"
    operational_range_nm: float              # 25.0
    max_crew: int                            # 6
    safety_limits: VesselLimits
    source: str                              # "INCOIS SVAS / CMFRI"
    version: str                             # "2026.1"
```

---

## 3. Downstream Consumption Contract Matrix

| Consumer Tier                               | Consumed Models                                                                | Guarantees & Constraints                                                                             |
| :------------------------------------------ | :----------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **Deterministic Risk Engine** (`domain/`)   | `MarineConditionsPayload`, `WeatherConditionsPayload`, `HazardBulletinPayload` | Mathematical comparisons against vessel ceilings (`motorized_boat`, etc.). **Zero LLM involvement.** |
| **Agent StateGraph** (`agents/graph.py`)    | `ToolResult.data`, `EvidenceItem`, `Recommendation`                            | Coordinates execution DAG, validates claims against evidence, verifies status invariance.            |
| **API Response Layer** (`api/v1/routes.py`) | `ChatResponse`, `VoiceChatResponse`                                            | Serializes strictly into canonical contract models for HTTP and voice clients.                       |
| **Frontend UI** (`frontend/src/`)           | `Recommendation`, `EvidenceItem`, `MapLayer`, `AgentTraceItem`                 | Renders visual badges, evidence drawers, interactive vector maps, and audio playback.                |

---

## 4. Contract Conformance Verification

- **Backend Protocol Tests**: [`tests/contract/test_connector_contracts.py`](file:///c:/Users/dyara/ORCA/tests/contract/test_connector_contracts.py) validates runtime conformance of all providers.
- **Frontend TypeScript Typings**: [`frontend/src/types/contracts.ts`](file:///c:/Users/dyara/ORCA/frontend/src/types/contracts.ts) provides compile-time verification mirroring `backend/app/contracts/chat.py`.


## 2026-10-03: Evidence identity and revision semantics (D069)

`mission_evidence.py` retains deep copies of the existing `ObservationBundle`, PFZ payload, origin, coordinates, and explicit data mode. The evidence ID is a content hash excluding assembly `captured_at`; equivalent normalized inputs have the same identity. The first retained capture time is preserved. A new evaluation has a new assessment ID and parent assessment reference; parameter comparisons preserve the canonical mission ID and source issue/validity times. Assessment ID, evidence ID, and evaluator version are distinct concepts.

For the current controlled DEMO, the bundle includes the applicable origin's complete hazard corpus and coverage interval. Parameter edits select warnings intersecting the proposed mission window from that corpus without provider retrieval. PFZ feature validity is retained and filtered for the proposed departure; expired/unavailable candidates do not produce an invented route. Captured forecasts are forecasts, not newly observed conditions.

Structured payload freshness/source fields survive serialization. Simulated sources remain DEMO; cached delivery remains SAVED; unavailable/empty operational bundles are not labelled LIVE. Origin forecasts applied along a corridor are explicitly labelled as such, not spatial forecast grids.

Route records add backend `departure_supported`, `rejection_reasons`, `evaluation_scope`, and `spatial_basis`. Existing waypoint timelines, peak exposure, craft speed assumptions and geofence calculations remain the numerical authority. Whole-window environmental evaluation is separate from outbound transit exposure; no return-route/chart-grade clearance is implied.

The evidence store is bounded and process-local. Browser history and role inspection are device-local historical records, not authenticated fleet telemetry. Durable multi-worker replay remains future work.


## 2026-10-03: Optional PFZ provenance fields (D076)
`PFZSourceDataPayload` retains optional `provider_name`, `valid_from`, `retrieved_at`, `lineage_id`, `coverage`, `coverage_status`, `quality_flags`, and `freshness_flags` through model validation and JSON serialization. Absent values stay absent/None; these fields do not imply official authority. Existing `features`, `bulletin_date`, `valid_to`, and source-mode fields remain canonical. PFZ confidence is independent of marine/weather confidence. A cached source cannot acquire live confidence merely by retaining a verification flag.
`DataProvenance.retrieved_at` preserves the source's supplied retrieval timestamp. Missing retrieval metadata is not replaced with assembly, assessment, or simulation time.
