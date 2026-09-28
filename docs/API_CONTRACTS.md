# SAMUDRA API & Data Contracts Specification

> **SIH Problem Statement:** PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents  
> **Status:** Canonical Shared Contracts for Frontend, Backend, Agents & Domain

---

## 1. Overview & Contract-First Rule

To enable four developers to work asynchronously without blocking each other:

1. **Frontend (Dev 1)** builds UI mockups against the TypeScript contract types.
2. **Backend Platform (Dev 2)** implements FastAPI serialization adhering strictly to these Pydantic schemas.
3. **Agent Orchestration (Dev 3)** ensures the final LangGraph state maps directly into `ChatResponse`.
4. **Domain & Tools (Dev 4)** wraps all mathematical and spatial outputs into `ToolResult`.

---

## 2. Shared Core Data Models

### 2.0D Unified trip assessment observations

`TripAssessmentResponse.conditions` is the canonical source for Fisher marine
metrics. Its `marine` and `weather` payloads may include `hourly_forecast`
records, while the bundle exposes the merged `hourly_forecast` series used by
the deterministic risk engine, route evaluator, and What-If comparisons.
Marine payloads may include `sea_level_height_m`, `tide_phase`, and
`tide_is_estimated`. Route candidates expose `one_way_distance_km`,
`round_trip_distance_km`, `one_way_fuel_liters`, and
`round_trip_fuel_liters`. `source_metadata.provenance_mode` is the display
authority for `LIVE`, `SAVED`, or `DEMO` badges.

### 2.0 Authority chat sector context

`ChatRequest.user_context.sector_id` is optional and is reserved for the
Authority Command Deck. It must be a canonical surveillance sector `public_id`
(for example, `sector-ratnagiri`). When present, the backend validates it and
derives the harbor and coordinates from canonical sector metadata for that
request. It takes precedence over conversation memory and client-supplied
harbor values; unknown IDs return HTTP 422. Requests without it retain the
existing chat behavior.

### 2.0A Authority sector hazards

`GET /api/v1/demo/sectors/{sector_id}/hazards` accepts a canonical sector
`public_id` and returns only its canonical `ACTIVE` hazards. Each item preserves
the seeded hazard ID, type, severity, status, validity window, provenance, and
GeoJSON geometry. An unknown sector returns HTTP 404; an empty `hazards` list
means no relevant active hazards, not unavailable data.

### 2.0B Authority vessel-hazard associations

`GET /api/v1/demo/sectors/{sector_id}/hazard-associations` returns only
observational `IN_HAZARD_AREA` associations. It evaluates each sector vessel's
latest canonical replay position against canonical active hazard geometry; it
does not predict a collision, route, or future encounter.

### 2.0C Authority operational hazard alerts

`GET /api/v1/demo/sectors/{sector_id}/operational-alerts` derives stable active
alerts from P0-8B associations. Alert severity is copied from the canonical
hazard; empty results mean no current association, while endpoint failure is
shown as unavailable by the Authority UI.

### 2.1 The Canonical `ChatResponse`

This is the payload returned by `POST /api/v1/chat` to the frontend.

```json
{
  "run_id": "run_98f82a1e-84b2-4d22-964d-0457639f283a",
  "conversation_id": "conv_67b3112c-15a4-4a5e-9f0e-3b2d18302f3a",
  "language": "en",
  "intent": "GO_NO_GO_SAFETY",
  "answer": "Departure from Ratnagiri tomorrow at 06:00 is advised against (NO-GO). Severe sea state with significant wave heights of 3.4m and active IMD squall alert.",
  "recommendation": {
    "status": "NO_GO",
    "summary": "High risk of craft swamping due to elevated wave heights and squall conditions.",
    "decisive_factors": [
      "Significant wave height 3.4m exceeds craft safety ceiling (2.5m)",
      "IMD coastal squall warning active across Konkan coast until 14:00 tomorrow"
    ],
    "next_action": "Postpone departure until wave heights abate below 2.0m (expected after 18:00 tomorrow)."
  },
  "confidence": {
    "level": "HIGH",
    "reasons": [
      "Recent INCOIS Ocean State Forecast updated 2 hours ago",
      "Corroborated by IMD coastal bulletin issued at 18:00 IST"
    ]
  },
  "evidence": [
    {
      "source_name": "INCOIS Ocean State Forecast",
      "source_url": "https://incois.gov.in/portal/osf/osf.jsp",
      "observed_time": "2026-09-05T00:00:00Z",
      "valid_from": "2026-09-05T05:00:00Z",
      "valid_to": "2026-09-05T12:00:00Z",
      "retrieved_at": "2026-09-04T22:30:00Z",
      "geometry": {
        "type": "Point",
        "coordinates": [73.28, 16.99]
      },
      "metric_name": "significant_wave_height",
      "metric_value": 3.4,
      "metric_unit": "meters",
      "quality_flags": ["fresh", "official_source"]
    }
  ],
  "map_layers": [
    {
      "layer_id": "layer_warning_zone_ratnagiri",
      "name": "Squall Warning Sector",
      "layer_type": "geojson",
      "visible": true,
      "style": {
        "color": "#ef4444",
        "opacity": 0.35,
        "line_width": 2
      },
      "geojson": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "geometry": {
              "type": "Polygon",
              "coordinates": [
                [
                  [72.5, 16.5],
                  [73.5, 16.5],
                  [73.5, 17.5],
                  [72.5, 17.5],
                  [72.5, 16.5]
                ]
              ]
            },
            "properties": {
              "severity": "CRITICAL",
              "label": "IMD Squall Advisory Zone"
            }
          }
        ]
      }
    }
  ],
  "trace": [
    {
      "step": 1,
      "node": "intent_locale",
      "action": "Detected intent: GO_NO_GO_SAFETY (en)",
      "status": "completed",
      "timestamp": "2026-09-04T22:31:01Z"
    },
    {
      "step": 2,
      "node": "supervisor",
      "action": "Dispatched tools: get_marine_weather, evaluate_risk",
      "status": "completed",
      "timestamp": "2026-09-04T22:31:02Z"
    }
  ],
  "warnings": ["Open-Meteo fallback was not needed. Primary data is fresh."],
  "suggested_followups": [
    "Check safety window for tomorrow evening",
    "Where is the nearest safe anchorage near Ratnagiri?"
  ]
}
```

---

### 2.2 The Canonical `ToolResult`

All domain tools in `backend/app/tools/` must return this standardized wrapper:

```json
{
  "status": "ok",
  "data": {
    "calculated_distance_km": 42.6,
    "compass_bearing_deg": 245.0,
    "nearest_pfz_id": "PFZ-MH-20260905-01",
    "chlorophyll_a": 1.2,
    "sst_celsius": 28.4
  },
  "evidence": [
    {
      "source_name": "INCOIS PFZ Multilingual Advisory",
      "source_url": "https://incois.gov.in/portal/pfz/pfz.jsp",
      "observed_time": "2026-09-04T12:00:00Z",
      "valid_from": "2026-09-05T00:00:00Z",
      "valid_to": "2026-09-05T23:59:59Z",
      "retrieved_at": "2026-09-04T22:30:00Z",
      "metric_name": "pfz_coordinates",
      "metric_value": [72.95, 16.82],
      "metric_unit": "lon_lat",
      "quality_flags": ["verified_geometry"]
    }
  ],
  "warnings": [],
  "error_code": null
}
```

**Status Enumeration**:

- `ok`: Tool completed successfully with valid data.
- `partial`: Tool returned fallback/degraded data or partial spatial coverage.
- `failed`: Tool failed (details supplied in `error_code` and `warnings`).

---

## 3. Core API Endpoints

### 3.1 `POST /api/v1/chat`

- **Description**: Main interaction endpoint. Processes user natural language query, runs the bounded LangGraph pipeline, and returns the unified response.
- **Request Body**:
  ```json
  {
    "conversation_id": "conv_67b3112c-15a4-4a5e-9f0e-3b2d18302f3a",
    "message": "Where is the nearest Potential Fishing Zone today from Ratnagiri?",
    "user_context": {
      "origin_harbor": "Ratnagiri",
      "coordinates": [73.28, 16.99],
      "craft_profile": "motorized_boat",
      "language_preference": "auto"
    }
  }
  ```
- **Response**: `200 OK` (`ChatResponse`) or `422 Unprocessable Entity` on malformed schema.

### 3.2 `GET /api/v1/chat/{conversation_id}/history`

- **Description**: Retrieves session conversational context and high-level messages.
- **Response**: List of previous user questions and assistant responses with metadata.

### 3.3 `GET /api/v1/health`

- **Description**: Verifies service status and downstream provider connectivity.
- **Response**:
  ```json
  {
    "status": "healthy",
    "data_mode": "HYBRID",
    "database": "connected",
    "llm_provider": "ready",
    "fixtures_available": 8,
    "timestamp": "2026-09-04T22:30:00Z"
  }
  ```

### 3.4 `GET /api/v1/scenarios`

- **Description**: Returns metadata for the 8 canonical pre-configured test scenarios (S1-S8) to allow one-click testing in the UI or CI.

### 3.5 `GET /api/v1/layers/base`

- **Description**: Returns GeoJSON geometries for Indian coastal boundaries, EEZ, major fishing harbors, and designated Marine Protected Areas (MPAs).
