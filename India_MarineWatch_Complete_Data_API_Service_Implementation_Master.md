# India MarineWatch — Complete Data, API & Service Implementation Master Specification

**Status:** Implementation blueprint
**Research cut-off:** 23 September 2026
**Purpose:** Build an India-focused, FOSS-first marine/coastal data platform inspired by the architecture and feature patterns of Norway's BarentsWatch.

> **Important:** India MarineWatch is a proposed independent platform, not an official Government of India service. It should present official-source information with source attribution, timestamps, licensing metadata and prominent disclaimers where the underlying source requires them. It must never imply that a forecast, warning, regulatory interpretation or AI-generated result is itself an official government warning or decision.

---

## 0. Executive summary

India MarineWatch should be a **unified marine data, GIS, forecasting, fisheries, aquaculture, environmental monitoring, maritime-safety and decision-support platform** for India and its coastal waters/EEZ.

The core idea is not to recreate the scientific systems owned by Indian institutions. The platform should sit above them:

```text
INCOIS        IMD        ISRO/MOSDAC        Bhuvan/NRSC
CMFRI         CAA        NCSCM/NCCR        Hydrographic Office
Department of Fisheries    data.gov.in      GEBCO
Global Fishing Watch       OpenStreetMap    other licensed sources
                         |
                         v
             +-------------------------+
             |   INDIA MARINEWATCH     |
             |                         |
             | ingestion + provenance  |
             | normalization + QC      |
             | PostGIS + raster store  |
             | APIs + OGC services     |
             | GIS + analytics         |
             | alerts + AI             |
             +-------------------------+
                         |
          +--------------+---------------+
          |              |               |
          v              v               v
      fishermen      researchers      authorities/
      citizens       industry         planners
```

The platform should be built around six principles:

1. **Use official/authoritative data first.**
2. **Do not assume that a public website means the underlying data is openly redistributable.**
3. **Store provenance and access/licensing metadata for every dataset.**
4. **Keep raw source data separate from normalized/derived data.**
5. **Expose both human-friendly GIS and machine-friendly APIs.**
6. **Keep the AI layer grounded in structured data and source citations rather than allowing free-form factual generation.**

---

# 1. What you are building

## 1.1 Product definition

India MarineWatch is a proposed national marine information platform with these domains:

```text
OceanWatch
FisherWatch
AquacultureWatch
FishHealth India
ShipWatch
PortWatch
CoastalWatch
MarineHazards
MarineSpatialPlanning
MarineEnergy
DataCatalogue
MarineWatch AI
```

## 1.2 Primary user groups

### Fishermen / fishing communities

- PFZ advisories
- weather and wave forecasts
- fishing restrictions
- marine hazards
- route planning
- landing-centre information
- favourite fishing grounds
- local alerts

### Recreational boaters

- weather
- wave height
- tide
- currents
- navigation/context layers
- safe-route planning
- warnings

### Commercial shipping

- ship/traffic context where lawfully available
- route forecast
- waves/wind/current
- ports and anchorages
- navigational warnings
- bathymetry/reference layers

### Aquaculture operators

- farm locations
- aquaculture zones
- environmental conditions
- water quality
- disease information where available
- protected areas/regulatory context

### Researchers

- historical data
- spatial/temporal queries
- downloads
- APIs
- metadata
- provenance
- derived statistics

### Planners / analysts

- marine spatial planning
- fisheries activity
- protected habitats
- coastal vulnerability
- infrastructure
- conflicts between marine uses

### Emergency/disaster users

- cyclone information
- tsunami bulletins
- storm surge
- high waves
- marine pollution/oil-spill trajectories
- search-and-rescue decision-support data

---

# 2. Access classification used in this specification

Every source/dataset must receive one of these classifications.

| Code | Meaning | Typical action |
|---|---|---|
| **OPEN** | Public access; no manual application normally required | Integrate directly, subject to terms |
| **OPEN_ACCOUNT** | Public service/data but account/API key is needed | Register and authenticate |
| **REQUEST** | Formal data request or approval is required | Apply/contact provider |
| **LICENSED** | Commercial/product licensing, fee or redistribution controls | Obtain licence before use |
| **RESTRICTED** | Sensitive/limited users/authorized organizations | Do not build around it without authorization |
| **MIXED** | Public and restricted tiers exist | Integrate only the public/licensed tier available to you |
| **UNKNOWN** | Access has not been verified for the exact dataset | Do not assume openness |

### The critical rule

**Access to a webpage is not the same thing as permission to redistribute its data.**

For every dataset store:

```text
access_type
application_required
approval_required
account_required
api_key_required
fee_possible
license
redistribution_allowed
commercial_use_allowed
attribution_required
retention_allowed
caching_allowed
last_verified
```

---

# 3. Master source-of-truth matrix

This is the initial source strategy.

| Domain | Preferred source | Access classification | First implementation | Notes |
|---|---|---|---|---|
| Ocean forecasts | INCOIS OSF | OPEN | Yes | Primary ocean forecast backbone |
| Scientific ocean datasets | INCOIS ERDDAP | MIXED | Yes | Dataset-specific accessibility must be checked |
| PFZ | INCOIS PFZ | OPEN | Yes | Core fisherman feature |
| Tides | INCOIS PAT | OPEN/service | Yes | Predicted astronomical tide |
| Port/harbour forecast | INCOIS | OPEN/service | Phase 2 | Useful for port profiles |
| Ship-route forecast | INCOIS | OPEN/service | Phase 2 | Useful for route planner |
| Water quality | INCOIS | OPEN/service | Phase 2 | Product-specific access |
| Marine heatwaves | INCOIS MAHAS | OPEN/service | Yes | Hazard/environment layer |
| Algal blooms | INCOIS ABIS | OPEN/service | Yes | Environmental hazard |
| Coral bleaching | INCOIS | OPEN/service | Phase 2 | Coastal ecosystem |
| Jellyfish | INCOIS | OPEN/service | Phase 2 | Fisheries/tourism context |
| Oil spills | INCOIS OOSA | OPEN/service | Phase 2 | Trajectory/advisory |
| Storm surge | INCOIS | OPEN/service | Phase 2 | Disaster layer |
| High waves/swell surge | INCOIS | OPEN/service | Yes | Hazard layer |
| Tsunami | INCOIS ITEWS/ORCA | OPEN/public service | Yes | Display authoritative bulletins |
| SARAT | INCOIS | OPEN_ACCOUNT / specialized | Later | Registration required |
| SVAS | INCOIS | OPEN/service / product-specific | Later | Small-vessel advisory |
| Meteorological marine forecasts | IMD | OPEN/public service | Yes | Fishermen + port + sea area warnings |
| Historical IMD marine data | IMD DSP | REQUEST/account/data procurement | Later | Do not assume free bulk data |
| Satellite EO | MOSDAC | MIXED | Phase 2 | Anonymous Open Data + registered tiers |
| Bhuvan map services | NRSC/Bhuvan | OPEN/service, dataset-specific | Yes | Use OGC services where allowed |
| Official boundaries | Survey of India | MIXED | Yes | Political boundaries have permissive policy treatment; many other products are licensed |
| Bathymetry | GEBCO_2026 | OPEN | Yes | Public domain, free, attribution |
| Nautical charts catalogue | Indian NHO | OPEN catalogue | Phase 2 | Product/ENC access is controlled/licensed |
| Notices to Mariners | Indian NHO | OPEN/public | Phase 2 | Useful navigation context |
| Aquaculture farm registry | CAA | OPEN web information | Phase 2 | Validate redistribution/PII rules |
| CAA detailed raw/bulk data | CAA | MIXED / dataset-specific | Later | Request if necessary |
| Fisheries statistics | CMFRI | MIXED | Yes for public products | Raw/high-resolution data may require approval/fees |
| Landing-centre GIS | CMFRI | MIXED | Phase 2 | Verify exact dataset access |
| Coastal planning/CZMP | NCSCM | MIXED | Phase 2 | Public approved maps; underlying scientific data may be restricted |
| NFDP beneficiary data | Department of Fisheries/NFDP | RESTRICTED/MIXED | No | Never expose beneficiary PII without authorization |
| Government datasets | data.gov.in | OPEN_ACCOUNT | Yes | Public datasets; API key for API use |
| Fishing effort | Global Fishing Watch | OPEN_ACCOUNT | Phase 2 | Non-commercial use under current standard terms |
| General map context | OpenStreetMap | OPEN | Yes | ODbL + attribution |
| Research/open geospatial | relevant institutional portals | UNKNOWN/MIXED | As verified | Dataset-by-dataset |

---

# 4. INCOIS: the primary ocean data backbone

INCOIS should be the first institution integrated because it already operates a large family of ocean information, forecast, advisory, hazard, observation and data-distribution services.

Official starting points:

- https://www.incois.gov.in/
- https://erddap.incois.gov.in/erddap/
- https://www.incois.gov.in/oceanservices/osfforecast.jsp
- https://www.incois.gov.in/site/services/osf.jsp
- https://www.incois.gov.in/MarineFisheries/PfzAdvisory

INCOIS describes its operational products as being generated from satellite observations, ocean observations, numerical models and data-assimilation systems. Its current OSF interface exposes, among other variables, wind, significant wave height, wave period, swell height/period, surface currents, sea-surface temperature, mixed-layer depth and D20. citeturn217454search5turn217454search2

---

## 4.1 INCOIS Ocean State Forecast (OSF)

### Implement

**Service:** Ocean State Forecast

### Variables to ingest where exposed

- Wind speed
- Wind direction
- Significant wave height
- Wave period
- Swell height
- Swell period
- Swell direction where available
- Surface current speed
- Surface current direction
- Sea-surface temperature
- Mixed-layer depth
- D20
- Additional ocean/satellite forecast variables exposed by the selected product

The current OSF UI is explicitly date-issued and exposes the variables above. citeturn217454search5

### Architecture

```text
INCOIS OSF
   |
   +--> forecast metadata
   +--> grid geometry
   +--> time steps
   +--> variables
   |
   v
Normalizer
   |
   +--> forecast_run
   +--> forecast_grid
   +--> forecast_variable
   +--> forecast_cell/value
   |
   v
Tile/API generation
```

### Storage strategy

Do **not** put every forecast grid value into ordinary JSON rows if the data is large.

Use:

- NetCDF/GRIB/Zarr as raw/object-storage representations
- Cloud-Optimized GeoTIFF where appropriate for raster snapshots
- xarray for scientific transformation
- PostGIS for metadata/points/derived statistics
- vector tiles for categorical/geometric overlays

### Product in your UI

```text
Point forecast
Timeline forecast
Raster overlay
Wind arrows
Wave arrows
Current arrows
Charts
Compare forecast runs
Download subset
```

### Update policy

The current OSF interface shows issued-on dates and time-indexed forecasts. Build the ingestion worker so that a forecast **run ID** is immutable and new runs are stored separately rather than overwriting prior runs.

---

## 4.2 INCOIS ERDDAP

### Classification

**MIXED by dataset.** Many datasets are public; individual datasets may expose access forms or different permissions.

INCOIS runs an ERDDAP instance specifically to make oceanographic data available in consistent machine-readable subsets and formats. The current server exposes active datasets and public accessibility metadata. citeturn217454search4turn217454search6

### Base service

https://erddap.incois.gov.in/erddap/

### Implement these interfaces

- `tabledap`
- `griddap`
- WMS where exposed
- OPeNDAP where exposed
- ERDDAP file/download interface

ERDDAP supports subset queries by time, geography and variables and can deliver common scientific formats; INCOIS exposes downloadable source files for datasets where allowed. citeturn217454search4turn217454search11turn217454search16

### Ingestion strategy

Do **not** mirror the entire server.

Build a dataset registry first:

```text
provider = INCOIS
server = ERDDAP
schema = griddap/tabledap
accessibility = public / other
license = from dataset metadata
variables = discovered from metadata
```

Then explicitly whitelist datasets.

### Useful ERDDAP datasets

Prioritize whatever current catalogue exposes for:

- Argo
- SST
- currents
- buoy observations
- wave observations
- ocean colour
- model output
- reanalysis
- other public operational products

The exact dataset IDs should be discovered from the live catalogue at implementation time; **do not hard-code historical IDs from old documentation without checking the current catalogue.**

### Code pattern

```python
# Pseudocode
for dataset in approved_incois_datasets:
    metadata = erddap.get_metadata(dataset)
    access = inspect_access(metadata)
    if access != "public":
        continue
    query = build_spatiotemporal_subset(dataset, bbox, start, end, variables)
    payload = erddap.download(query, format="netcdf4")
    validate(payload)
    archive_raw(payload)
    normalize(payload)
```

---

## 4.3 INCOIS data holdings / observation systems

The INCOIS data holdings catalogue contains multiple observational families with different access levels. Treat each family independently.

### Useful groups

- Drifting buoys
- Moored buoys
- XBT/XCTD
- Current-meter arrays
- Argo
- Automatic Weather Stations
- Wave Rider Buoys
- HF Radar
- Tsunami buoys
- Satellite observations
- Model/reanalysis datasets

### Access principle

Some are:

- public visualization + download
- public visualization only
- registered access
- specialized access

Therefore the implementation must retain the source's access state instead of flattening everything into a single `open=true` field.

---

## 4.4 INCOIS PFZ — Potential Fishing Zone

### Classification

**OPEN/public service**, subject to current service terms and source-use conditions.

### Implement

- Current PFZ advisories
- PFZ geography
- PFZ coordinates
- PFZ reference/landing centres
- Bathymetry associated with advisory products
- SST context
- Chlorophyll context
- PFZ sector
- Advisory validity date
- Previous advisories for historical analysis where available

INCOIS describes PFZ advisories as being produced from satellite ocean-colour/SST information and provides sectors including Gujarat, Maharashtra, Goa, Karnataka, Kerala, Tamil Nadu, Andhra Pradesh, Odisha, West Bengal, Lakshadweep, Andaman and Nicobar. The PFZ WebGIS supports interactive map-based advisory access. citeturn217454search2

### Core model

```text
pfz_advisory
----------------
id
date
sector
valid_from
valid_to
source_url
source_timestamp

pfz_geometry
----------------
advisory_id
geometry
bearing_reference
landing_centre_id
water_depth
confidence/quality if provided
```

### UI

```text
PFZ
[Today] [Yesterday] [History]

Sector
Distance from landing centre
Depth
SST
Chlorophyll
```

### Important

Do not generate a new PFZ from your own ML model and call it an official PFZ. Your platform can later add a separate research/experimental layer clearly labelled as **model-derived / unofficial**.

---

## 4.5 INCOIS tuna fishery advisory

Where current public service access permits, integrate:

- Tuna advisory
- SST
- Chlorophyll
- Kd490/ocean-colour variables exposed by the service
- sector information
- bathymetry
- landing-centre context

Keep it separate from generic PFZ because it is a species/use-case-specific advisory.

---

## 4.6 INCOIS Hilsa Fishery Advisory

Where currently operational/public, model this separately:

- advisory date
- West Bengal coastal area
- target-species context
- SST/chlorophyll/ocean variables
- advisory geometry
- forecast horizon
- validity

The service has historically provided daily advice with short forward lead times and machine-learning support. Verify the exact current publication and season before production ingestion.

---

## 4.7 Predicted Astronomical Tide (PAT)

### Implement

- high tide time
- low tide time
- predicted water level where provided
- station/location
- local date/time
- astronomical tide series

Use it for:

- boat planning
- port pages
- route planner
- coastal profile
- current-reversal context

Do not confuse astronomical tide with total observed water level during weather events.

---

## 4.8 Forecast along ship routes / route forecast

Build a route abstraction capable of ingesting official route forecasts where available.

Input:

```text
route geometry
departure time
vessel profile (optional)
```

Output:

```text
distance
ETA
wave height
wave period
swell
wind
current
SST
other official variables
```

Use exact source-issued values for official forecast layers. Any optimization/routing recommendation should be explicitly your platform's derived calculation.

---

## 4.9 Location-specific forecast

Expose a point-click experience:

```text
Click map
   |
   +--> coordinates
   +--> forecast timestamp
   +--> wind
   +--> waves
   +--> swell
   +--> currents
   +--> SST
   +--> relevant ocean variables
```

Show both a chart and source metadata.

---

## 4.10 Water Quality Nowcast

Potentially integrate:

- temperature
- salinity
- currents
- pH
- dissolved oxygen
- dissolved methane
- pCO2
- chlorophyll-a
- phycoerythrin
- phycocyanin
- turbidity
- CDOM
- hydrocarbons
- nutrients
- pigment/biogeochemical variables exposed by the product

### Use cases

- coastal water profile
- aquaculture context
- environmental monitoring
- research
- pollution investigation

### UI

```text
Water Quality

Temperature     28.3 C
Salinity        34.9 PSU
DO              ...
pH              ...
Turbidity       ...
Chlorophyll     ...

[Historical graph]
```

---

## 4.11 Algal Bloom Information System (ABIS)

Implement, subject to current public availability:

- bloom extent
- bloom index
- chlorophyll
- SST
- rolling chlorophyll anomaly
- rolling SST anomaly
- phytoplankton categories/size classes where exposed
- hotspot regions
- timestamp/validity

Use for environmental alerts and aquaculture context.

---

## 4.12 Coral Bleaching Alert System

Potential data/features:

- SST
- hotspots
- Degree Heating Weeks
- bleaching alert level if officially published
- affected reef/coastal region
- time-series history

Keep model-derived severity exactly as supplied by the source; do not silently reinterpret categories.

---

## 4.13 Marine Heat Wave (MAHAS)

Implement:

- current marine heatwave status
- coast/region
- severity category as officially defined
- start date
- current/end date if available
- anomaly magnitude
- spatial extent
- historical events if public

Useful for:

- fisheries
- coral ecosystems
- aquaculture
- scientific analysis

---

## 4.14 Jellyfish information

If the public service remains available, implement:

- observed historical jellyfish records
- species/type
- event frequency
- seasonal probability
- hotspots
- location-specific information
- first-aid guidance where officially published
- fisheries/tourism impact context

Do not turn a probabilistic hotspot layer into a definitive safety warning.

---

## 4.15 Oil-spill advisory (OOSA)

INCOIS's OOSA service provides oil-spill trajectory advisory modelling. Integrate:

- incident point/time where publicly released
- trajectory
- predicted area/line
- forecast horizon
- wind/current context
- animation/product reference

The public OOSA service describes predicted oil-spill trajectories up to a multi-day horizon and map-based visualization. Use it as an advisory source, not as your own official incident command system. 

Source: https://oosa.incois.gov.in/

---

## 4.16 Storm surge

Implement public storm-surge products where exposed:

- predicted surge
- affected coastal sectors
- warning/advisory level
- forecast time
- event identifier
- bulletin/product link

Keep the official product unchanged and source-attributed.

---

## 4.17 High-wave / swell-surge services

Integrate:

- high-wave alerts
- swell surge information
- affected zones
- forecast period
- observed/forecast distinction

These belong in the common **Marine Hazard Engine**.

---

## 4.18 Tsunami / ITEWS

### Never build your own official warning layer.

Consume/display authoritative information from INCOIS ITEWS/ORCA where permitted.

Potential components:

- earthquake event
- magnitude
- depth
- epicentre
- event time
- latest bulletin
- warning/watch/advisory status
- affected coastal regions
- tsunami travel-time maps
- threat maps
- status/updates

ORCA consolidates multiple marine services including tsunami information, high-wave/swell-surge, currents, OSF and other marine advisories. 

Primary sources:
- https://tsunami.incois.gov.in/
- https://incois.gov.in/site/ORCA/index.html

### Safety UI

Always show:

```text
SOURCE: INCOIS / ITEWS
Issued: timestamp
Product: official bulletin

This application reproduces/links official information.
Follow official emergency instructions.
```

---

## 4.19 SARAT — Search and Rescue Aid Tool

Classification:

**OPEN_ACCOUNT / specialized access**.

The registration workflow is distinct from public browsing.

Potential functions:

- last known position
- missing-object type
- distance/bearing from coastal reference point
- environmental/current/wind inputs
- predicted search area
- search planning support

Do not make SARAT mandatory for the public MVP. Implement it later after access conditions are verified.

---

## 4.20 SVAS — Small Vessel Advisory and Forecast

Potential features:

- potential overturning zones
- Boat Safety Index
- wave-height contribution
- steepness contribution
- directional spread
- wind-sea development
- vessel beam-width parameter for applicable models
- multiple-day forecast

Treat this as a **specialized advisory service**, not a generic safety score that your AI should reinterpret.

---

# 5. IMD integration

Official starting point:

https://mausam.imd.gov.in/responsive/marine_forecast.php

The current IMD marine interface includes fishermen warnings, port warnings, warning graphics, sea-area bulletins, observations and coastal weather forecast. It divides warnings into coastal and sea areas including Maharashtra, Goa, Gujarat, Kerala, Karnataka, Lakshadweep, Odisha, Andhra Pradesh, Tamil Nadu, West Bengal, Andaman and surrounding Arabian/Bay of Bengal areas. citeturn217454search0turn217454search12

---

## 5.1 Public IMD marine products — implement immediately

### Fishermen warnings

Model:

```text
warning_id
issued_at
valid_from
valid_to
region
headline
body
hazard_types
source_url
```

### Port warnings

- port/station
- warning category
- issue time
- valid time
- narrative
- source

### Sea-area bulletins

- Arabian Sea
- Bay of Bengal
- relevant subareas
- warning text
- validity

### Coastal weather forecast

Where exposed:

- wind
- rainfall
- wave height
- visibility
- forecast day
- geographic region

IMD's current marine page exposes coastal forecast products and sea-area bulletins publicly. citeturn217454search8turn217454search9

---

## 5.2 IMD historical/bulk data

Classification:

**REQUEST / account / data-procurement dependent.**

Do not design the MVP around bulk historical IMD marine data until your exact request and terms are approved.

The Data Service Portal should be treated as a procurement/request channel for datasets that are not already openly exposed through the public forecast services.

Implementation rule:

```text
Public forecast page = safe starting point
Historical/bulk data = check request/licence/fee before ingestion
```

---

# 6. ISRO / MOSDAC

Official source:

https://www.mosdac.gov.in/

Current MOSDAC access policy explicitly distinguishes:

- **Anonymous users:** metadata/images and Open Data, including NRT access where provided
- **Registered General Users:** limited datasets, 3-day latency
- **Registered Privileged Users:** all data, NRT access

Therefore classify MOSDAC as **MIXED**, not simply open. citeturn217454search7

---

## 6.1 Implement first

Use the openly accessible subset for:

- ocean colour
- satellite imagery/products
- SST and related products
- atmospheric/oceanographic products exposed as open data
- imagery useful for coastal context

Then later integrate registered products after registration.

---

## 6.2 Satellite data architecture

```text
MOSDAC
  |
  +--> metadata
  +--> product file
  +--> coverage
  +--> time
  +--> product version
  |
  v
Raw archive
  |
  v
xarray/raster processing
  |
  v
COG / Zarr / derived tiles
```

Do not keep full-resolution global archives in PostGIS.

---

# 7. Bhuvan / NRSC

Bhuvan is useful as a geospatial-service provider and contextual map source.

Official WMS documentation shows OGC WMS/WMTS services and thematic datasets including land-use/land-cover, erosion, water bodies, flood hazard and other thematic products. citeturn320796search3turn320796search8

Example WMS documented by Bhuvan:

```text
https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms
```

Example WMTS documented by Bhuvan:

```text
https://bhuvan-vec2.nrsc.gov.in/bhuvan/gwc/service/wmts
```

**Important:** check the current Bhuvan catalogue and each layer's terms before caching/redistributing source data.

---

## 7.1 Bhuvan layers to investigate

- India land-use/land-cover
- coastal land cover
- erosion
- water bodies
- flood hazard
- urban/coastal context
- satellite imagery
- terrain/elevation where relevant
- other public thematic layers

### Integration mode

For large static layers, first use **WMS/WMTS directly** rather than downloading everything.

Later, cache only the layers for which redistribution and local hosting are allowed.

---

# 8. Survey of India

Survey of India is authoritative for national political mapping/boundary standards.

Current geospatial policy says SOI-published maps and digital boundary data are the standard for political maps and says such boundary information should be easily downloadable for free; the policy also encourages open APIs and open-linked geospatial data. citeturn729746search7

However, SOI also has licensed/priced digital products. Its current pricing page describes Digital, Publishing, Media and Internet licences for categories of digital mapping products. citeturn217454search10

### Therefore

Use:

- official political boundaries where access/terms permit
- publicly downloadable government boundary data

Do not assume:

```text
SOI product visible online
      =
free redistribution
```

---

# 9. GEBCO bathymetry

Official source:

https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid

The current GEBCO_2026 Grid is global 15 arc-second terrain/bathymetry data. It can be downloaded globally or for user-defined areas and is available in NetCDF, GeoTIFF and ASCII forms, with OPeNDAP access. GEBCO states that the grid is placed in the public domain and may be used free of charge, including commercial exploitation, subject to its conditions and attribution. citeturn729746search3turn729746search5

### Implement

Download/crop the Indian region:

```text
Arabian Sea
Bay of Bengal
Andaman & Nicobar
Lakshadweep
India EEZ context
```

### Storage

- raw NetCDF archive
- crop to Indian-area COG
- generate contour tiles
- point-depth query API

### TID grid

Also retain the GEBCO Type Identifier Grid as provenance/quality context where useful.

---

# 10. Indian Naval Hydrographic Office / HydroBharat

Official catalogue:

https://www.hydrobharat.gov.in/web/guest/online-catalogue

The current public online catalogue allows search by chart name, chart number, area, folio and scale and links to Indian Notices to Mariners. It is updated fortnightly. citeturn217454search1

### Implement immediately

- public chart catalogue metadata
- chart number
- area
- scale
- folio
- publication/update date where available
- Notices to Mariners links

### Do not assume open redistribution of

- official ENC datasets
- full nautical chart content
- licensed chart products

Treat product access as **LICENSED / dataset-specific** unless terms explicitly permit your intended use.

---

# 11. Coastal Aquaculture Authority (CAA)

Official source:

https://caa.gov.in/

The public CAA farm-registration search exposes fields including registration number, farmer name, location, farm area, water-spread area, survey number, registration date, validity and status. citeturn729746search1turn729746search2

### Implement public layer where legally/technically permitted

- registered farm location
- registration number
- status
- validity
- farm area / WSA where appropriate
- state
- district

### Privacy rule

Because public registry fields may include personal information, your public map should **minimize personally identifying data**. Prefer:

```text
Farm ID
Location
Status
Area
Registration date
```

rather than republishing names/addresses unless there is a clear legal basis and source permission.

### Aqua mapping / zoning

CAA's current regulatory framework includes aqua mapping/aqua zonation concepts. Your project should represent approved/official zones and distinguish them from your own suitability analysis.

---

# 12. CMFRI fisheries data

Official data-request page:

https://www.cmfri.org.in/data-request

CMFRI's current policy says formal data requests must be made to the Director for approval; charges can depend on type and volume, with higher-resolution datasets costing more. citeturn729746search0turn320796search4

### Classification

**MIXED**

### Public products to use

- published fisheries statistics
- public reports
- public annual data
- public species/gear/quarter/state summaries

### Request/approval datasets

- raw/high-resolution datasets
- specialized GIS datasets
- higher temporal/spatial-resolution data
- data not already openly downloadable

### Architecture

Do not make a CMFRI data request a hard dependency for the MVP.

Build:

```text
public_cmfridata
```

first.

Then add:

```text
licensed/requested_cmfridata
```

through a controlled source adapter once access is approved.

---

# 13. NCSCM / coastal planning

NCSCM is relevant for:

- Coastal Zone Management Plans
- coastal information systems
- shoreline
- erosion
- hazards
- conservation
- pollution
- livelihoods
- coastal planning

Public approved CZMP information can be available, while underlying scientific/foundation datasets may be subject to restrictions.

### Classification

**MIXED**

### Implement

- approved CZMP maps where publicly downloadable
- CRZ category where official maps expose it
- coastal-management regions
- shoreline/erosion products where terms allow
- habitat/conservation layers
- public planning documentation

### Explicit distinction

```text
Official approved map
       ≠
raw research/foundation GIS
```

Do not infer legal clearance eligibility from your map. Public CZMP portals themselves may state that project-level clearances require maps at other scales prepared afresh.

---

# 14. National Fisheries Digital Platform (NFDP)

NFDP is relevant as a government digital ecosystem, but it must **not** be treated as a public data warehouse.

The platform supports beneficiary/user access and includes role- and identity-based workflows. Its traceability framework describes interoperability and stakeholder connectivity for fisheries/aquaculture value chains.

### For your project

Implement only:

- public facts/documentation
- public programme information
- links to official NFDP services
- statistics that are officially published and permitted for reuse

Do not ingest:

- beneficiary PII
- Aadhaar-linked information
- private registration records
- internal application status
- financial details

without explicit authorization.

### Future integration

```text
India MarineWatch
     |
     +--> public NFDP information
     |
     +--> authorized API (future, if formally exposed)
```

---

# 15. data.gov.in

Use the Open Government Data platform as a **discovery and secondary API source**.

Registered users can obtain API keys for datasets with APIs, and datasets can expose API endpoints or require an API request to be created. 

Official help:

https://www.data.gov.in/help

### Implement

Create a `data_gov_catalog` ingester that stores:

- catalogue ID
- resource ID
- department
- title
- description
- update frequency
- API URL
- file URL
- format
- licence/terms
- geographic scope

### Important

Do not duplicate all data.gov.in data into your system. Select marine/coastal/fisheries datasets that fit your product.

---
# 16. Global Fishing Watch (GFW)

Official API documentation:

https://globalfishingwatch.org/our-apis/documentation/

GFW offers APIs for apparent fishing effort, vessel identity/history, encounters, vessel insights/risk and bulk data products. Its current API terms state that the APIs are for **non-commercial use**, with current rate limits of 50,000 requests/day and 1,500,000/month. Most APIs are available through self-registration, while some can require additional approval/limitations. citeturn320796search0turn320796search5turn320796search7

### Classification

**OPEN_ACCOUNT + NONCOMMERCIAL** under the standard current API terms.

### Implement

- apparent fishing effort
- vessel search/identity where exposed
- vessel history
- fishing events
- encounters/transshipment
- contextual fishing layers
- bulk export for research where permitted

### Do not

- redistribute GFW raw registry information as if it were your own
- exceed rate limits
- use the standard API for commercial products without appropriate additional licensing

### Good use

```text
India MarineWatch
     |
     +--> India fishing-effort heatmap
     +--> historical vessel activity
     +--> research analytics
```

---

# 17. OpenStreetMap

OpenStreetMap is suitable for general map context under the ODbL.

### Use it for

- roads
- cities
- ports/marinas where mapped
- place names
- general POIs
- land context

### Do not use it as authoritative for

- legal maritime boundaries
- official fishing restrictions
- official CRZ boundaries
- official navigation warnings
- government regulatory polygons

### Production rule

Do not use the public OSM API as a high-volume tile/data backend. Use an extract, suitable provider, or self-hosted stack for scale.

---

# 18. Data source hierarchy

Use this precedence model.

## Level 0 — legal/operational authority

When two sources disagree on a legal/safety fact, prefer the currently authoritative source and show provenance.

Examples:

- official tsunami bulletin
- official maritime warning
- official regulation
- official approved planning map

## Level 1 — Indian government operational science

- INCOIS
- IMD
- ISRO/MOSDAC
- Bhuvan/NRSC
- NHO
- CMFRI
- CAA
- NCSCM/NCCR
- Department of Fisheries

## Level 2 — government-supported/research datasets

- institutional datasets
- ESSDP
- research repositories

## Level 3 — international scientific/open data

- GEBCO
- Global Fishing Watch
- other open scientific datasets

## Level 4 — contextual/community

- OpenStreetMap

---

# 19. Exact BarentsWatch-to-India module mapping

| BarentsWatch service/pattern | India MarineWatch equivalent | Primary source(s) |
|---|---|---|
| Ohoi | Coastal/BoatWatch India | INCOIS + IMD + NHO/context |
| NAIS | ShipWatch India | lawfully available/licensed AIS + official sources |
| ArcticInfo | Ocean/Shipping Watch India | INCOIS + IMD + NHO + maritime data |
| AquaInfo | AquaWatch India | CAA + fisheries/aquaculture sources |
| FishInfo | FisherWatch India | INCOIS PFZ + fisheries authorities + NHO + other official sources |
| Fishhealth | FishHealth India | CAA/animal-health/fisheries data where available |
| Fishery Activity | Fishing Activity India | CMFRI + licensed/open fishing-activity datasets |
| Wave Forecast | Ocean Forecast India | INCOIS + IMD |
| Saltstraumen | Tide/Current Hotspots India | INCOIS PAT/current products + local models where officially available |
| Polar Lows | Cyclone/Marine Hazard India | IMD + INCOIS |
| Marine Spatial Management Tool | India Marine Spatial Planning | NCSCM + CAA + fisheries + environment + energy + navigation |
| Data platform | India Marine Data Hub | all allowed sources |
| Restricted operational services | Future authorized operations layer | government partnerships only |

---

# 20. India MarineWatch map layer catalogue

The first release should have a curated layer library rather than hundreds of uncontrolled layers.

## 20.1 Base maps

- standard map
- satellite imagery (where licensing permits)
- dark map
- terrain
- bathymetry
- nautical/reference map where licensed
- blank/ocean-only background

## 20.2 Administrative

- India boundary
- coastal states
- districts
- coastal districts
- islands
- union territories
- coastal municipalities/local bodies where permitted

## 20.3 Maritime geography

- coastline
- territorial sea
- EEZ
- maritime boundaries
- baselines where available
- shipping/reference areas
- ports
- harbours
- fishing harbours
- landing centres
- anchorages
- VTS areas
- fairways/routes where legally available

## 20.4 Bathymetry

- depth raster
- depth points
- depth contours
- bathymetric shading
- selected depth thresholds

## 20.5 Ocean state

- wind arrows
- wind speed
- wave arrows
- significant wave height
- wave period
- swell height
- swell period
- surface currents
- current speed
- current direction
- SST
- MLD
- D20

## 20.6 Weather

- weather stations
- observations
- marine forecasts
- visibility
- rainfall
- pressure where available

## 20.7 Fisheries

- PFZ
- fishing grounds
- fishing landing centres
- fishing effort
- seasonal closures
- species-specific restrictions
- gear restrictions
- protected fishing habitats
- fishing activity history

## 20.8 Aquaculture

- farm locations
- hatcheries
- aquaculture zones
- permitted area
- infrastructure
- registered-farm status
- environmental buffers
- disease/health layers when available

## 20.9 Environmental

- marine protected areas
- coastal protected areas
- mangroves
- coral reefs
- seagrass
- wetlands
- estuaries
- water quality
- chlorophyll
- HAB
- marine heatwaves
- coral bleaching
- shoreline/erosion
- pollution

## 20.10 Hazards

- cyclone track
- cyclone warning areas
- tsunami bulletins
- tsunami threat maps where publicly exposed
- storm surge
- high waves
- swell surge
- marine heatwave
- HAB
- oil-spill trajectory
- coastal flooding products

## 20.11 Infrastructure

- ports
- terminals where available
- offshore platforms
- subsea infrastructure if publishable
- cables/pipelines where legally available
- energy zones
- aquaculture structures

---

# 21. FishWatch / FisherWatch implementation

## 21.1 Fisher homepage

```text
FisherWatch

My harbour
Today's PFZ
Weather
Wave
Wind
Current
Restrictions
Warnings
Favourite grounds
```

## 21.2 PFZ workflow

```text
Choose landing centre
       |
       v
Select date/advisory
       |
       v
Show PFZ
       |
       +--> SST
       +--> chlorophyll
       +--> depth
       +--> coordinates
       +--> distance
       +--> direction/reference
       |
       v
Forecast context
```

## 21.3 Fishing-rule engine

Input:

- location
- date
- state/region
- vessel category
- gear
- species

Output:

- applicable rule datasets
- spatial restrictions
- seasonal restrictions
- source document
- publication date
- validity date

### Never say

> Fishing is legal here.

unless you have a deterministic, validated regulatory engine and authoritative source coverage.

Prefer:

> No matching restriction was found in the currently integrated datasets. Check the current official notification/regulation before fishing.

---

# 22. AquaWatch implementation

## 22.1 Farm profile

```text
Aquaculture site

ID
State
District
Coordinates
Registered area
Water-spread area
Status
Valid until
Species/category
Source
Last updated
```

## 22.2 Spatial analysis

Allow:

- farms within radius
- farms inside administrative area
- farms intersecting a planning zone
- farms near protected areas
- farms near environmental hazard layers

## 22.3 Aquaculture suitability — experimental layer

Keep this clearly separate:

```text
OFFICIAL
approved zone / registered site

versus

EXPERIMENTAL
model-derived suitability
```

Never merge them visually so users think a model-derived candidate is official government zoning.

---

# 23. FishHealth India

Build the same reusable pattern seen in the BarentsWatch Fishhealth service, but only with Indian data actually available.

## Filter dimensions

Potential fields:

- week
- month
- year
- species
- disease
- mortality
- treatment
- water quality
- farm type
- licence/registration status
- state
- district
- aquaculture zone
- production system
- company/operator where legally publishable

## Dashboard

```text
Matching sites
Affected sites
New events
Historical trend
Disease categories
Environmental values
```

## Site page

- health observations
- environment
- treatment
- disease events
- historical timeline
- source
- last updated

## Spatial query tools

- radius
- polygon
- state
- district
- coastal region
- planning zone

---

# 24. ShipWatch India

AIS is a legally/licensing-sensitive component and must be designed accordingly.

## MVP without restricted live AIS

Use:

- official/public vessel information where available
- public/licensed vessel datasets
- synthetic AIS for development
- GFW data where its terms cover the use case

## Future licensed/official feed

Schema:

```text
vessel
--------
vessel_id
mmsi
imo
name
flag
type
length
beam
last_position
last_time
source
```

```text
vessel_position
----------------
vessel_id
time
lat
lon
sog
cog
heading
navigation_status
source
```

## Features

- current vessel map
- search
- filter by type
- filter by flag
- vessel profile
- historical track
- track playback
- nearby vessels
- area query

## Privacy/security

Do not expose sensitive vessel information or restricted government feeds.

---

# 25. PortWatch

## Port record

```text
port_id
name
lat
lon
state
port_type
operator
facilities
draft where official
contact where public
source
```

## Port conditions

Join:

- waves
- wind
- currents
- tide
- visibility
- warnings
- nearby vessels if legally available

## Port page

```text
Port

Current marine conditions
Next 5 days
Tide
Warnings
Nearby ships
Navigation context
Facilities
Official links
```

---

# 26. CoastalWatch

## Core data

- shoreline
- erosion/accretion
- coastal vulnerability
- flooding/hazard layers
- mangroves
- coral reefs
- seagrass
- wetlands
- estuaries
- coastal water quality
- marine litter/pollution where authoritative data is available

## Time dimension

Allow:

```text
2010
2015
2020
2025
2026
```

for datasets with appropriate historical snapshots.

## Coastal profile

Click coastline:

```text
Location

Shoreline change
Coastal hazard
Protected area
CRZ/CZMP
Nearby ports
Nearby farms
Nearby fisheries
Forecast
```

---

# 27. Marine Hazards Engine

Centralize all hazard sources.

```text
                Hazard Engine
                     |
   +-----------------+------------------+
   |                 |                  |
 Cyclone            Tsunami          Ocean
   |                 |              hazards
   |                 |                  |
   +---------+-------+------------------+
             |
             v
         Normalize
             |
         Geospatialize
             |
         Deduplicate
             |
         Severity metadata
             |
         User subscriptions
```

## Hazard types

- cyclone
- tropical storm
- high wave
- swell surge
- storm surge
- tsunami
- marine heatwave
- HAB
- coral bleaching
- oil spill
- severe weather
- coastal flood
- other official marine hazards

## Canonical warning object

```json
{
  "id": "source:identifier",
  "source": "INCOIS",
  "type": "high_wave",
  "issued_at": "2026-09-23T...Z",
  "valid_from": "...",
  "valid_to": "...",
  "geometry": {},
  "severity": "source_defined",
  "headline": "...",
  "source_url": "..."
}
```

Never overwrite source-defined severity.

---

# 28. CycloneWatch India

Primary meteorological authority:

**IMD**

Ocean-impact products:

**INCOIS**

## Track object

```text
cyclone_id
name
basin
issued_at
forecast_valid_to
current_position
forecast_positions
wind information if available
pressure if available
warning polygon if provided
source
```

## Join ocean hazards

For every forecast time:

```text
cyclone track
+
wave forecast
+
wind
+
storm surge
+
coastal vulnerability
+
ports
+
fisheries
```

This produces a much richer map while retaining separate source provenance.

---

# 29. Route Planner

## Input

- start
- destination
- optional waypoints
- departure time
- route geometry
- optional vessel profile

## Calculated outputs

- distance
- ETA
- average speed assumption
- wave forecast along route
- wind forecast
- currents
- tide at relevant points
- marine warnings
- protected/restricted areas
- ports/harbours nearby

## Important separation

```text
SOURCE DATA
  wave = INCOIS
  wind = IMD/INCOIS
  warning = IMD/INCOIS/NHO

DERIVED ANALYSIS
  route intersection = India MarineWatch
  estimated travel time = India MarineWatch
```

This separation makes the platform auditable.

---

# 30. Spatial Query Engine

PostGIS should handle core operations.

## Queries

- point-in-polygon
- polygon intersection
- buffer
- nearest feature
- radius search
- bounding box
- distance
- area
- route intersection
- temporal intersection
- overlap
- union/difference for planning analysis

## Examples

```text
PFZ within 100 km of Mumbai
```

```text
Aquaculture farms within 2 km of a protected area
```

```text
Ports within 50 km of cyclone track
```

```text
Fishing activity inside a selected state EEZ sector
```

```text
High-wave forecast intersecting a planned route
```

---

# 31. Time machine

BarentsWatch's time controls should be replicated as a reusable platform component.

## Controls

- year
- month
- week
- day
- forecast run
- hourly time
- playback

## Example

```text
2024 ---------------- 2025 ---------------- 2026
                                      |
                                      +-- Sep
                                          |
                                         Week 39
```

## Dynamic playback

Support:

- vessel position history
- cyclone movement
- PFZ evolution
- fishing effort
- ocean forecasts
- pollution trajectory

---

# 32. Data catalogue

The Data page is a first-class application.

## Search

Search across:

- title
- provider
- keyword
- geographic coverage
- variable
- time coverage
- category
- access type

## Dataset card

```text
Ocean State Forecast

Provider: INCOIS
Category: Forecast
Coverage: India/Ocean domain
Update: operational
Format: NetCDF/API/etc.
Access: Open service
License: source-defined
Updated: timestamp

[Map] [API] [Download] [Metadata]
```

## Catalogue filters

- Open
- Account required
- Request required
- Licensed
- Restricted
- Raster
- Vector
- Time series
- Forecast
- Observation
- Statistics
- Satellite
- GIS service
- API

---

# 33. Data provenance

Every displayed value must be traceable.

## Required fields

```text
source_id
provider
source_url
source_dataset_id
source_version
retrieved_at
published_at
valid_from
valid_to
processing_version
transform_version
license
access_type
quality_status
```

## User-facing provenance

```text
Source: INCOIS
Product: Ocean State Forecast
Issued: 22 Sep 2026
Retrieved: 23 Sep 2026 00:10 IST
Processing: India MarineWatch v0.1
```

---

# 34. Data-quality framework

For each dataset store:

- freshness
- completeness
- coordinate validity
- temporal validity
- duplicate rate
- null rate
- expected update interval
- current source availability
- schema changes
- known limitations

## Health states

```text
🟢 Healthy
🟡 Delayed
🟠 Partial
🔴 Failed
⚪ Unknown
```

Do not hide stale data.

If a source is delayed, show:

> Last successful update: 08:30 IST. Source currently appears delayed.

---

# 35. Source health monitoring

Create a scheduled job per adapter.

```text
source adapter
     |
 fetch
     |
 validate
     |
 compare schema
     |
 record timestamp
     |
 metrics
```

Metrics:

- request latency
- HTTP status
- file size
- records received
- variables received
- changed fields
- schema hash
- last success
- consecutive failures

Use Prometheus/Grafana.

---

# 36. Data ingestion architecture

```text
                 SOURCE
                    |
               adapter.py
                    |
             raw download
                    |
              checksum/hash
                    |
            object storage
                    |
            parse/validate
                    |
            normalize/CRS
                    |
             quality check
                    |
             derived data
                    |
             PostgreSQL
                    |
             tile generation
                    |
               API/GIS
```

## Raw vs curated

Never mix them.

```text
/raw
/normalized
/derived
/tiles
/metadata
```

---

# 37. Source adapter interface

Every provider should implement the same conceptual interface.

```python
class SourceAdapter:
    provider: str
    dataset: str

    def discover(self): ...
    def metadata(self): ...
    def fetch(self, request): ...
    def validate(self, payload): ...
    def normalize(self, payload): ...
    def provenance(self, payload): ...
```

Example:

```python
class IncoisOSFAdapter(SourceAdapter):
    provider = "INCOIS"
    dataset = "OSF"

    def discover(self):
        ...

    def fetch(self, request):
        ...

    def normalize(self, payload):
        ...
```

---

# 38. Recommended technical stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- MapLibre GL JS
- deck.gl
- a charting library

## Backend

- Python
- FastAPI
- Pydantic

## Geospatial database

- PostgreSQL
- PostGIS

## Cache/queues

- Redis
- Celery / RQ / Dramatiq / equivalent

## Scientific processing

- xarray
- NumPy
- pandas
- rasterio
- pyproj
- geopandas
- shapely
- GDAL

## Raster/tiles

- Cloud-Optimized GeoTIFF
- TiTiler
- GeoServer where appropriate
- PMTiles/vector tiles

## Object storage

- MinIO for self-hosted/FOSS deployments
- S3-compatible storage if cloud-hosted

## Auth

- Keycloak or another standards-based IdP

## Monitoring

- Prometheus
- Grafana

## Deployment

- Docker
- Docker Compose initially
- Kubernetes only after scale justifies it

---

# 39. Coordinate reference systems

Use **WGS 84 / EPSG:4326** as the canonical geographic coordinate representation for external APIs unless a source requires otherwise.

For web maps:

- Web Mercator / EPSG:3857

For analysis:

- use appropriate projected CRS for distance/area where necessary
- never calculate accurate Indian coastal distances from raw degree differences

### Data model

Store source CRS and transformed CRS in metadata.

---

# 40. Raster strategy

Use:

```text
Raw scientific raster
        |
        +--> NetCDF/Zarr archive
        |
        +--> analysis
        |
        +--> COG
        |
        +--> tile service
```

Do not render huge NetCDF files directly in the browser.

Generate:

- pyramids/overviews
- tiled rasters
- appropriate resampling

---

# 41. Vector strategy

For moderate datasets:

- PostGIS
- GeoJSON for small query results
- MVT/vector tiles for maps

For large static data:

- GeoParquet
- PMTiles

Avoid sending thousands of polygon geometries as raw GeoJSON to the browser.

---

# 42. API architecture

Base:

```text
/api/v1/
```

## Endpoints

### Forecast

```text
GET /api/v1/forecast/waves
GET /api/v1/forecast/wind
GET /api/v1/forecast/currents
GET /api/v1/forecast/sst
GET /api/v1/forecast/tide
GET /api/v1/forecast/point
```

### Fisheries

```text
GET /api/v1/fisheries/pfz
GET /api/v1/fisheries/landing-centres
GET /api/v1/fisheries/effort
GET /api/v1/fisheries/restrictions
```

### Aquaculture

```text
GET /api/v1/aquaculture/sites
GET /api/v1/aquaculture/zones
GET /api/v1/aquaculture/health
```

### Maritime

```text
GET /api/v1/vessels
GET /api/v1/vessels/{id}
GET /api/v1/vessels/{id}/track
GET /api/v1/ports
GET /api/v1/navigation-warnings
```

### Hazards

```text
GET /api/v1/hazards
GET /api/v1/hazards/cyclones
GET /api/v1/hazards/tsunami
GET /api/v1/hazards/high-waves
GET /api/v1/hazards/storm-surge
GET /api/v1/hazards/mhw
GET /api/v1/hazards/hab
GET /api/v1/hazards/oil-spill
```

### GIS

```text
GET /api/v1/search
GET /api/v1/nearby
POST /api/v1/spatial/query
POST /api/v1/routes/forecast
```

### Datasets

```text
GET /api/v1/datasets
GET /api/v1/datasets/{id}
GET /api/v1/datasets/{id}/metadata
GET /api/v1/datasets/{id}/download
```

---

# 43. OpenAPI

Every public API must generate OpenAPI documentation.

Include:

- parameters
- geometry schema
- datetime schema
- units
- nullable fields
- provenance
- error responses
- rate limits
- attribution requirements
- source links

Example response:

```json
{
  "data": [...],
  "source": {
    "provider": "INCOIS",
    "dataset": "OSF",
    "issued_at": "2026-09-22T...Z"
  }
}
```

---

# 44. API caching

Use different TTLs according to source update frequency.

Examples:

```text
Realtime/near-realtime
    1–10 minutes

Hourly forecast
    30–60 minutes

Daily advisory
    until next source update

Static boundary
    days/months

GEBCO
    release/version based
```

Never cache a forecast indefinitely without marking its issue/validity time.

---

# 45. Authentication

## Public

No login:

- map
- public forecasts
- public warnings
- public datasets

## Account

Login for:

- favorites
- alerts
- saved maps
- saved routes
- user preferences

## Authorized

Separate RBAC/ABAC for any legally restricted data.

```text
anonymous
registered_user
researcher
organization_user
operator
administrator
```

Do not grant a user restricted data solely because they created an account.

---

# 46. Favorites

Replicate BarentsWatch's simple star model.

Users can favorite:

- locations
- ports
- vessels
- aquaculture sites
- landing centres
- datasets
- routes

Schema:

```text
favorite
--------
user_id
object_type
object_id
created_at
```

---

# 47. Saved maps

A saved map should contain:

```json
{
  "name": "Mumbai fisheries view",
  "center": [72.8, 19.0],
  "zoom": 8,
  "layers": ["pfz", "waves", "protected_areas"],
  "filters": {},
  "time": "2026-09-23T06:00:00Z"
}
```

Allow:

- private
- shared-with-link
- organization-shared

only when source-data terms permit displaying the layer to other users.

---

# 48. Alerts

## User-created alerts

Examples:

```text
Wave height > 2 m
within 100 km of Mumbai
```

```text
Cyclone warning intersects Maharashtra
```

```text
New PFZ advisory within 150 km of selected harbour
```

```text
Tsunami bulletin affects selected region
```

## Alert engine

```text
source event
     |
normalize
     |
spatial test
     |
user subscription match
     |
notification
```

---

# 49. Notification channels

Potential channels:

- in-app
- browser push
- email
- SMS through an authorized provider
- Telegram through official bot/API
- WhatsApp only through a compliant official/authorized API provider

For safety-critical messages, always preserve the source bulletin wording/link and timestamp; do not substitute an AI summary as the only alert.

---

# 50. AI / MarineWatch AI

This should be a **query/planning layer**, not the source of truth.

## Architecture

```text
User question
    |
    v
Intent/slot extraction
    |
    v
Structured query
    |
    +--> PostGIS
    +--> forecast APIs
    +--> hazard index
    +--> dataset catalogue
    |
    v
Grounded result
    |
    +--> map
    +--> table
    +--> chart
    +--> source citations
```

## Example

User:

> Show high-PFZ areas within 100 km of Mumbai with tomorrow-morning wave height below 1.5 m.

Planner produces:

```json
{
  "region": "Mumbai",
  "radius_km": 100,
  "pfz": "latest",
  "forecast_date": "tomorrow",
  "time_window": ["06:00", "12:00"],
  "wave_height_max_m": 1.5
}
```

Then the backend executes the query.

---

# 51. AI response contract

Every grounded answer should contain:

```text
Answer
Relevant map result
Relevant numbers
Time/validity
Sources
Data freshness
Limitations
```

Example:

> 6 PFZ areas match the selected spatial and forecast filters.
>
> Forecast source: INCOIS OSF.
> PFZ source: INCOIS PFZ advisory.
> Retrieved: 23 Sep 2026 06:10 IST.
>
> These results are informational and do not replace official navigation/fisheries instructions.

---

# 52. AI safety constraints

The model must not:

- invent a warning
- invent an official restriction
- infer a legal prohibition from a generic environmental layer
- issue a tsunami/cyclone warning in its own voice
- expose private/restricted records
- claim a forecast is current if stale
- merge two conflicting datasets without showing the conflict

The model should say:

> The integrated public datasets do not contain a matching warning.

rather than:

> There is no danger.

---

# 53. Marine Situation panel

One of the best BarentsWatch-derived ideas is a point/location profile.

When a user clicks the map:

```text
Location
Coordinates

Current conditions
  Wind
  Waves
  Current
  SST
  Tide

Fisheries
  PFZ
  fishing activity
  restrictions

Aquaculture
  nearby sites

Navigation
  warnings
  fairways
  ports

Environment
  protected areas
  water quality
  HAB/MHW

Hazards
  cyclone
  tsunami
  storm surge

Sources
  last update
```

This can become the central UI abstraction used across every module.

---

# 54. Nearby engine

For every point, support:

- vessels within X km
- ports within X km
- landing centres within X km
- farms within X km
- protected areas within X km
- warnings intersecting X km
- PFZ within X km
- infrastructure within X km

PostGIS example:

```sql
SELECT *
FROM ports
WHERE ST_DWithin(
  geom::geography,
  ST_SetSRID(ST_Point(:lon, :lat), 4326)::geography,
  :radius_m
);
```

---

# 55. Search engine

Provide unified search for:

- port
- harbour
- district
- state
- landing centre
- aquaculture site
- vessel
- dataset
- warning
- geographic coordinates

Search examples:

```text
Mumbai
18.92,72.83
Kochi port
PFZ Maharashtra
Aqua farm Andhra Pradesh
```

Use exact coordinate detection where possible.

---

# 56. Measurement tools

Replicate GIS basics:

- distance
- area
- bearing
- coordinates
- route length
- radius circle

Use a geodesic library for geographic distance/bearing.

---

# 57. Map controls

Include:

- zoom in/out
- locate
- fullscreen
- layer manager
- opacity
- legend
- identify
- measure distance
- measure area
- draw point
- draw line
- draw polygon
- search
- time slider
- basemap selector
- print/export
- share map
- map settings
- language

---

# 58. Legends

Every thematic layer needs:

```text
Legend

symbol
colour/category
unit
value range
source
last updated
```

Never use colors without a legend for scientific categories.

---

# 59. Unit handling

Store canonical SI/scientific units.

Allow UI conversion for:

- m/s ↔ knots
- metres ↔ nautical miles
- degrees ↔ degrees/minutes/seconds
- Celsius/Fahrenheit if desired
- other domain units where relevant

Internally keep one canonical unit per field.

---

# 60. Time handling

Store timestamps internally in UTC.

Display:

- IST for Indian users
- local source time where relevant
- explicit timezone label

Do not silently mix:

```text
UTC
IST
source local time
```

A forecast record should carry:

```text
issued_at_utc
valid_time_utc
source_timezone
```

---

# 61. Forecast runs

Never overwrite forecasts blindly.

Use:

```text
forecast_run
--------------
run_id
source
issued_at
model_version
product_version
```

and:

```text
forecast_value
----------------
run_id
valid_time
geometry/grid_cell
variable
value
unit
```

Then you can compare:

```text
Forecast issued Sep 22
vs
Forecast issued Sep 23
```

This is extremely valuable for researchers.

---

# 62. Data versioning

For static/slow datasets:

- version
- checksum
- source publication date
- ingestion date
- superseded date

Never delete old versions if they are necessary for reproducibility.

---

# 63. Download subsystem

Users should be able to download only datasets whose terms permit redistribution/access.

Formats:

### Vector

- GeoJSON
- GeoPackage
- GeoParquet
- CSV for points

### Raster

- GeoTIFF
- COG
- NetCDF

### Forecast

- NetCDF
- CSV subset
- JSON subset

### Research

- source-native format when permitted

Every download should include a metadata sidecar where useful:

```text
README.txt
metadata.json
```

---

# 64. Data export provenance

An exported file should contain:

```text
Dataset
Provider
Source URL
Version
Retrieved time
Filters applied
Bounding box
Time range
Processing version
License
Attribution
```

This makes exports reproducible.

---

# 65. Object-storage layout

Recommended:

```text
bucket: marinewatch

/raw/incois/osf/...
/raw/incois/pfz/...
/raw/imd/marine/...
/raw/mosdac/...
/raw/gebco/2026/...
/raw/cmfri/...
/raw/caa/...

/normalized/ocean/...
/normalized/fisheries/...
/normalized/aquaculture/...

/derived/pfz/...
/derived/hazards/...
/derived/tiles/...

/metadata/...
```

---

# 66. Database domain model

```text
users
organizations
favorites
saved_maps
saved_routes
subscriptions

sources
source_datasets
source_runs
source_health

geographies
ports
landing_centres
vessels

forecasts
forecast_runs
forecast_values
observations

aquaculture_sites
aquaculture_zones
fishery_activity
pfz_advisories
fishery_regulations

protected_areas
coastal_layers
water_quality
marine_ecology

hazards
hazard_events
warning_bulletins

spatial_plans
energy_zones

api_clients
audit_log
```

---

# 67. Important database indexes

At minimum:

```text
GIST geometry indexes
B-tree timestamp indexes
B-tree source_dataset_id
B-tree region/state
compound (source, valid_time)
```

For vessel tracks:

```text
(vessel_id, time)
```

For forecast grids:

- partition by run/date/product
- raster-optimized storage outside ordinary row tables where appropriate

---

# 68. Database partitions

Partition high-volume temporal tables.

Examples:

```text
vessel_positions_2026_09
forecast_values_2026_09
observations_2026_09
```

Do not partition tiny administrative tables just because partitioning exists.

---

# 69. ETL scheduling

Use source-specific schedules.

```text
Every 5–10 min
  dynamic feeds if legally/technically available

Hourly
  hourly forecast products

3-hourly
  operational forecast runs where applicable

Daily
  advisories/statistics/products

Weekly
  slower environmental layers

Fortnightly
  NHO catalogue checks

Monthly/quarterly
  statistical data

On release
  GEBCO/static datasets
```

The exact cadence must come from the source's documented publication/update behavior; don't poll a daily source every minute.

---

# 70. Change detection

For each source run:

```text
fetch
  |
compare checksum
  |
if changed:
    parse
    validate
    version
    publish
else:
    record no-change
```

For APIs, compare:

- schema
- record count
- last-update timestamp
- field names

---

# 71. Source schema drift

External agencies can change websites/APIs.

Build an adapter test suite:

```text
source fixture
    |
expected variables
expected units
expected geometry
expected timestamps
    |
CI test
```

Fail the ingestion job before publishing corrupted data.

---

# 72. API rate limiting

Your API should have:

- anonymous rate limits
- user rate limits
- API-key rate limits
- burst controls
- pagination
- geometry-size limits
- time-range limits

Don't expose direct upstream credentials to browsers.

---

# 73. Frontend architecture

```text
app/
  map/
  forecast/
  fisheries/
  aquaculture/
  hazards/
  ports/
  vessels/
  coastal/
  data/
  planning/
  ai/
```

Reusable components:

```text
MapShell
LayerPanel
Legend
Timeline
FilterPanel
PointPanel
DatasetCard
SourceBadge
FreshnessBadge
ChartPanel
WarningCard
```

---

# 74. Map state model

Store a single normalized state:

```ts
interface MapState {
  center: [number, number]
  zoom: number
  activeLayers: string[]
  opacity: Record<string, number>
  filters: Record<string, unknown>
  selectedDate?: string
  selectedTime?: string
  basemap: string
}
```

This makes saved maps and sharing straightforward.

---

# 75. Layer registry

Don't hard-code layer behavior into UI components.

Create:

```json
{
  "id": "incois.pfz",
  "title": "Potential Fishing Zone",
  "category": "fisheries",
  "source": "INCOIS",
  "type": "vector",
  "time_enabled": true,
  "download": true,
  "api": true,
  "access": "open_service",
  "license": "source_defined"
}
```

The UI renders from the registry.

---

# 76. Service pages

Each service should have:

```text
Header
Map
Layer manager
Filters
Timeline
List/analytics panel
Source panel
About
Settings
Favorites
Downloads
```

This reproduces the reusable UX pattern visible throughout BarentsWatch.

---

# 77. Dataset page

For a dataset:

```text
Title
Description
Provider
Coverage
Spatial resolution
Temporal resolution
Variables
Update frequency
Last update
Last checked
Access class
License
Attribution
API
Downloads
Known limitations
```

---

# 78. Data source health page

Administrators need:

```text
Provider
Dataset
Last successful run
Expected interval
Current status
Consecutive failures
Schema changes
Last error
Rows/files imported
```

This is not necessarily public.

---

# 79. Audit log

Record:

- administrative changes
- source registry changes
- API access events where appropriate
- licence changes
- data deletion/retention events
- user role changes
- published derived-model versions

Do not log unnecessary personal data.

---

# 80. Legal/licensing registry

This is one of the most important subsystems.

A `dataset_licence` record should include:

```text
provider
license_name
license_url
access_class
redistribution_allowed
commercial_allowed
attribution_required
share_alike
caching_allowed
derived_data_allowed
API_allowed
rate_limit
application_required
approval_required
fee_possible
last_verified
```

The frontend should be able to query this before enabling:

```text
[Download]
[Share]
[API]
```

---

# 81. Recommended initial license classifications

### GEBCO_2026

- OPEN
- free
- public-domain status stated by GEBCO
- attribution required

Source: https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid

### OpenStreetMap

- OPEN under ODbL
- attribution
- database share-alike obligations for qualifying derived databases

### Global Fishing Watch API

- OPEN_ACCOUNT
- noncommercial under current standard terms
- attribution
- rate limits

### MOSDAC

- MIXED
- anonymous Open Data + registered tiers

### INCOIS

- MIXED at organization level
- many operational/public services open
- individual data holdings can have different access states

### CMFRI

- MIXED
- public products + formal request/approval for data requiring it

### Survey of India

- MIXED
- some official boundary data has permissive treatment in policy
- many digital products have licences/pricing

### NHO

- MIXED
- public catalogue/notices
- chart/ENC products controlled/licensed

---

# 82. INCOIS access strategy in implementation

Create these adapter families:

```text
incois/
  erddap.py
  osf.py
  pfz.py
  pat.py
  mhw.py
  abis.py
  coral.py
  jellyfish.py
  water_quality.py
  oosa.py
  storm_surge.py
  sarat.py
  svas.py
  ship_route_forecast.py
  energy_atlas.py
  metadata.py
```

Not every adapter must be implemented on day one.

---

# 83. INCOIS ERDDAP implementation details

Use the live server catalogue rather than assuming old dataset IDs.

Discovery:

```text
GET https://erddap.incois.gov.in/erddap/info/index.html
```

Dataset-specific operations depend on whether the dataset is a table (`tabledap`) or grid (`griddap`).

Example conceptual flow:

```text
catalogue
  |
choose dataset
  |
inspect metadata
  |
check accessibility/license
  |
construct query
  |
request subset
```

The current INCOIS ERDDAP also supports an on-demand file/subset ecosystem. citeturn217454search4turn217454search11

---

# 84. IMD ingestion strategy

### Public pages

Ingest/parse only where usage terms and robots/technical rules permit.

Prefer an official API/feed/file endpoint when available over HTML scraping.

### Public warning object

```text
source
bulletin_type
region
issued_at
valid_from
valid_to
headline
body
source_url
```

### Do not

- infer numeric values from warning images when structured text is available
- OCR everything unless there is no structured alternative
- publish stale warning as active

---

# 85. Bhuvan strategy

Use WMS/WMTS for map visualization where allowed.

The official Bhuvan documentation describes OGC services and lists thematic layers suitable for WMS/WMTS use. citeturn320796search3turn320796search8

Implementation:

```text
Bhuvan layer registry
       |
       +--> direct WMS
       +--> direct WMTS
       +--> optional local cache if terms permit
```

Use a proxy only when necessary to avoid CORS/credential issues and when the source terms allow it.

---

# 86. GEBCO strategy

Download/crop the Indian region once per release.

```text
GEBCO_2026
     |
crop Indian ocean region
     |
COG + contours
     |
PostGIS metadata
     |
map tiles
```

Keep GEBCO release ID in your metadata.

---

# 87. CMFRI strategy

Phase 1:

- public statistics
- published annual data
- published reports

Phase 2:

- formal request for specific useful datasets

Phase 3:

- ingest approved data with contract/licence metadata

Never make a request-controlled dataset appear on the public map until the redistribution terms explicitly allow it.

---

# 88. CAA strategy

Phase 1:

- public farm-registration page discovery
- manually/officially sourced public data where terms permit

Phase 2:

- structured/bulk farm data if CAA provides or approves it

Phase 3:

- integrate approved aqua-mapping/zoning GIS layers

---

# 89. NCSCM strategy

Phase 1:

- approved/public CZMP maps
- official coastal planning documents

Phase 2:

- public geospatial services

Phase 3:

- requested research layers when access is granted

Keep map scale/legal status explicit.

---

# 90. NHO strategy

Phase 1:

- online chart catalogue
- Notices to Mariners

Phase 2:

- licensed chart/ENC integration if you obtain the licence

Phase 3:

- route/navigation products subject to licensing and operational agreements

---

# 91. Government-data discovery engine

Create a crawler/indexer only for **official metadata/catalogue pages**, not indiscriminate scraping.

Source groups:

```text
INCOIS
IMD
MOSDAC
Bhuvan
CMFRI
CAA
NCSCM
NCCR
Department of Fisheries
data.gov.in
NHO
```

Index:

- dataset title
- provider
- description
- URL
- API URL
- download URL
- format
- update date
- coverage
- access
- licence

---

# 92. Data catalogue quality score — do not use ranking

Do **not** rank sources as “best” or “worst.”

Instead expose factual metadata:

- officiality
- spatial resolution
- temporal resolution
- freshness
- access class
- licence
- known caveats

For example:

```text
Official government source: Yes
Last updated: 23 Sep 2026
Spatial resolution: source-defined
License: source-defined
Redistribution: source-defined
```

---

# 93. Research reproducibility

Every derived result should record:

```text
input datasets
input versions
query geometry
query time
algorithm version
model parameters
software version
```

For an AI response:

```text
AI model version
retrieved data timestamps
query plan
source datasets
```

---

# 94. Experimental models

You can add your own models later.

Examples:

- PFZ research model
- fishing-effort forecast
- aquaculture disease-risk model
- pollution trajectory ensemble
- route-risk analysis
- coastal erosion trend model

But every such layer must say:

```text
MODEL-DERIVED
NOT AN OFFICIAL GOVERNMENT PRODUCT
```

and show model version/training data/date.

---

# 95. Marine energy

Integrate INCOIS Ocean Energy Atlas where current access and terms permit.

Potential layers:

- wind resource
- wave energy
- tidal/current resource
- other ocean-energy variables exposed by the atlas

Use it in Marine Spatial Planning together with:

- shipping
- fishing
- aquaculture
- protected areas
- bathymetry
- coastal infrastructure

---

# 96. Marine Spatial Planning engine

Inputs:

```text
protected areas
fishing activity
ports
shipping/fairways
aquaculture
energy resource
bathymetry
coastal regulation
infrastructure
environment
```

Outputs:

```text
candidate zones
conflicts
constraint map
layer intersections
analysis report
```

Do not output legal approvals. Output **spatial analysis**.

---

# 97. Constraint model

Represent every planning layer as one or more of:

```text
EXCLUSION
PREFERENCE
CAUTION
INFORMATION
```

Example:

```text
Protected area → EXCLUSION for specific activity if the official rule says so
Shipping lane → CAUTION/constraint depending on authoritative regulation
Fishing activity → INFORMATION/CONFLICT INDICATOR unless a legal rule applies
```

This prevents analytical layers from being mistaken for law.

---

# 98. Marine ecology profile

Click a point:

```text
Marine ecology

Protected area
Coral
Seagrass
Mangrove
Habitat
Water quality
Chlorophyll
MHW
HAB
```

This is useful for research and environmental planning.

---

# 99. Fishing analytics

Implement:

- catch trends
- species composition
- gear composition
- seasonal variation
- state comparison
- landing-centre trends
- fishing-effort trends

Use only datasets whose granularity permits those analyses.

Do not infer exact vessel-level catch from aggregated statistics.

---

# 100. PFZ analytics

With sufficient historical data:

- PFZ frequency by region
- PFZ persistence
- distance from harbour
- relationship with SST/chlorophyll
- monthly patterns
- historical advisory density

Do not present this as proof of future catch.

---

# 101. Ocean observation dashboard

Use public observation datasets to show:

```text
Buoys
Argo
Tide gauges where available
Wave buoys
HF radar where access permits
Weather stations
```

Dashboard:

```text
Stations online
Latest observation
Parameter chart
Data age
```

---

# 102. Observation vs forecast distinction

Always visually distinguish:

```text
OBSERVED
FORECAST
NOWCAST
ANALYSIS/REANALYSIS
MODEL-DERIVED
```

This should be a core design rule.

---

# 103. Confidence and freshness

Do not invent “confidence” numbers unless the source supplies them or your algorithm formally computes them.

You may show:

```text
Freshness: 8 minutes old
Source health: Healthy
Observation/Forecast: Forecast
```

rather than an unsupported 97% confidence score.

---

# 104. Offline capability

India MarineWatch can eventually support offline data packages for fishermen/researchers.

Possible package:

```text
selected coast
+
base map
+
recent forecast
+
regulations
+
ports
+
landing centres
```

Do not include data whose licence prohibits offline redistribution.

---

# 105. Mobile-first fisherman interface

Create a simplified mobile view:

```text
HOME

📍 My Location
🌊 Sea conditions
🐟 PFZ
⚠️ Warnings
🗺 Map
⭐ Favourites
```

Keep the full scientific map for desktop users.

---

# 106. Multilingual architecture

Use message IDs, not hard-coded text.

```text
English
Hindi
Marathi
Gujarati
Malayalam
Tamil
Telugu
Kannada
Odia
Bengali
Assamese
+ others as translated
```

Store advisory source text separately from your UI translation.

Never translate official warning text in a way that changes meaning without a clearly marked translation.

---

# 107. Accessibility

Implement:

- keyboard navigation
- screen-reader labels
- high contrast
- non-colour-only warning encoding
- text alternative to map symbols
- scalable UI
- large touch targets
- downloadable accessible tables

---

# 108. Security

Minimum:

- TLS
- secure cookies
- CSRF protection where applicable
- JWT/OIDC validation
- rate limiting
- secrets in environment/secret manager
- database least privilege
- object-storage access controls
- audit log
- API key hashing/rotation
- dependency scanning

---

# 109. Secrets

Never put provider secrets in the frontend.

```text
Browser
   X
provider API secret

Browser
   |
   v
India MarineWatch backend
   |
secret vault/env
   |
provider
```

---

# 110. Disaster recovery

For critical source ingestion:

- retain raw source files
- daily database backup
- periodic object-store backup
- migration scripts
- infrastructure-as-code
- restore tests

---

# 111. Testing

## Adapter tests

- source available
- schema expected
- units expected
- coordinates valid
- timestamps parse

## GIS tests

- buffer
- intersection
- CRS transform
- route crossing

## Frontend tests

- layer toggling
- time slider
- filters
- popup/profile
- mobile map

## AI tests

- source-grounded query execution
- no hallucinated warnings
- refusal to answer unsupported legal/safety conclusions

---

# 112. Observability

Track:

```text
requests
errors
latency
upstream errors
ingestion failures
source freshness
query durations
tile performance
AI query latency
```

Dashboards:

- system health
- source health
- API health
- data freshness
- ingestion health

---

# 113. Cost control

The expensive components are:

- large raster storage
- map tiles
- high-frequency AIS
- satellite archives
- high-volume forecast grids
- notifications
- AI inference

Control cost using:

- spatial subsetting
- temporal subsetting
- immutable raw archives only where needed
- pre-generated tiles
- cache
- CDN
- source WMS where redistribution is not allowed
- on-demand processing

---

# 114. Do not mirror everything

The system should follow:

```text
Discover everything
        |
        v
Catalogue everything you can identify
        |
        v
Select high-value datasets
        |
        v
Mirror approved/public datasets
        |
        v
Proxy licensed/remote services where permitted
```

This is far more sustainable than blindly copying every dataset.

---

# 115. Source selection for the MVP

## Must-have

1. INCOIS OSF
2. INCOIS PFZ
3. INCOIS ERDDAP public datasets
4. INCOIS PAT/tide
5. INCOIS marine hazard products
6. IMD fishermen/port/sea-area warnings
7. GEBCO bathymetry
8. Bhuvan public WMS/WMTS
9. OpenStreetMap
10. public fisheries statistics

## Strong next wave

11. MOSDAC open datasets
12. CMFRI public fisheries products
13. CAA public farm registry
14. NHO catalogue + Notices to Mariners
15. INCOIS water quality
16. INCOIS ABIS
17. INCOIS marine heatwaves
18. INCOIS OOSA

## Later / request or license

19. CMFRI high-resolution requested datasets
20. IMD historical/bulk marine datasets
21. NCSCM restricted foundation datasets
22. licensed nautical ENC/charts
23. live/licensed AIS feeds
24. privileged MOSDAC datasets
25. restricted government operations

---

# 116. Maharashtra-first implementation

Because a student project needs a bounded geographic domain, the first operational region should be:

```text
Maharashtra
Goa
Gujarat
Karnataka
Kerala
```

Then expand to:

```text
Tamil Nadu
Andhra Pradesh
Odisha
West Bengal
Andaman & Nicobar
Lakshadweep
```

A Maharashtra-first UI can immediately demonstrate:

- Mumbai
- Navi Mumbai
- Ratnagiri
- Sindhudurg
- Goa coastline
- PFZ
- Arabian Sea forecasts
- IMD warnings
- ports/harbours
- bathymetry

without requiring national-scale storage.

---

# 117. MVP screens

```text
/
Home / Marine Situation

/map
Unified GIS

/forecast
Ocean Forecast

/fisher
FisherWatch

/aquaculture
AquaWatch

/hazards
Marine Hazards

/ports
PortWatch

/vessels
ShipWatch

/coast
CoastalWatch

/planning
Marine Spatial Planning

/data
Data Catalogue

/ai
MarineWatch AI
```

---

# 118. Home dashboard

Recommended cards:

```text
Current marine conditions
Active marine warnings
Today's PFZ
Cyclone status
High-wave areas
Marine heatwave
HAB status
Nearby ports
Nearby vessels (if available)
Recently updated datasets
```

The home screen should answer:

> **What is happening in India's marine domain right now?**

---

# 119. Map UX

Desktop:

```text
+--------------------------------------------------+
| Search | Coordinates | Time | Share | Settings  |
+----------------------+---------------------------+
| Layers               |                           |
| Filters              |         MAP               |
|                      |                           |
|                      |                           |
+----------------------+---------------------------+
| Timeline             | Point/profile side panel  |
+----------------------+---------------------------+
```

Mobile:

```text
MAP

Bottom sheet:
Layers
Forecast
Warnings
Point details
```

---

# 120. The point-information architecture

This is the reusable core.

```text
Point clicked
     |
     +--> geography
     +--> ocean forecast
     +--> weather
     +--> tide
     +--> fisheries
     +--> aquaculture
     +--> environment
     +--> hazards
     +--> infrastructure
     +--> navigation
     |
     v
Unified Point Profile
```

Every service should use the same concept.

---

# 121. The list/map architecture

Replicate BarentsWatch's useful duality:

```text
Map View | List View
```

List columns vary by service.

Example FisherWatch:

```text
PFZ area | distance | depth | date | source
```

FishHealth:

```text
Site | disease | lice | treatment | week
```

Ports:

```text
Port | waves | wind | tide | warning
```

---

# 122. Filters

Filters must be:

- source-aware
- dataset-aware
- persisted in URL/share state where safe
- resettable
- explainable

Every filter should show:

```text
Why this filter exists
What dataset it affects
```

---

# 123. Complex filters

Support:

```text
AND
OR
NOT
```

Example:

```text
(PFZ = active)
AND
(wave_height < 1.5)
AND
(distance_to_harbour < 100 km)
```

Backend translates this to validated query objects, not arbitrary SQL from users.

---

# 124. Query DSL

Define a safe internal JSON query language.

```json
{
  "and": [
    {"field": "pfz.active", "op": "eq", "value": true},
    {"field": "wave.height", "op": "lt", "value": 1.5}
  ]
}
```

The API then maps this to PostGIS/scientific backends.

---

# 125. Spatial selection tools

Offer:

- point
- circle
- rectangle
- polygon
- route
- admin area
- buffer around feature

Every selection produces:

```text
geometry
area
perimeter
coordinate summary
```

---

# 126. Reporting

Allow user to generate a factual report:

```text
India MarineWatch Situation Report

Area
Time
Weather
Ocean
Warnings
Fisheries
Environment
Infrastructure
Sources
Data timestamps
```

Output:

- PDF
- HTML
- JSON

Make clear that the report is an **aggregation of source information**, not an official bulletin.

---

# 127. Shareable URLs

A map URL should encode:

- center
- zoom
- layer state
- filters
- date/time
- selected object ID

Example concept:

```text
/map?lat=19.0&lon=72.8&z=8&layers=pfz,waves&time=...
```

Do not put secrets or private dataset identifiers in URLs.

---

# 128. Data source attribution UI

Every map layer should have a small source indicator.

Example:

```text
PFZ
Source: INCOIS
Updated: 23 Sep 2026
```

For mixed map views, provide a source drawer listing all active layers.

---

# 129. Data conflicts

When sources disagree:

```text
⚠ Source discrepancy

INCOIS: 1.4 m wave
Other source: 1.7 m wave

Different forecast products/models.
See sources.
```

Do not silently choose one and conceal the disagreement.

---

# 130. Missing data

Use explicit states:

```text
No data
Not covered
Data delayed
Access restricted
Source offline
Not applicable
```

These must not all display as `null`.

---

# 131. Access-restricted data UX

For a dataset requiring approval:

```text
This dataset is not publicly accessible.

Source: CMFRI
Access: formal data request required

[Official access instructions]
```

Don't expose a fake download button.

---

# 132. Source application tracker — internal

For your own project management, store:

```text
source
contact
application date
purpose
requested dataset
status
approval date
licence
expiry
redistribution terms
```

This is useful when you start requesting CMFRI/IMD/NCSCM/licensed data.

---

# 133. Current source access snapshot — 23 Sep 2026

This is a planning snapshot, not a permanent legal statement.

### Open/public starting points

- INCOIS public forecasts/advisories
- public INCOIS ERDDAP datasets
- public INCOIS WebGIS products
- public IMD marine forecasts/warnings
- Bhuvan public WMS/WMTS layers
- GEBCO_2026
- OpenStreetMap
- public CAA farm-search information
- NHO online catalogue and public notices

### Account/API access

- MOSDAC registered tiers
- data.gov.in API use
- Global Fishing Watch APIs
- selected specialized INCOIS services

### Request/approval

- CMFRI data-request datasets
- IMD historical/bulk datasets where procurement/request is required
- some NCSCM foundation datasets

### Licensing/restricted

- some Survey of India digital products
- some NHO chart/ENC products
- sensitive/restricted maritime or government operational data
- certain MOSDAC privileged data

---

# 134. Current access evidence

### INCOIS ERDDAP

Current server documentation says ERDDAP provides consistent programmatic access to scientific data and the active-dataset catalogue identifies public accessibility. citeturn217454search4turn217454search6

### MOSDAC

Current policy distinguishes anonymous Open Data from registered general and privileged data tiers. citeturn217454search7

### CMFRI

Current policy requires a formal request to the Director for data needing that route and states that charges may depend on dataset type/volume/resolution. citeturn729746search0

### GFW

Current standard API use is noncommercial and self-registration is available for most APIs; some require additional approval. citeturn320796search7turn320796search5

### GEBCO

The 2026 grid is public domain/free under its terms, with attribution requirements. citeturn729746search3turn729746search5

### Survey of India

Current geospatial guidelines are permissive for standard political boundary data, while current SOI product pages also list licences/pricing for many digital products. citeturn729746search7turn217454search10

---

# 135. Source URL registry

## INCOIS

- Home: https://www.incois.gov.in/
- Forecast catalogue: https://www.incois.gov.in/site/forecast.jsp
- OSF: https://www.incois.gov.in/oceanservices/osfforecast.jsp
- OSF service: https://www.incois.gov.in/site/services/osf.jsp
- ERDDAP: https://erddap.incois.gov.in/erddap/
- PFZ: https://www.incois.gov.in/MarineFisheries/PfzAdvisory
- ORCA: https://incois.gov.in/site/ORCA/index.html
- Tsunami: https://tsunami.incois.gov.in/
- OOSA: https://oosa.incois.gov.in/

## IMD

- Marine forecast: https://mausam.imd.gov.in/responsive/marine_forecast.php
- Text marine bulletins: https://mausam.imd.gov.in/responsive/text_bulletins.php
- Data Service Portal: https://dsp.imdpune.gov.in/

## MOSDAC

- Home: https://www.mosdac.gov.in/
- Data access policy: https://www.mosdac.gov.in/data-access-policy

## Bhuvan

- Home: https://bhuvan.nrsc.gov.in/
- WMS docs: https://bhuvan.nrsc.gov.in/wiki/index.php/How_to_use_WMS_services
- Thematic data: https://bhuvan.nrsc.gov.in/wiki/index.php/Thematic_Data

## Survey of India

- Geospatial guidelines: https://onlinemaps.surveyofindia.gov.in/GeospatialGuidelines.aspx
- Digital data pricing: https://surveyofindia.gov.in/pages/pricing-of-digital-data

## GEBCO

- 2026 grid: https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid
- Bathymetry: https://www.gebco.net/data-products/gridded-bathymetry-data

## Hydrographic Office

- Catalogue: https://www.hydrobharat.gov.in/web/guest/online-catalogue

## CMFRI

- Data request: https://www.cmfri.org.in/data-request
- Home: https://www.cmfri.org.in/

## CAA

- Home: https://caa.gov.in/
- Farm registry: https://caa.gov.in/CAA/Farms

## NCSCM

- Home: https://ncscm.res.in/

## GFW

- API docs: https://globalfishingwatch.org/our-apis/documentation/
- Terms/rates: https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits

## data.gov.in

- Home: https://www.data.gov.in/
- Help: https://www.data.gov.in/help

## OpenStreetMap

- https://www.openstreetmap.org/

---

# 136. Source-by-source implementation checklist

## INCOIS

```text
[ ] OSF
[ ] PFZ
[ ] PAT
[ ] ship-route forecast
[ ] location-specific forecast
[ ] water quality
[ ] ABIS
[ ] marine heatwave
[ ] coral bleaching
[ ] jellyfish
[ ] high-wave/swell-surge
[ ] storm surge
[ ] TCHP
[ ] ocean energy atlas
[ ] OOSA
[ ] tsunami/ORCA information
[ ] SARAT access evaluation
[ ] SVAS access evaluation
[ ] ERDDAP catalogue
[ ] ERDDAP public datasets
[ ] observation data catalogue
```

## IMD

```text
[ ] fishermen warnings
[ ] port warnings
[ ] sea area bulletins
[ ] coastal forecast
[ ] forecast graphics
[ ] public observations where permitted
[ ] historical data request evaluation
```

## MOSDAC/ISRO

```text
[ ] public data discovery
[ ] OceanSat/ocean-colour products
[ ] SST products
[ ] other marine EO products
[ ] account-required datasets evaluation
```

## Bhuvan/NRSC

```text
[ ] public WMS
[ ] public WMTS
[ ] thematic data catalogue
[ ] satellite imagery availability
[ ] coastal thematic layers
```

## Fisheries

```text
[ ] CMFRI public statistics
[ ] CMFRI landing centres
[ ] CMFRI requested data application
[ ] Department of Fisheries public datasets
[ ] data.gov.in fisheries APIs
```

## Aquaculture

```text
[ ] CAA farm registry
[ ] CAA aqua-mapping/zoning
[ ] approved/public farm data
[ ] aquaculture environmental context
```

## Coastal

```text
[ ] NCSCM CZMP
[ ] NCSCM public coastal data
[ ] NCCR coastal erosion/environment
```

## Maritime

```text
[ ] NHO catalogue
[ ] Notices to Mariners
[ ] AIS source evaluation
[ ] GFW
```

## Base

```text
[ ] GEBCO
[ ] OpenStreetMap
[ ] Survey of India boundary source
```

---

# 137. What to implement as direct source services vs local data

A common mistake is to insist on downloading everything.

Use this rule.

| Data type | Preferred strategy |
|---|---|
| Dynamic forecast raster | Cache selected subsets/runs locally |
| Daily advisory | Ingest into database + archive source |
| Public WMS | Direct service initially |
| Huge satellite archive | On-demand/object-store subset |
| Static boundary | Local PostGIS copy if terms permit |
| Bathymetry | Local COG crop |
| Large vector | PostGIS/vector tiles |
| Restricted service | Link/proxy only where permitted |
| Licensed product | Store/use under licence, never silently republish |

---

# 138. Data lifecycle

```text
DISCOVER
   ↓
REGISTER
   ↓
CHECK ACCESS
   ↓
CHECK LICENSE
   ↓
TEST SOURCE
   ↓
FETCH
   ↓
ARCHIVE RAW
   ↓
VALIDATE
   ↓
NORMALIZE
   ↓
STORE
   ↓
DERIVE
   ↓
TILE/API
   ↓
PUBLISH
   ↓
MONITOR
   ↓
RE-INGEST
```

---

# 139. Dataset onboarding checklist

For every new dataset:

```text
[ ] Official source identified
[ ] Source owner verified
[ ] Exact product identified
[ ] Access method documented
[ ] Terms/license saved
[ ] Redistribution checked
[ ] API terms checked
[ ] Rate limits checked
[ ] Geographic extent checked
[ ] Temporal extent checked
[ ] Units documented
[ ] CRS documented
[ ] Resolution documented
[ ] Update frequency documented
[ ] Example payload downloaded
[ ] Parser implemented
[ ] QC rules implemented
[ ] Provenance recorded
[ ] UI layer definition created
[ ] Attribution rendered
[ ] Failure alert created
```

---

# 140. Data source registry example

```yaml
id: incois-osf
provider: INCOIS
title: Ocean State Forecast
category: ocean_forecast
source_url: https://www.incois.gov.in/oceanservices/osfforecast.jsp
access_type: open_service
account_required: false
application_required: false
approval_required: false
license: source_defined
redistribution: source_defined
commercial_use: source_defined
update_frequency: operational
spatial_type: gridded
temporal_type: forecast
observation_or_forecast: forecast
status: active
last_verified: 2026-09-23
```

---

# 141. Example dataset metadata

```json
{
  "id": "incois-osf",
  "title": "Ocean State Forecast",
  "provider": "INCOIS",
  "category": "forecast",
  "variables": [
    "wind_speed",
    "wind_direction",
    "wave_height",
    "wave_period",
    "swell_height",
    "swell_period",
    "surface_current",
    "sst",
    "mixed_layer_depth",
    "d20"
  ],
  "status": "active",
  "access": "open_service"
}
```

---

# 142. Ingestion database tables

Recommended minimum:

```sql
CREATE TABLE source_provider (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    url text,
    official boolean,
    notes text
);

CREATE TABLE source_dataset (
    id uuid PRIMARY KEY,
    provider_id uuid REFERENCES source_provider(id),
    external_id text,
    title text NOT NULL,
    access_type text NOT NULL,
    license_name text,
    redistribution_allowed boolean,
    commercial_allowed boolean,
    account_required boolean,
    application_required boolean,
    approval_required boolean,
    last_verified timestamptz
);
```

---

# 143. Source run table

```sql
CREATE TABLE source_run (
    id uuid PRIMARY KEY,
    dataset_id uuid REFERENCES source_dataset(id),
    started_at timestamptz NOT NULL,
    completed_at timestamptz,
    source_published_at timestamptz,
    source_version text,
    checksum text,
    records_received bigint,
    status text NOT NULL,
    error text
);
```

---

# 144. Forecast schema

```sql
CREATE TABLE forecast_run (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL,
    model_version text,
    issued_at timestamptz NOT NULL,
    valid_from timestamptz,
    valid_to timestamptz
);

CREATE TABLE forecast_point_value (
    forecast_run_id uuid NOT NULL,
    valid_time timestamptz NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    variable text NOT NULL,
    value double precision,
    unit text,
    PRIMARY KEY (forecast_run_id, valid_time, lat, lon, variable)
);
```

For true grids, use more appropriate chunked scientific storage instead of exploding every raster cell into a relational row.

---

# 145. Hazard schema

```sql
CREATE TABLE hazard_event (
    id uuid PRIMARY KEY,
    source_dataset_id uuid,
    source_event_id text,
    type text NOT NULL,
    headline text,
    issued_at timestamptz,
    valid_from timestamptz,
    valid_to timestamptz,
    geometry geometry(Geometry, 4326),
    source_url text,
    source_severity text
);
```

---

# 146. Fisheries schema

```sql
CREATE TABLE pfz_advisory (
    id uuid PRIMARY KEY,
    source_dataset_id uuid,
    source_id text,
    advisory_date date,
    sector text,
    reference_landing_centre text,
    water_depth_m double precision,
    geometry geometry(Geometry, 4326),
    source_url text
);
```

---

# 147. Aquaculture schema

```sql
CREATE TABLE aquaculture_site (
    id uuid PRIMARY KEY,
    source_dataset_id uuid,
    external_id text,
    state text,
    district text,
    status text,
    registered_date date,
    valid_until date,
    farm_area_ha double precision,
    water_spread_area_ha double precision,
    geom geometry(Point, 4326)
);
```

Do not store unnecessary personal names/addresses in the public model.

---

# 148. Port schema

```sql
CREATE TABLE port (
    id uuid PRIMARY KEY,
    source_dataset_id uuid,
    external_id text,
    name text,
    state text,
    port_type text,
    geom geometry(Point, 4326),
    source_url text
);
```

---

# 149. Vessel schema

```sql
CREATE TABLE vessel (
    id uuid PRIMARY KEY,
    source_dataset_id uuid,
    mmsi text,
    imo text,
    name text,
    flag text,
    vessel_type text,
    length_m double precision
);

CREATE TABLE vessel_position (
    vessel_id uuid,
    observed_at timestamptz,
    geom geometry(Point, 4326),
    sog_knots double precision,
    cog_deg double precision,
    heading_deg double precision,
    source_dataset_id uuid
);
```

Only populate fields for which your selected source legitimately provides data.

---

# 150. GIS tile architecture

```text
PostGIS
   |
   +--> small query → GeoJSON
   |
   +--> large vector → MVT
   |
   +--> static raster → COG
   |
   +--> raster tiles → tile service
```

Recommended browser path:

```text
MapLibre
  ↓
vector/raster tile endpoint
  ↓
cache/CDN
  ↓
PostGIS/Object store
```

---

# 151. External WMS layer architecture

For source layers that should not be replicated:

```text
MapLibre/Map UI
     |
     v
India MarineWatch layer proxy
     |
     v
Official WMS/WMTS
```

Where a direct browser call is technically possible and source policy permits, direct consumption is simpler. A proxy is not a licence workaround.

---

# 152. Forecast chart component

Use one reusable chart component with:

- time x-axis
- value y-axis
- unit
- source badge
- observed/forecast legend
- last-updated indicator
- timezone selector

Examples:

- wave height
- wind
- SST
- current
- tide

---

# 153. Forecast comparison

Support:

```text
Run A vs Run B
```

Show:

- difference
- source issue time
- same variable/unit
- same geographic point or route

This is a research/analysis feature, not an official forecast product.

---

# 154. Route forecast visualization

On map:

```text
A ========= B ========= C
  \
   \
    high wave segment
```

On profile:

```text
Distance
|
|       ___
|  ____/   \____
|
+------------------ Time/distance
```

Coloring must correspond to a clearly defined source/product threshold or your documented derived threshold.

---

# 155. Fishing effort visualization

Use:

- grid aggregation
- heatmap
- density
- time slider
- effort units

Always show the underlying metric name and data caveats.

GFW's documented APIs include apparent fishing effort, encounters and vessel identity/history. Its current terms permit noncommercial use under the standard licence and impose rate limits. citeturn320796search0turn320796search5

---

# 156. Marine traffic visualization

If a licensed/authorized AIS feed is obtained:

- current positions
- tracks
- vessel categories
- speed
- heading
- historical replay

For an MVP, use low-volume data or a simulated dataset during development rather than building a production dependency on an unauthorized AIS feed.

---

# 157. Navigation warning model

A warning can contain:

```text
warning_id
source
publication_number
nav_area
issued_at
valid_from
valid_to
geometry
headline
body
severity/source category
official_url
```

The map should support:

- all warnings
- warnings in current viewport
- active only
- date range

---

# 158. Official warning disclaimer

For safety/navigation data:

```text
This application aggregates information from official sources.
It is not a substitute for official navigational warnings,
regulations, emergency instructions or professional navigation.
```

Adjust wording to the exact source's requirements.

---

# 159. Marine regulations layer

Represent:

```text
regulation_id
source
name
activity
species
gear
valid_from
valid_to
geometry
source_document
```

Never derive a national legal rule from an unverified news article or crowd-sourced map.

---

# 160. Regulation versioning

Store:

```text
regulation_version
publication_date
supersedes
valid_from
valid_to
```

This prevents historical analyses from using today's restriction for a historical date.

---

# 161. Marine spatial planning data model

```text
planning_layer
----------------
id
activity
constraint_type
source
geometry
valid_from
valid_to
```

Then analysis:

```text
candidate_zone
    intersects protected area?
    intersects route?
    overlaps fishery?
    overlaps aquaculture?
    adequate depth?
```

---

# 162. Marine energy atlas integration

Where access permits:

```text
wind resource
wave resource
tidal/current resource
```

Convert each into common spatial metadata:

```text
resource_type
unit
period
resolution
source
```

Do not invent energy potential from generic wind speed without documenting the conversion model.

---

# 163. Environmental anomaly engine

For products that explicitly supply anomalies:

- SST anomaly
- chlorophyll anomaly
- other source-defined anomalies

Support:

```text
current
historical mean
anomaly
percentile if supplied/calculated
```

When calculating your own baseline, show the baseline period and methodology.

---

# 164. Historical marine dashboard

User selects:

```text
Region: Arabian Sea
Variable: SST
Period: 2000–2026
```

Output:

- map
- time series
- anomaly
- event periods
- data completeness
- source list

---

# 165. Data cube abstraction

Scientific datasets should conceptually be queryable by:

```text
variable
latitude
longitude
time
depth
```

This is the natural model for INCOIS/ERDDAP/scientific data.

---

# 166. NetCDF/Zarr processing

Use xarray:

```python
import xarray as xr

ds = xr.open_dataset("forecast.nc")
subset = ds.sel(
    latitude=slice(8, 22),
    longitude=slice(68, 90)
)
```

Write processed data to a suitable chunked format when size justifies it.

---

# 167. Raster quality control

Check:

- min/max
- nodata
- CRS
- bounds
- time coverage
- units
- unexpected constant fields
- missing forecast times

Example:

```text
wave_height < 0
→ reject
```

unless the source explicitly encodes a special missing value.

---

# 168. Unit normalization

Create a `variable_dictionary`:

```text
wave_height → meter
wind_speed → meter/second
current_speed → meter/second
sst → degree_C
salinity → PSU/source-defined
```

Keep source unit in metadata if converted.

---

# 169. Variable dictionary

Example:

```yaml
wave_height:
  canonical_unit: m
  source_names:
    - significant_wave_height
    - hs
wind_speed:
  canonical_unit: m/s
  source_names:
    - wind_speed
    - wspd
```

Never combine similarly named scientific variables without confirming definitions.

---

# 170. Time-series database option

For very high-volume observations, consider TimescaleDB on PostgreSQL.

Use it only where the workload benefits from it.

PostGIS remains the spatial foundation.

---

# 171. Search index

For unified search, use:

- PostgreSQL full-text search for initial release
- OpenSearch/Elasticsearch later if scale demands it

Index:

- place names
- ports
- datasets
- vessels
- sites
- warnings

---

# 172. Notification architecture

```text
subscriptions
      |
      v
alert evaluator
      |
      v
matching events
      |
      +--> web push
      +--> email
      +--> SMS provider
      +--> Telegram
```

Store delivery status.

---

# 173. Notification reliability

For every notification:

```text
created_at
queued_at
sent_at
delivered_at if provider supports it
failed_at
provider_message_id
```

Retry transient failures, but avoid duplicate safety notifications using an idempotency key.

---

# 174. Scheduled source ingestion jobs

Example Celery beat concepts:

```text
incois_osf_refresh
incois_pfz_refresh
imd_warning_refresh
incois_hazard_refresh
bhuvan_metadata_refresh
nho_catalogue_refresh
```

Schedule according to source behavior.

---

# 175. API response pagination

For large datasets:

```text
limit
cursor
next_cursor
```

Avoid numeric page numbers for fast-changing streams where cursor pagination is safer.

---

# 176. API spatial bounds

Require:

```text
bbox
radius
polygon
region
```

Do not permit unlimited world-sized GeoJSON requests for anonymous users.

---

# 177. API temporal bounds

Require reasonable:

```text
start
end
```

Maximum query windows should depend on dataset type.

---

# 178. API error model

```json
{
  "error": {
    "code": "SOURCE_UNAVAILABLE",
    "message": "INCOIS source is temporarily unavailable",
    "source": "INCOIS",
    "retry_after": 600
  }
}
```

Do not return a false empty dataset when the source actually failed.

---

# 179. Source fallback policy

Do not automatically replace an official source with a completely different unofficial source without telling the user.

Example:

```text
Primary: INCOIS
Fallback: global scientific source

Status:
Primary unavailable; fallback displayed.
```

---

# 180. AI source routing

The AI planner should know:

```text
question → preferred datasets
```

Example:

```text
"wave tomorrow"
 → INCOIS OSF

"fisherman warning"
 → IMD + INCOIS

"bathymetry"
 → GEBCO / authoritative hydrographic data

"fishing effort"
 → GFW/approved fisheries datasets
```

---

# 181. AI tool calls

Do not let the LLM directly compose URLs to arbitrary sources.

Use registered tools:

```text
query_forecast()
query_pfz()
query_hazards()
query_ports()
query_nearby()
query_dataset()
```

Each tool validates its inputs.

---

# 182. AI grounding

Every factual claim in an AI response should map to:

```text
source_dataset_id
source_run_id
feature/value ID
```

For example:

```text
Claim A → INCOIS OSF run 123
Claim B → IMD warning 456
```

---

# 183. AI geospatial execution

Example tool schema:

```json
{
  "name": "query_pfz",
  "description": "Return public PFZ advisories for a specified date and area",
  "parameters": {
    "date": "string",
    "geometry": "GeoJSON"
  }
}
```

---

# 184. AI cannot fabricate data

If tool returns zero results:

```text
No matching records were returned.
```

Not:

```text
There is no PFZ in the area.
```

unless the tool's semantics actually support that universal conclusion.

---

# 185. AI query examples

### Fisheries

> Find PFZ advisories within 100 km of Mumbai for today.

### Forecast

> Show wave height near Ratnagiri from 6 AM to noon tomorrow.

### Planning

> Show protected areas overlapping proposed offshore-energy zones.

### Environment

> What marine heatwave information is currently available near Kerala?

### Port

> What is the forecast around Kochi port for the next three days?

---

# 186. Public-source citation model in UI

Every AI answer should have:

```text
Sources (3)
INCOIS — Ocean State Forecast
IMD — Fishermen Warning
GEBCO — GEBCO_2026
```

Clicking a source opens its official page/catalogue.

---

# 187. Research mode

Create an optional advanced mode:

```text
Research Mode

Dataset selector
Variable selector
Time range
Spatial region
Aggregation
Download
API query
```

This becomes your scientific-data-explorer side of BarentsWatch.

---

# 188. Data notebook integration — future

Eventually allow:

```text
Open dataset in notebook
Copy API query
Download CSV/NetCDF
Copy Python snippet
```

Example:

```python
import requests

url = "YOUR_MARINEWATCH_API"
params = {...}
r = requests.get(url, params=params, timeout=30)
r.raise_for_status()
data = r.json()
```

---

# 189. Developer portal

Create:

```text
/developers
```

Sections:

- authentication
- API reference
- examples
- rate limits
- datasets
- webhooks/alerts
- GIS services
- SDKs
- changelog

---

# 190. SDKs

Later provide:

```text
Python
JavaScript/TypeScript
R
```

The Python SDK matters most for research users.

---

# 191. Webhooks

Future authenticated users can subscribe to:

```text
new_hazard
new_pfz
forecast_updated
dataset_updated
```

Example:

```json
{
  "event": "hazard.updated",
  "hazard_id": "...",
  "source": "IMD",
  "issued_at": "..."
}
```

---

# 192. Event bus

At scale:

```text
source adapters
      |
      v
message/event bus
      |
      +--> database
      +--> alert engine
      +--> websocket
      +--> analytics
```

Initially, simple job queues are enough.

---

# 193. Websocket/live updates

Use websockets for:

- live vessel positions where authorized
- dashboard hazard updates
- ingestion status for admins

Do not stream high-volume external AIS to all browsers directly. Aggregate/filter server-side.

---

# 194. Performance target

For ordinary map interactions aim for:

```text
search < 500ms where cached
point query < 500ms–1s
vector tile < 200–500ms typical
forecast query < 1–2s cached
```

These are engineering targets, not promises and should be measured after implementation.

---

# 195. Scale strategy

### Student/MVP

```text
Docker Compose
PostgreSQL/PostGIS
Redis
FastAPI
Next.js
MinIO
```

### Regional production

Add:

- CDN
- separate workers
- object storage
- tile cache
- read replica

### National scale

Add selectively:

- Kubernetes
- message bus
- distributed scientific processing
- multiple PostGIS/read replicas
- dedicated tile infrastructure

---

# 196. First GitHub repository structure

```text
india-marinewatch/
│
├── apps/
│   ├── web/
│   └── docs/
│
├── services/
│   ├── api/
│   ├── ingestion/
│   ├── tiles/
│   ├── alerts/
│   └── ai/
│
├── packages/
│   ├── schemas/
│   ├── gis/
│   ├── ui/
│   └── sdk-ts/
│
├── adapters/
│   ├── incois/
│   ├── imd/
│   ├── mosdac/
│   ├── bhuvan/
│   ├── cmfri/
│   ├── caa/
│   ├── nscm/
│   ├── nho/
│   ├── gfw/
│   └── openstreetmap/
│
├── db/
│   ├── migrations/
│   ├── seeds/
│   └── functions/
│
├── infra/
│   ├── docker/
│   ├── monitoring/
│   └── deployment/
│
├── data-contracts/
├── docs/
│   ├── sources/
│   ├── architecture/
│   ├── licensing/
│   └── operations/
│
└── scripts/
```

---

# 197. Environment configuration

```env
DATABASE_URL=
REDIS_URL=
OBJECT_STORAGE_URL=
OBJECT_STORAGE_KEY=
OBJECT_STORAGE_SECRET=

INCOIS_*=
IMD_*=
MOSDAC_*=
GFW_API_TOKEN=

KEYCLOAK_URL=
KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET=
```

Never commit these values.

---

# 198. CI/CD

Pipeline:

```text
commit
 ↓
lint
 ↓
type check
 ↓
unit tests
 ↓
adapter tests
 ↓
security scan
 ↓
build containers
 ↓
integration tests
 ↓
deploy
```

Run ingestion tests against fixtures so an upstream website change doesn't silently break production.

---

# 199. Data fixture strategy

Store tiny representative source samples:

```text
fixtures/
  incois_osf_small.nc
  pfz_sample.json
  imd_warning_sample.html
  bhuvan_capabilities.xml
```

Do not place proprietary/restricted full datasets in Git.

---

# 200. Current official access classifications — practical decision table

| Source/product | Use in MVP? | Manual application before initial use? | Main caveat |
|---|---:|---:|---|
| INCOIS public OSF | YES | NO | Verify current terms/product endpoint |
| INCOIS PFZ public service | YES | NO | Advisory is official source product |
| INCOIS ERDDAP public dataset | YES | NO | Check dataset-level accessibility |
| INCOIS ERDDAP nonpublic dataset | NO | MAYBE | Data-access form/restriction |
| INCOIS PAT | YES | NO/public service | Product-specific terms |
| INCOIS MHW/HAB etc. | YES | NO/public service | Verify current endpoint/product |
| INCOIS SARAT | LATER | YES/account | Specialized operational tool |
| INCOIS HF radar data | LATER | YES/registration | Data holding has access controls |
| IMD public marine forecast | YES | NO | Public service |
| IMD historical/bulk data | LATER | REQUEST | Possible data procurement/fees |
| MOSDAC Open Data | YES | NO | Open subset only |
| MOSDAC registered-general | LATER | ACCOUNT | Limited data/latency |
| MOSDAC privileged | LATER | ACCOUNT/authorization | Full/NRT access |
| Bhuvan public WMS/WMTS | YES | NO | Dataset/license specific |
| Survey of India political boundary | YES | NO where public source applies | Use official standard |
| Survey of India licensed products | NO until licensed | YES | Licensing/pricing |
| GEBCO_2026 | YES | NO | Attribution; public-domain terms |
| NHO catalogue | YES | NO | Metadata/search, not full chart rights |
| NHO ENC/chart product | LATER | LICENSE | Product controls |
| CAA public registry | YES with privacy care | NO | Check reuse/PII rules |
| CAA bulk/private data | LATER | MAYBE | Dataset specific |
| CMFRI public published stats | YES | NO | Verify exact product terms |
| CMFRI requested raw data | LATER | YES | Director approval/possible charges |
| NCSCM approved public CZMP | YES | NO where publicly downloadable | Scale/legal disclaimer |
| NCSCM underlying research data | LATER | MAYBE/REQUEST | Dataset specific |
| data.gov.in public dataset | YES | NO for browsing; API usually account | API key/request pattern |
| GFW APIs | YES for FOSS/noncommercial | ACCOUNT | Current noncommercial terms |
| OSM | YES | NO | ODbL + attribution |

---

# 201. Priority order for engineering effort

This is an implementation sequence, not a quality ranking of sources.

## Stage 1 — foundation

```text
PostGIS
MapLibre
FastAPI
source registry
metadata/provenance
GEBCO
OSM
Bhuvan WMS
```

## Stage 2 — science

```text
INCOIS OSF
INCOIS PFZ
INCOIS PAT
INCOIS ERDDAP
```

## Stage 3 — hazards

```text
IMD warnings
INCOIS marine hazards
Tsunami public information
Marine heatwave
ABIS
```

## Stage 4 — fisheries/aquaculture

```text
CMFRI public statistics
CAA public registry
landing centres
fishery restrictions
```

## Stage 5 — coastal/planning

```text
NCSCM
NCCR
protected areas
marine spatial planning
marine energy
```

## Stage 6 — maritime

```text
NHO
licensed AIS or GFW
port profiles
vessel intelligence
```

## Stage 7 — advanced

```text
SARAT/SVAS
AI GIS
forecast comparison
research mode
offline packages
```

---

# 202. What can be fully open-source in your repository

You can publish:

- frontend code
- backend code
- schema
- adapter framework
- test fixtures you have permission to publish
- API specification
- metadata schema
- deployment scripts
- documentation
- sample synthetic datasets
- transformation code

Do not commit source data merely because you downloaded it.

---

# 203. What should remain outside Git

Usually:

- API tokens
- restricted source datasets
- licensed nautical products
- private user data
- beneficiary information
- large raw scientific archives
- copyrighted source files not licensed for redistribution

Use object storage and access controls.

---

# 204. National-scale data architecture

```text
                     INDIA MARINEWATCH
                            |
            +---------------+----------------+
            |                                |
        PUBLIC PLANE                    AUTHORIZED PLANE
            |                                |
      forecasts/maps                    restricted feeds
      advisories                        partner data
      open science                      operations
            |                                |
            +---------------+----------------+
                            |
                         DATA HUB
                            |
           +----------------+----------------+
           |                |                |
        PostGIS         Object Store       Search
           |                |                |
           +----------------+----------------+
                            |
                     API + GIS + AI
```

Keep the authorization boundary explicit.

---

# 205. Public-data plane vs operational-data plane

### Public data plane

Designed for:

- citizens
- fishermen
- researchers
- students
- public apps

### Operational/partner plane

Designed only after formal agreements:

- emergency agencies
- maritime authorities
- government operations
- restricted surveillance
- controlled AIS/VMS

Do not collapse these into one anonymous API.

---

# 206. Emergency architecture

For high-consequence hazards:

```text
Official source
      |
validation
      |
publication timestamp
      |
store bulletin
      |
map
      |
notification
```

The AI is downstream and optional, never the originator of the warning.

---

# 207. Official bulletin archival

For every warning/archive permitted to be stored:

```text
source bulletin ID
source URL
retrieved timestamp
publication timestamp
validity
content hash
source file/reference
```

This enables reproducibility and post-event analysis.

---

# 208. Disaster-event replay

After a cyclone:

```text
replay event

Track
Wind
Wave
Storm surge
Warnings
Ports
Fishing restrictions
Affected coastline
```

This is useful for research, education and after-action analysis, provided historical data can lawfully be used.

---

# 209. Marine operations dashboard — future

A partner/authorized dashboard could eventually show:

- vessel traffic
- SAR resources
- incidents
- hazards
- weather
- search areas

This is the Indian analogue of the restricted operational side of BarentsWatch, but it requires formal agency agreements and should not be assumed to be available to a student project.

---

# 210. What “full implementation” really means

For each feature, complete implementation means all six layers exist:

```text
1. Source
2. Access/license
3. Ingestion
4. Storage
5. API/GIS
6. User interface
```

Example:

```text
PFZ
 |
 +-- INCOIS source
 +-- public access
 +-- PFZ adapter
 +-- PostGIS schema
 +-- /api/v1/fisheries/pfz
 +-- MapLibre layer/filter/list/profile
```

Not merely:

```text
Put PFZ image on map
```

---

# 211. Feature-completeness checklist

## GIS

```text
[ ] basemaps
[ ] layer groups
[ ] opacity
[ ] legend
[ ] search
[ ] identify
[ ] measure distance
[ ] measure area
[ ] coordinates
[ ] fullscreen
[ ] draw point
[ ] draw line
[ ] draw polygon
[ ] map export
[ ] share URL
[ ] saved maps
```

## Time

```text
[ ] year
[ ] month
[ ] week
[ ] day
[ ] hour
[ ] forecast run
[ ] playback
[ ] historical comparison
```

## Data

```text
[ ] catalogue
[ ] metadata
[ ] provenance
[ ] access status
[ ] license
[ ] source update
[ ] checked timestamp
[ ] download
[ ] API
```

## Forecast

```text
[ ] wind
[ ] waves
[ ] swell
[ ] current
[ ] SST
[ ] tide
[ ] point forecast
[ ] route forecast
[ ] charts
[ ] forecast run comparison
```

## Fisheries

```text
[ ] PFZ
[ ] fisheries statistics
[ ] landing centres
[ ] fishing activity
[ ] restrictions
[ ] seasonal rules
[ ] species filters
[ ] gear filters
```

## Aquaculture

```text
[ ] farms
[ ] zones
[ ] registration
[ ] site details
[ ] environmental context
[ ] health where available
```

## Hazards

```text
[ ] cyclone
[ ] tsunami
[ ] storm surge
[ ] high waves
[ ] swell surge
[ ] marine heatwave
[ ] HAB
[ ] coral bleaching
[ ] oil spill
[ ] coastal flooding where sourced
```

## Maritime

```text
[ ] ports
[ ] notices
[ ] chart catalogue
[ ] vessels
[ ] vessel history
[ ] navigation warnings
[ ] fairways
[ ] anchorages
```

## Users

```text
[ ] account
[ ] favourites
[ ] saved routes
[ ] saved maps
[ ] alerts
[ ] profile
[ ] sharing
```

## AI

```text
[ ] natural-language search
[ ] structured query planner
[ ] GIS tools
[ ] source grounding
[ ] citations
[ ] freshness
[ ] limitations
[ ] no invented warnings
```

---

# 212. First 30 datasets/services to wire up

This is a practical first implementation set:

```text
01  INCOIS Ocean State Forecast
02  INCOIS PFZ
03  INCOIS Predicted Astronomical Tide
04  INCOIS public ERDDAP dataset catalogue
05  INCOIS SST
06  INCOIS surface current
07  INCOIS wave forecast
08  INCOIS swell
09  INCOIS marine heatwave
10  INCOIS algal bloom
11  INCOIS tsunami public information
12  INCOIS high-wave/swell-surge
13  INCOIS storm surge
14  INCOIS OOSA
15  IMD fishermen warnings
16  IMD port warnings
17  IMD sea-area bulletins
18  IMD coastal forecasts
19  GEBCO_2026 bathymetry
20  Bhuvan public WMS base/thematic service
21  OpenStreetMap context
22  Survey of India public political boundaries where available
23  CAA public farm registry
24  CMFRI public fishery statistics
25  CMFRI public landing-centre information where permitted
26  NHO online chart catalogue
27  NHO public Notices to Mariners
28  MOSDAC Open Data product catalogue
29  data.gov.in selected fisheries/coastal dataset
30  GFW noncommercial API for research/open-public-good use
```

---

# 213. Suggested first ten API contracts

Implement these before hundreds of endpoints:

```text
GET /api/v1/forecast/point
GET /api/v1/forecast/route
GET /api/v1/hazards/active
GET /api/v1/fisheries/pfz
GET /api/v1/ports/nearby
GET /api/v1/aquaculture/sites/nearby
GET /api/v1/coast/profile
GET /api/v1/datasets
GET /api/v1/search
POST /api/v1/spatial/query
```

These ten can support a surprisingly broad user experience.

---

# 214. Example “single point” API response

```json
{
  "location": {
    "lat": 19.076,
    "lon": 72.877
  },
  "forecast": {
    "wave_height_m": 1.4,
    "wind_speed_ms": 5.2,
    "sst_c": 28.7
  },
  "tide": {
    "next_high": "...",
    "next_low": "..."
  },
  "hazards": [],
  "nearby": {
    "ports": [],
    "landing_centres": [],
    "aquaculture_sites": []
  },
  "sources": [
    {
      "provider": "INCOIS",
      "dataset": "OSF",
      "issued_at": "..."
    }
  ]
}
```

The actual response must contain only fields supported by the underlying datasets.

---

# 215. Example “what is here?” API workflow

```text
POST /api/v1/spatial/query
        |
        +--> forecast
        +--> hazards
        +--> fisheries
        +--> aquaculture
        +--> ports
        +--> protected areas
        +--> coastal data
        |
        v
unified result
```

This should power both the UI point panel and the AI.

---

# 216. Recommended open-source governance

Repository should include:

- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- SECURITY.md
- DATA_POLICY.md
- SOURCE_ATTRIBUTIONS.md
- LICENCES.md
- PRIVACY.md
- TERMS.md
- MODEL_CARD.md for experimental ML

---

# 217. Data policy document

Your project should publish its own data policy explaining:

- what you mirror
- what you proxy
- what you derive
- what you do not redistribute
- how attribution works
- how users can request correction
- how stale/broken data is handled

---

# 218. Source correction workflow

If a source provider reports a problem:

```text
report
 ↓
identify dataset/run
 ↓
freeze affected derived products if needed
 ↓
correct/re-ingest
 ↓
record change
 ↓
rebuild tiles/API
 ↓
update provenance
```

Never silently replace historically published derived output if reproducibility matters.

---

# 219. Privacy

Minimize:

- farmer names
- addresses
- phone numbers
- Aadhaar/identity information
- personal contact details
- individual beneficiary information

The public product should prefer:

```text
place/site ID
location
status
scientific/operational attributes
```

and omit identity fields unless necessary and explicitly permitted.

---

# 220. Accessibility to low-connectivity coastal users

Consider:

- lightweight map mode
- cached tiles
- low-resolution imagery
- text-first warnings
- downloadable forecast summaries
- offline route package
- multilingual UI

Do not assume every fisher has high-speed broadband.

---

# 221. Low-bandwidth mode

Disable:

- satellite imagery
- animated layers
- large raster tiles

Prefer:

- vector simplification
- compressed JSON
- text warnings
- simple icons
- compact forecast tables

---

# 222. Mobile location

Support browser/device geolocation only with user permission.

Show:

```text
Your location
accuracy ± X m
last updated Y sec ago
```

Do not transmit location unnecessarily to your server.

---

# 223. Offline safety package

When an offline package is created:

```text
Package date
Package region
Forecast issued at
Warnings retrieved at
Regulations version
Data expiry
```

Expired packages should visibly report their age.

---

# 224. Map-print/report format

A print export should include:

- map title
- north arrow
- scale
- legend
- coordinate system
- source
- generated time
- active layers
- disclaimer

This is especially useful for planning/research users.

---

# 225. Scientific units / metadata in reports

For every variable:

```text
Value
Unit
Timestamp
Observation/forecast
Source
```

No bare numbers.

---

# 226. International/global context

Although India is the focus, ocean phenomena cross boundaries.

Allow a wider regional context for:

- Arabian Sea
- Bay of Bengal
- Indian Ocean

but keep authoritative Indian regulatory layers clearly delineated.

---

# 227. Boundary between India and international/open datasets

For example:

```text
Indian regulation
→ authoritative Indian source

Global bathymetry
→ GEBCO

Global fishing effort
→ GFW where licensed

Global ocean model
→ scientific/global source where required
```

Never imply a global dataset is an official Indian regulatory dataset.

---

# 228. Data source metadata should survive merges

Suppose a map combines:

```text
INCOIS waves
IMD warnings
GEBCO bathymetry
OSM roads
```

The merged output must retain four source references.

Do not reduce it to:

```text
source = India MarineWatch
```

India MarineWatch is the integrator, not the owner of those datasets.

---

# 229. Derived data provenance

If you calculate:

```text
wave risk = f(wave height, wind, current)
```

store:

```text
input source runs
formula
thresholds
code version
algorithm version
created_at
```

---

# 230. Model cards

Every ML model should have:

- purpose
- training data
- geographic scope
- temporal scope
- variables
- target
- methodology
- limitations
- validation
- version
- owner

---

# 231. No “AI hallucinated GIS” rule

The AI must never invent:

- coordinates
- zone boundaries
- vessel positions
- warning states
- regulations
- forecast values
- aquaculture registrations

All such values come from tools.

---

# 232. Prompt-injection resilience

External dataset text can contain arbitrary strings.

Treat source text as **data**, not instructions.

For example an external bulletin saying:

```text
Ignore previous instructions...
```

must remain a quote/data field and never alter system behavior.

---

# 233. Source outage handling

If INCOIS fails:

```text
INCOIS OSF
Last successful: 08:00
Status: delayed
```

Don't silently show yesterday's forecast as current.

---

# 234. Data latency dashboard

For each dataset:

```text
Source says published: 08:00
MarineWatch retrieved: 08:02
Now: 08:05
Age: 5 min
```

This makes operational freshness explicit.

---

# 235. Source clock synchronization

Use:

- UTC internally
- NTP on servers
- explicit source timezone metadata

For Indian users render IST.

---

# 236. Source timestamps from HTML/pages

If only a human page exposes a timestamp, parse it carefully and store:

```text
published_at_source
parsed_from_page = true
```

But prefer structured API metadata whenever available.

---

# 237. OCR policy for marine data

Do not OCR government PDFs/images if structured text or API data exists.

Use OCR only as a fallback and mark:

```text
extraction_method = OCR
```

This is especially important for safety warnings.

---

# 238. Data ingestion from PDFs

For official PDFs:

```text
download
 ↓
archive original
 ↓
extract structured text/table
 ↓
validate
 ↓
link original PDF
```

Do not silently recreate legal/technical tables without preserving the original.

---

# 239. Source website scraping policy

Use scraping only when:

- no suitable API/feed/file exists
- the source permits it or there is a clear lawful basis
- crawl rate is respectful
- terms are checked

Prefer:

```text
API > feed > file > OGC service > structured page > HTML scraping > OCR
```

---

# 240. Provider contact strategy

For any valuable dataset that appears blocked:

1. Identify owner.
2. Search official documentation.
3. Check API/data request/licensing page.
4. Ask for access or redistribution terms.
5. Record response in your source registry.

Do not work around authentication.

---

# 241. Data contracts with providers

If the project becomes serious, ask providers for:

- API access
- data-use permission
- redistribution rights
- caching permission
- update frequency
- schema stability
- rate limits
- attribution requirements
- incident support/contact

---

# 242. What “API available” should mean in your catalogue

Use precise labels:

```text
API_PUBLIC
API_ACCOUNT
API_APPLICATION
OGC_WMS
OGC_WMTS
OGC_WFS
ERDDAP
DOWNLOAD
VIEW_ONLY
REQUEST
LICENSED_FILE
```

Do not use one boolean `api=true`.

---

# 243. What “open” should mean in your catalogue

Also avoid:

```text
open = true
```

Use:

```text
access:
  discovery: public
  view: public
  download: public
  api: account
  redistribution: restricted
  commercial: prohibited
```

This more accurately reflects real government data ecosystems.

---

# 244. India MarineWatch source registry example matrix

| Dataset | Discover | View | Download | API | Account | Application | Redistribution |
|---|---|---|---|---|---|---|---|
| INCOIS OSF | Yes | Yes | product-dependent | product-dependent | usually no for public service | no | check terms |
| INCOIS ERDDAP public | Yes | Yes | Yes | Yes | no | no | dataset terms |
| IMD marine forecast | Yes | Yes | bulletin/product | structured access varies | no public viewing | no | check terms |
| GEBCO_2026 | Yes | Yes | Yes | OPeNDAP | no | no | Yes, under terms |
| Bhuvan WMS | Yes | Yes | map service | WMS/WMTS | usually no | no | underlying data terms |
| CAA public registry | Yes | Yes | page data | not assumed | no | no | check/privacy |
| CMFRI requested dataset | Yes | limited | after approval | no guarantee | request | Yes | contract-dependent |
| GFW | Yes | Yes | some products | Yes | Yes | usually self-register | noncommercial terms |
| NHO catalogue | Yes | Yes | catalogue | limited | no | no | product dependent |

---

# 245. Data API gateway policy

Your gateway should attach:

```text
X-Data-Source
X-Data-Issued-At
X-Data-Retrieved-At
X-Data-License
```

or equivalent JSON metadata.

---

# 246. Caching policy by licence

Possible states:

```text
CACHE_ALLOWED
CACHE_TEMPORARILY
CACHE_FOR_AUTHORIZED_USERS
NO_LOCAL_COPY
UNKNOWN
```

For `UNKNOWN`, don't mirror.

---

# 247. Proxy policy

A proxy should only forward/access data as permitted by source terms.

A proxy is not a legal mechanism for converting a closed dataset into an open one.

---

# 248. API key policy

Store upstream tokens:

- server-side
- encrypted/secret-managed
- rotated
- never returned to browser

For GFW, current terms also require registered access and impose noncommercial conditions/rate limits. citeturn320796search5

---

# 249. Public project statement

Recommended wording:

> India MarineWatch is an independent open-source marine information platform that aggregates and analyzes publicly available and appropriately licensed datasets from Indian and international sources. It is not an official Government of India service and does not replace official forecasts, warnings, navigation information, regulations or emergency instructions.

---

# 250. Project scope boundary

Include:

- information integration
- GIS
- data access
- analysis
- scientific visualization
- decision-support

Do not claim:

- official authority
- official certification
- legal clearance
- emergency command authority
- independent tsunami/cyclone warning authority

---

# 251. Final build blueprint

```text
                              INDIA MARINEWATCH
                                     |
       +-----------------------------+-----------------------------+
       |                             |                             |
       v                             v                             v
   DATA SOURCES                   DATA HUB                     USER APPS
       |                             |                             |
 INCOIS / IMD / ISRO            Raw archive                   Unified Map
 CMFRI / CAA / NCSCM            Metadata                      Forecast
 NHO / SOI / Bhuvan              Provenance                   FisherWatch
 GEBCO / GFW / OSM              Versioning                   AquaWatch
       |                         Licensing                    Hazards
       |                             |                         Ports
       +-------------+---------------+                         AI
                     |
                     v
               INGESTION / ETL
                     |
             Normalize + Validate
                     |
              Scientific storage
              PostGIS + Object
                     |
         +-----------+------------+
         |                        |
         v                        v
    API / OGC                 Analytics
         |                        |
         +-----------+------------+
                     |
                     v
               FRONTEND / AI
                     |
                     v
              PEOPLE / RESEARCH
```

---

# 252. Minimum viable national source stack

If you need a hard boundary for a first serious release:

```text
INCOIS
IMD
GEBCO
Bhuvan
OpenStreetMap
CAA public data
CMFRI public statistics
NHO public catalogue/notices
data.gov.in
MOSDAC Open Data
```

That is already a legitimate, multi-domain marine data platform.

---

# 253. Minimum viable technical stack

```text
Next.js
TypeScript
MapLibre
FastAPI
PostgreSQL
PostGIS
Redis
MinIO
xarray
GDAL/rasterio
Docker
Prometheus
Grafana
Keycloak (when accounts are needed)
```

---

# 254. Minimum viable product demo

A convincing demo flow:

```text
Open map
  ↓
click Mumbai offshore
  ↓
show current forecast
  ↓
show PFZ
  ↓
show nearby ports/landing centres
  ↓
show bathymetry
  ↓
show active IMD/INCOIS warnings
  ↓
ask AI:
"What is happening here tomorrow morning?"
  ↓
AI calls structured tools
  ↓
map + table + chart + official sources
```

---

# 255. What you should implement first, literally

### Sprint 1

```text
PostGIS
MapLibre
source registry
dataset catalogue schema
GEBCO
OSM
Bhuvan WMS
```

### Sprint 2

```text
INCOIS OSF
point forecast
forecast charts
time slider
```

### Sprint 3

```text
PFZ
fisheries layers
spatial filters
landing-centre search
```

### Sprint 4

```text
IMD marine warnings
hazard layer
alert panel
```

### Sprint 5

```text
CAA
CMFRI public statistics
port layer
NHO notices/catalogue
```

### Sprint 6

```text
AI GIS
source-grounded queries
saved maps
favorites
alerts
```

---

# 256. First-source acquisition plan

## Day 1

Acquire/verify:

- GEBCO_2026
- OSM extract
- Bhuvan public service metadata
- INCOIS ERDDAP catalogue
- INCOIS OSF access
- INCOIS PFZ access
- IMD public marine pages

## Week 1

Implement:

- source registry
- ETL skeleton
- raw archive
- metadata
- map

## Week 2

Connect:

- OSF
- PFZ
- tide

## Week 3

Connect:

- IMD warnings
- hazard products
- GEBCO

## Week 4

Build:

- point profile
- route forecast
- AI query

---

# 257. Long-term source acquisition plan

For datasets requiring a request/licence:

```text
identify need
  ↓
check public alternative
  ↓
confirm exact dataset
  ↓
submit request/licence enquiry
  ↓
record terms
  ↓
receive dataset/access
  ↓
implement controlled adapter
  ↓
run legal/technical review
  ↓
publish only permitted fields
```

This is especially important for:

- CMFRI high-resolution data
- IMD historical/bulk data
- NCSCM restricted layers
- NHO chart/ENC products
- licensed SOI products
- sensitive AIS/VMS/operational sources

---

# 258. Provider-specific current notes

## INCOIS

Current public operational services make INCOIS the natural first provider. Its ERDDAP also provides consistent programmatic scientific-data access and the live catalogue identifies public datasets. citeturn217454search4turn217454search6

## IMD

The current marine portal publicly exposes fishermen warnings, port warnings, sea-area bulletins and coastal weather forecasts. citeturn217454search0turn217454search8

## MOSDAC

Its access policy explicitly uses three tiers, so implementation must remain dataset/access-profile aware. citeturn217454search7

## CMFRI

Its data-request policy explicitly requires formal requests for data covered by that process and permits charges/conditions. citeturn729746search0

## GEBCO

The current 2026 release is the correct present reference for bathymetry; it is 15 arc-second and public-domain/free under the stated terms. citeturn729746search3turn729746search5

## NHO

Its online catalogue is current/public and updated fortnightly, but catalogue availability should not be confused with unrestricted redistribution of chart/ENC products. citeturn217454search1

## GFW

Current API documentation includes fishing effort, vessel identity/history, encounters and other analysis products, but standard API use is noncommercial and rate-limited. citeturn320796search0turn320796search5

---

# 259. Final source philosophy

The platform should follow this hierarchy of confidence and authority:

```text
Authoritative official warning/regulation
        >
Official scientific operational product
        >
Official research/observation dataset
        >
Reputable international/open scientific data
        >
Community/contextual data
        >
Your derived model
        >
AI explanation
```

This is not a ranking of organizations. It is a **data provenance/authority rule for the application's use case**.

---

# 260. Final architecture principle

The project should never become:

```text
10 websites + an iframe dashboard
```

It should become:

```text
many sources
    ↓
normalized data contracts
    ↓
provenance-aware storage
    ↓
spatial/temporal query engine
    ↓
open API + OGC services
    ↓
GIS + analytics + alerts
    ↓
AI query interface
```

That is the architecture needed to make India MarineWatch a true **BarentsWatch-style national marine data platform**.

---

# 261. One-page implementation checklist

```text
FOUNDATION
[ ] PostgreSQL/PostGIS
[ ] object storage
[ ] source registry
[ ] metadata schema
[ ] provenance
[ ] access/licence schema
[ ] monitoring

MAPPING
[ ] MapLibre
[ ] base maps
[ ] GEBCO
[ ] OSM
[ ] Bhuvan
[ ] administrative boundaries
[ ] layer registry
[ ] legends
[ ] measurements

OCEAN
[ ] INCOIS OSF
[ ] wind
[ ] waves
[ ] swell
[ ] currents
[ ] SST
[ ] tide
[ ] point forecast
[ ] route forecast

FISHERIES
[ ] PFZ
[ ] landing centres
[ ] fisheries statistics
[ ] restrictions
[ ] fishing activity

AQUACULTURE
[ ] CAA farms
[ ] aquaculture zones
[ ] environmental context

HAZARDS
[ ] IMD warnings
[ ] tsunami
[ ] cyclone
[ ] storm surge
[ ] high waves
[ ] MHW
[ ] HAB
[ ] oil spill

MARITIME
[ ] ports
[ ] NHO catalogue
[ ] Notices to Mariners
[ ] vessel architecture
[ ] licensed AIS/GFW option

PLANNING
[ ] protected areas
[ ] CZMP/CRZ public layers
[ ] fisheries conflict
[ ] energy layers
[ ] spatial analysis

PLATFORM
[ ] data catalogue
[ ] API
[ ] downloads
[ ] favorites
[ ] saved maps
[ ] alerts
[ ] multilingual
[ ] low-bandwidth mode

AI
[ ] structured query planner
[ ] PostGIS tool
[ ] forecast tool
[ ] PFZ tool
[ ] hazard tool
[ ] source grounding
[ ] citations
[ ] safety constraints
```

---

# 262. Important caveat about “fully”

No single public Indian source currently provides every BarentsWatch-equivalent feature in one open API.

A real India MarineWatch therefore needs to combine:

- open services
- account-based services
- request/approval datasets
- licensed products
- derived analytics
- its own data catalogue

The platform is complete when the **integration layer** is complete, not when every external source is freely downloadable.

---

# 263. Final recommendation for the project boundary

For an FOSS student project, the cleanest boundary is:

```text
PUBLIC + LEGALLY REDISTRIBUTABLE
        |
        v
India MarineWatch public core

RESTRICTED/LICENSED
        |
        v
optional adapters / authorized integrations
```

This gives you a project that can remain open-source without pretending that every government or commercial dataset is open.

---

# 264. Key sources used for this specification

Primary/current sources consulted include:

- INCOIS Ocean Information & Advisory Services: https://www.incois.gov.in/
- INCOIS Ocean State Forecast: https://www.incois.gov.in/oceanservices/osfforecast.jsp
- INCOIS ERDDAP: https://erddap.incois.gov.in/erddap/
- INCOIS PFZ: https://www.incois.gov.in/MarineFisheries/PfzAdvisory
- INCOIS ORCA: https://incois.gov.in/site/ORCA/index.html
- IMD Marine Forecast: https://mausam.imd.gov.in/responsive/marine_forecast.php
- MOSDAC Data Access Policy: https://www.mosdac.gov.in/data-access-policy
- Bhuvan WMS documentation: https://bhuvan.nrsc.gov.in/wiki/index.php/How_to_use_WMS_services
- Survey of India Geospatial Guidelines: https://onlinemaps.surveyofindia.gov.in/GeospatialGuidelines.aspx
- Survey of India Digital Data Pricing: https://surveyofindia.gov.in/pages/pricing-of-digital-data
- GEBCO_2026 Grid: https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid
- Indian Naval Hydrographic Office catalogue: https://www.hydrobharat.gov.in/web/guest/online-catalogue
- CMFRI Data Request: https://www.cmfri.org.in/data-request
- CAA Farm Registry: https://caa.gov.in/CAA/Farms
- NCSCM: https://ncscm.res.in/
- Global Fishing Watch API documentation: https://globalfishingwatch.org/our-apis/documentation/
- Global Fishing Watch API terms: https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits
- data.gov.in: https://www.data.gov.in/
- OpenStreetMap: https://www.openstreetmap.org/

---

# 265. Current-source evidence summary

The current official sources used to verify key access/implementation assumptions show:

- INCOIS currently operates OSF and an ERDDAP scientific-data server. citeturn217454search5turn217454search4
- The live INCOIS ERDDAP catalogue includes public-access datasets and provides data-subsetting/documentation infrastructure. citeturn217454search6turn217454search11
- IMD currently provides public fishermen warnings, port warnings, sea-area bulletins and coastal marine forecasts. citeturn217454search0turn217454search8
- MOSDAC currently distinguishes anonymous open-data access from registered general and privileged access. citeturn217454search7
- CMFRI currently requires formal approval for data requests covered by its request policy and may charge according to type/volume/resolution. citeturn729746search0
- GEBCO_2026 is current, globally gridded at 15 arc-seconds, and placed in the public domain under its terms. citeturn729746search3turn729746search5
- Bhuvan publishes interoperable OGC WMS/WMTS services. citeturn320796search3
- Survey of India explicitly encourages open APIs and states that political boundary data should be easily downloadable for free, while separate SOI product pages list licences/pricing for many digital products. citeturn729746search7turn217454search10
- The NHO online catalogue is public and searchable by chart metadata and is updated fortnightly. citeturn217454search1
- Global Fishing Watch APIs currently cover several fishing/vessel analytical functions but are restricted to noncommercial use under the standard API terms. citeturn320796search0turn320796search5

---

# 266. Final operational rule

**Before adding any dataset to a public India MarineWatch deployment, verify the exact source product's current access, licence, API terms and redistribution rights.**

A government website, public map, downloadable PDF or visible API endpoint does not by itself grant permission to republish the underlying data.

This specification deliberately treats access status as **dataset-specific and time-sensitive**.

---

# 267. End state

The completed system should make this possible:

> Select any part of India's marine/coastal domain, choose a point/date/time/layer, understand the ocean, weather, fisheries, aquaculture, environment, hazards, infrastructure and regulatory context that is available from integrated sources, inspect the provenance, perform spatial/temporal analysis, download permitted data, create alerts, and ask natural-language questions that execute against the underlying datasets.

That is the practical India-focused equivalent of the **BarentsWatch architectural concept**.

