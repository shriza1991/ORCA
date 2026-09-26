# Phase 0 Freeze Audit: Data Sources & Fixtures

This document outlines the current state of marine/GIS data sources and offline fixture scenarios implemented in the SAMUDRA codebase ahead of the Phase 0 baseline freeze.

## 1. Marine & GIS Data Sources

| Source / Provider | Datasets / Services | Current Data Mode | Reliability & Implementation Status |
| :--- | :--- | :--- | :--- |
| **INCOIS** | PFZ advisories, Marine Conditions, SVAS advisories | `LIVE`, `SNAPSHOT`, `HYBRID` | Robust integration via `incois.py` and `manager.py`. Supports graceful fallback to `SNAPSHOT` during transient errors in `HYBRID` mode. |
| **IMD** | Weather Conditions, Hazard Bulletins | `LIVE`, `SNAPSHOT`, `HYBRID` | Integrated via `imd_weather.py` and `imd_hazard.py`. Managed with fallback mechanisms. |
| **SACHET** | CAP Hazard Alerts | `LIVE` (with fallback) | Live queries via `sachet.py`. Harmonized with IMD alerts; acts as an epistemic safety override if its severity exceeds IMD. |
| **MOSDAC (ISRO/INCOIS)** | OCEANSAT3_SST, OCEANSAT3_CHL | `CACHED` / Offline | Read locally from NetCDF files via `satellite_importer.py` (registered as `FILE_IMPORT`). Applies QA masks during import. |
| **GHRSST (NASA/NOAA)**| MUR (v4.1), AVHRR | `CACHED` / Offline | Read locally from NetCDF files via `satellite_importer.py`. |
| **GIS Reference Data** | CMFRI, CAA, DGLL | `CACHED` / Offline | JSON datasets in `data/reference/`. Loaded offline for UI and mock operations. |
| **Maritime Polygons** | Boundaries, EEZ, Geofences (MPAs, Firing Ranges) | `CACHED` / Offline | GeoJSON boundaries in `data/reference/`. Deterministic spatial engines use these offline to enforce `NO_GO` limits. |

---

## 2. Fixtures & Scenario Files

All authoritative evaluation scenarios are tracked in `data/fixtures/scenarios_manifest.json` and are used for offline/demo evaluation runs.

| Scenario ID | Fixture File | Type / Variant | Description |
| :--- | :--- | :--- | :--- |
| **S1** | `s1_normal_conditions.json` | **Safe (Hero)** | Normal favorable conditions. Returns `GO` recommendation. |
| **S2** | `s2_elevated_sea_state.json` | **Unsafe (Caution)** | Elevated sea state approaching limits. Returns `CAUTION`. |
| **S3** | `s3_cyclone_alert.json` | **Unsafe (No-Go)** | Severe cyclone alert. Triggers strict `NO_GO` safety override. |
| **S4** | `s4_stale_forecast.json` | **Unknown (Data Quality)**| Missing or stale forecast data. Returns conservative `UNKNOWN`. |
| **S5** | `s5_nearest_pfz.json` | **Safe (Feature Hero)** | Locates nearest PFZ and verifies transit safety. Returns `GO`. |
| **S6** | `s6_geofence_breach.json` | **Unsafe (No-Go)** | Route intersects active restricted polygon. Enforces `NO_GO`. |
| **S7** | `s7_safer_routes.json` | **Safe (Caution)** | Compares exposed vs. sheltered routes. Returns `CAUTION`. |
| **S8** | `s8_multilingual_chat.json`| **Demo (Hero)** | Multi-turn, multi-lingual evaluation in Marathi/Hindi. Returns `GO`. |

---
*Generated for Phase 0 Freeze evaluation.*
