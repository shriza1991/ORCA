# ORCA Deterministic Test Fixtures & Snapshot Catalog

> **Owned by Dev 4 (Marine/Geo Intelligence) & Member 5 (Domain Research)**  
> **Purpose:** Provides reproducible offline scenario data for CI tests, offline demonstrations, and `DATA_MODE=SNAPSHOT`.

---

## 1. Directory Structure

```
data/fixtures/
├── scenarios_manifest.json      # Metadata registry for all 8 benchmark scenarios (S1–S8)
├── geofences_india.geojson      # Static polygons: EEZ, MPAs, Naval firing sectors, IMBL
├── s1_normal_conditions.json    # Scenario S1: Calm sea, GO state
├── s2_elevated_sea_state.json   # Scenario S2: 2.2m wave, CAUTION state
├── s3_cyclone_alert.json        # Scenario S3: IMD Red alert, hard NO_GO state
├── s4_stale_forecast.json       # Scenario S4: Outdated >24h telemetry, UNKNOWN state
├── s5_nearest_pfz.json          # Scenario S5: INCOIS PFZ line features off Ratnagiri
├── s6_geofence_breach.json      # Scenario S6: Naval boundary intersection, NO_GO
├── s7_safer_routes.json         # Scenario S7: Route A vs. Route B exposure comparison
└── s8_multilingual_chat.json    # Scenario S8: Marathi / Hindi multi-turn conversation
```

---

## 2. Integrity Rules for Fixtures
1. **Authentic Units**: Wave heights in meters, wind in knots, sea surface temperatures in Celsius.
2. **Ground-Truth Validation**: Member 5 cross-checks all values against historical INCOIS and IMD bulletins before committing.
3. **No Fabricated Secrets**: Fixture files are public and must contain zero API tokens or private URLs.
