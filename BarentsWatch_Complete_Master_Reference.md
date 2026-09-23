# BarentsWatch — Complete Master Reference

> **Reference document:** what BarentsWatch is, how it is organized, every major public and restricted service, detailed user-facing features, map layers, filtering, time controls, statistics, forecasting, downloads, APIs, access controls, data provenance, warnings, collaboration, and current-status notes.
>
> **Status perspective:** this document is written against the BarentsWatch material visible in the supplied screenshots/text plus the current official BarentsWatch and BarentsWatch Developer material checked on **23 September 2026**. Where the screenshots show a concrete UI capability, it is preserved as an observed feature. Where current official material differs from older documentation, the difference is called out instead of silently merging the two.
>
> **Scope note:** “everything” here means everything that can be documented from the supplied evidence and the public official material reviewed. It is not a dump of every private/internal endpoint or every internal implementation detail that BarentsWatch does not publish.

---

## 1. What is BarentsWatch?

**BarentsWatch is a Norwegian public information and digital-service platform for coastal and marine areas.** Its purpose is to **collect, develop, combine, and share information about Norwegian coastal and marine areas**.

It is not one single application. It is a family of specialized web services sitting on top of shared marine data, mapping, forecasting, identity/access, download, and API infrastructure.

The official description separates the organization into two broad parts:

1. An **open information system** with services for end users through the BarentsWatch portal.
2. A **shielded/restricted monitoring and operational system** used by operational agencies.

Together these systems form the BarentsWatch department. The organization says the services are intended to improve cooperation, professional development, and information sharing among public agencies, trade and industry, and the public. BarentsWatch also states that it has **10 ministries and 29 administrative agencies/research institutes as partners**, is under the **Ministry of Trade, Industry and Fisheries**, and is led by the **Norwegian Coastal Administration**. Development work is carried out by commercial suppliers through public procurement, and the product approach is described as user-driven and agile. [Official source: About us]

### In one sentence

> **BarentsWatch is a federated marine information platform that turns many government, research, sensor, satellite, AIS, regulatory, environmental, fisheries, aquaculture, and forecast datasets into specialized GIS applications, operational tools, downloadable datasets, and developer APIs.**

### What makes BarentsWatch distinctive

BarentsWatch combines several classes of functionality that are often separate products elsewhere:

- Geographic information system (GIS)
- Real-time vessel tracking
- Historical vessel tracks
- Weather and marine forecasts
- Ice information
- Tidal/current forecasts
- Fisheries regulations
- Fishing-gear reporting
- Aquaculture health intelligence
- Aquaculture statistics/economics
- Marine spatial planning
- Navigation warnings
- Spatial restrictions and protected areas
- Incident/escape information
- Dataset catalogue and metadata
- Open APIs and downloads
- Chartplotter-oriented data distribution
- User accounts, favorites, sharing and extended access
- Restricted operational systems for rescue, surveillance and fisheries-crime cooperation
- Educational articles, tutorials and explanatory material

Official public-service pages currently expose services including AkvaInfo, ArcticInfo, Data, Fishery Activity, Fishhealth, FishInfo, Marine Spatial Management Tool 2.0, NAIS, Ohoi, Polar Lows, Saltstraumen, Sustainability in aquaculture, and Wave Forecast. The main landing page prominently highlights the core marine services, while the separate Services catalogue also lists Sustainability in aquaculture. [Official sources: Services; Front page]

---

# 2. BarentsWatch at a glance

## 2.1 Public-facing service family

| Service | Primary purpose |
|---|---|
| **AkvaInfo / AquaInfo** | Aquaculture information, municipal/production-area statistics, sites, biomass, employment, aquaculture-fund information and related marine planning layers |
| **ArcticInfo** | Arctic navigation, ice, weather, AIS, warnings, Greenland reporting and extended-vessel information |
| **Data** | Dataset discovery, downloads and access to data used by the services |
| **Fishery Activity** | Historical overview of fishing facilities / fishing activity |
| **Fishhealth** | Weekly aquaculture-health intelligence: salmon lice, diseases, countermeasures and locality-level data |
| **FishInfo** | Fishing-relevant maps, regulations, navigation/industry information, gear data and chartplotter downloads |
| **Marine Spatial Management Tool 2.0 / Arealverktøy** | Combine, analyze, save, share and work with authoritative marine planning data |
| **NAIS** | Vessel locations and AIS-based vessel intelligence in Norwegian waters |
| **Ohoi** | Recreational boating map, navigation, weather, waves, tides and safety information |
| **Polar Lows** | Polar-low information; BarentsWatch's own subscription alert service has been discontinued and active alerts are redirected to Varsom.no |
| **Saltstraumen** | Specialized 48-hour tidal-current forecast and current-event visualization for Saltstraumen |
| **Sustainability in aquaculture** | Facts/indicators about Norwegian aquaculture; historically had a dedicated API, which was removed in 2025 |
| **Wave Forecast** | Marine/wave forecasts for exposed fairways/areas, point forecasts, crossing waves and current-related information |

## 2.2 Restricted services

The public portal also identifies four restricted services:

- **Ocean Surveillance Program**
- **Shared Resource Information Repository (FRR)**
- **Joint Operation Tool (JOT)**
- **Blue Justice**

These are not ordinary public map applications; they support operational agencies, rescue organizations, surveillance, and international cooperation against fisheries crime.

---

# 3. The platform concept

A useful way to understand the platform is:

```text
Government agencies
Research institutes
AIS network
Satellites
Weather models
Ocean models
Aquaculture registers
Fisheries registers
Navigation datasets
Environmental datasets
Regulatory datasets
Emergency-resource data
        |
        v
+--------------------------+
|       BARRENTSWATCH      |
|                          |
|  Shared data + GIS       |
|  APIs + downloads        |
|  Forecasts               |
|  Identity/access         |
|  Metadata/provenance     |
+--------------------------+
        |
   +----+----+-------------------+
   |         |                   |
   v         v                   v
Public    Developers       Restricted users
services  / integrations   / operational agencies
```

The most important architectural idea is **reuse**. A single underlying source can appear in several applications.

For example, AIS is used across multiple BarentsWatch applications, including Wave Forecast, FishInfo, ArcticInfo and Fishhealth. The open-data page explicitly describes the AIS API as a reusable real-time vessel-position feed. [Official source: Open data via BarentsWatch]

---

# 4. Organization, governance and ecosystem

## 4.1 Official role

BarentsWatch collects and shares marine and coastal information, develops digital services around that information, and supports cooperation between public agencies, research organizations, industries, and the public.

## 4.2 Governance

According to the current official "About us" page:

- The department is subject to the **Ministry of Trade, Industry and Fisheries**.
- The **Norwegian Coastal Administration** leads the department.
- BarentsWatch has **10 ministry-level partners** and **29 administrative agencies/research institutes** as partners.
- The office is in **Tromsø**.
- Development work is performed by commercial suppliers through public procurement.
- Development is described as **user-driven and agile**.

## 4.3 Example partner/data-owner ecosystem

The supplied material and official pages show data coming from organizations including:

- Norwegian Coastal Administration
- Directorate of Fisheries
- Norwegian Food Safety Authority
- Norwegian Veterinary Institute
- Norwegian Mapping Authority / Kartverket
- Norwegian Meteorological Institute
- Norwegian Environment Agency
- NORCE
- Norwegian Polar Institute
- Norwegian Maritime Authority
- Norwegian Police Service / National Police Directorate
- Norwegian Petroleum Directorate / Norwegian Offshore Directorate naming in the source material
- Andøya Space Center
- Danish Maritime Authority
- Danish Meteorological Institute
- Statistics Norway
- Norwegian Coast Guard
- Norwegian Space Centre
- Norwegian Institute of Marine Research
- Other public and research partners

The point is not merely that these organizations provide data; BarentsWatch creates a **common delivery layer** in which the source, update time, and context are visible to users.

---

# 5. Common BarentsWatch user interface and platform features

Across the supplied screenshots, BarentsWatch repeatedly uses a common application pattern.

## 5.1 Map-centric workspace

Typical layout:

```text
+--------------------------------------------------------------+
| Header / service branding / account / language               |
+--------------------+----------------------+------------------+
| Layer / Filter     |                      |                  |
| / Theme panel     |       MAP            | Information /   |
|                    |                      | analytics panel |
|                    |                      |                  |
+--------------------+----------------------+------------------+
| Timeline / time controls / forecast controls                  |
+--------------------------------------------------------------+
```

Common controls include:

- Search
- Map layers
- Filters
- Themes
- Settings
- About
- Language switch
- Feedback
- Login
- Fullscreen
- Zoom in/out
- Current-location control where supported
- Measurement tools
- Drawing tools where supported
- Favorites
- Sharing where supported
- Data/API access where supported
- Background-map selection
- Time navigation where the service is temporal

## 5.2 Geographic interaction

Observed capabilities include:

- Pan map
- Zoom
- Display a scale bar
- Display exact map coordinates in degrees/minutes notation
- Click a point on the map to retrieve contextual information
- Select geographic objects and open detail panels
- Measure distances/areas
- Overlay multiple datasets
- Toggle layers
- Choose background maps
- Search geographic content

Examples observed in the supplied screens include coordinate displays such as:

- `68° 42.870′ N, 3° 35.683′ E`
- `69° 32.585′ N, 3° 17.961′ E`
- `67° 40.340′ N, 3° 20.177′ E`

and map scales such as `300 km` and `50 km`.

These are examples of UI readouts from the supplied captures, not special fixed application constants.

## 5.3 Time controls

BarentsWatch services can be explicitly time-aware.

Observed patterns include:

- Year selection
- Week selection
- Month selection
- Hourly forecast timelines
- Historical navigation
- Selected-week panels
- Current selected date range
- Time slider
- Forward/backward time controls
- Current week/current date indication
- Model/data update timestamps

One supplied Fishhealth view shows **Week 39, September 21–28, 2026** and a selected-year/week timeline. Another service uses a month timeline for fishing activity. Waveforecast exposes multiple days/hours around a forecast horizon.

## 5.4 Data freshness indicators

Dataset pages repeatedly show:

- **Data owner**
- **Updated** timestamp
- **Checked at** timestamp
- Dataset description
- Download link where available

This is a major feature: the system exposes not only data, but **provenance and freshness metadata**.

## 5.5 Explainability/help panels

Many services use expandable contextual explanations such as:

- More about filters
- Explanation of thresholds
- Explanation of calculations
- Explanation of reports/treatments
- Dataset descriptions
- Model/forecast methodology
- Usage caveats

This is embedded documentation rather than a separate manual only.

## 5.6 User personalization

Observed/common account capabilities include:

- Favorites
- Saved datasets as favorites
- Saved map objects
- Saved routes in services that support routes
- My Page
- API clients
- Extended-access applications
- Vessel association in extended-access services
- Subscription/account management where still supported

---

# 6. AquaInfo / AkvaInfo

## 6.1 What AquaInfo is

AquaInfo is the aquaculture information/analysis service. Its emphasis is on the **status and development of aquaculture**, particularly by municipality and production area, plus aquaculture locations and related planning/environmental context.

The official open-data documentation describes AquaInfo data as covering municipal status/development, number of fish farms, maximum allowed biomass, distribution of farming types, area, aquaculture-fund payments, employment, environmental surveys and more, with historical data going back to **2012**. The documentation states that AquaInfo is exposed using the Fishhealth API infrastructure rather than as an entirely separate standalone API. [Official source: Open data via BarentsWatch]

## 6.2 AquaInfo statistics/navigation

The supplied UI shows dedicated statistical areas for:

- **Municipalities**
- **Production areas**
- **All of Norway / national area**

The statistics section includes:

- Locality statistics
- Biomass
- Employment
- Payments from the aquaculture fund
- Other historical data
- Municipality information
- Production-area information
- National information
- Historical series reaching back to 2012

## 6.3 Favorites

Users can save:

- Aquaculture sites
- Vessels
- Fish slaughterhouses

Saved items appear under **My favorites**.

## 6.4 AquaInfo map/data layers observed in the supplied material

### Administrative/geographic layers

- Municipalities
- National map
- Norway orthophoto
- Standard background map

### Production-management layers

- Production areas
- 13 production areas for salmon farming
- Traffic-light information for growth management

### Aquaculture infrastructure

- Aquaculture sites
- Aquaculture site area / permitted location area
- Aquaculture moorings
- Fish slaughterhouses

### Salmon/ecological protection

- National salmon fjords
- Outlets for anadromous rivers
- Protected areas
- Proposed protected areas

### Offshore aquaculture planning

- Areas of opportunity
- Impact Assessment 2024
- Recommendation 2022
- Advisory 2019
- Identified 2019

The planning-history set is especially useful because it lets users compare or understand successive offshore-aquaculture planning stages rather than seeing only a single current layer.

## 6.5 Aquaculture sites layer

The supplied data description says aquaculture sites are registered in the aquaculture register and that the dataset includes fish-health information such as:

- Salmon lice
- Fish diseases

The data owners named in the supplied material are:

- Directorate of Fisheries
- Norwegian Food Safety Authority
- Norwegian Veterinary Institute

## 6.6 Aquaculture site area

This is a distinct dataset from the site point itself.

It represents the **area in which an aquaculture site is allowed to be located**, which does not necessarily equal the actual physical location of the site.

Data owner shown: Directorate of Fisheries.

## 6.7 Aquaculture moorings

The supplied material describes:

- Mooring-line placement
- NYTEK coordinates
- Spatial placement of aquaculture moorings

It explicitly warns that NYTEK coordinates are **not quality checked**.

## 6.8 Slaughterhouses

Fish slaughterhouse sites are shown where authorized by the Norwegian Food Safety Authority.

## 6.9 Protected areas

The service includes official protected-area information for Norway, with Svalbard and Jan Mayen included in the relevant dataset.

## 6.10 Dataset catalogue

AquaInfo exposes dataset metadata including:

- Dataset name
- Data source/owner
- Latest update
- Checked timestamp
- Description
- Download availability

---

# 7. Fishhealth

## 7.1 What Fishhealth is

Fishhealth is a **weekly, locality-level aquaculture health intelligence service**.

The official service description summarizes it as a weekly overview of salmon lice, diseases and countermeasures down to locality level. The official API documentation also warns that the exposed API data are raw reported data, can contain inaccuracies, and should be quality-controlled by users; management decisions under Norwegian law remain the responsibility of the relevant authority. [Official sources: Services; Fish Health API]

## 7.2 Core interaction model

The service's distinctive workflow is:

```text
Choose year/week
       |
       v
Apply filters
       |
       v
Filtered aquaculture sites
       |
       +--> Show on map
       |
       +--> Show list
       |
       +--> Aggregate statistics
       |
       +--> Disease/incident summaries
       |
       +--> Site detail
       |
       +--> Data/API/download
```

## 7.3 Time dimension

Observed controls include:

- Year
- Week
- Selected week
- Selected year
- Weekly timeline
- Date range for the week
- Reporting deadline/status
- Historical navigation

The supplied screen shows **Week 39: September 21, 2026 – September 28, 2026**.

## 7.4 Search

- Search field
- Search by location/object/site content

## 7.5 Site filtering — salmon lice

Observed filters include:

- Female lice per fish: From
- Female lice per fish: To
- Above lice limit 0.5
- Above summer limit 0.2
- Below lice limit 0.5
- Below summer limit 0.2

## 7.6 Reporting filters

- All
- Reported salmon lice
- Not reported
- Hide sites not required to report

There is also contextual help around **“Probably no fish”** and how that result is calculated.

## 7.7 Lice treatment filters

- Cleaner fish
- Medicinal treatments
- Non-medicinal treatments

The UI also has explanatory sections around:

- Cleaner fish reports
- Mechanical removal before 2024
- Treatment interpretation

## 7.8 Disease filters

The supplied screens show dedicated filters for:

- Pancreas disease (PD)
- Infectious salmon anaemia (ISA)
- Bacterial kidney disease
- Systemic infection with *Flavobacterium psychrophilum*
- Infection with *Gyrodactylus salaris*
- Furunculosis
- Franciscellosis
- Viral nervous necrosis
- Viral haemorrhagic septicaemia
- Infectious haematopoietic necrosis
- Piscirickettsiosis
- New contagious disease in Norway
- Aquaculture sites within ISA restricted zones

The developer update history confirms that the Fishhealth API was expanded beyond PD and ISA to expose multiple additional disease types. [Official source: BarentsWatch Developer announcements]

## 7.9 Species filters

Observed:

- Species selector
- All
- Has salmon, trout or rainbow trout

## 7.10 License filters

Observed:

- On-growing
- On-growing (5% MAB increase)
- Organic on-growing
- Juvenile
- Brood stock
- Green licenses

## 7.11 Purpose filters

Observed:

- Commercial
- Research
- Slaughter holding cage
- Stocked fish pond
- Visiting center / demonstration facility
- Education
- Development

## 7.12 Company filter

- Company search field
- Filter by company

## 7.13 Placement/geographic filters

Observed geographic/spatial logic includes:

- Sea
- Land
- Within 1,000 m of shrimp fishing ground
- Within 500 m of cod spawning ground
- County / Municipality search
- Production-area selection
- All production areas

The supplied UI enumerates 13 production areas, with labels such as:

1. From the Swedish border to Jæren
2. Ryfylke
3. From Karmøy to Sotra
4. From Nordhordaland to Stadt
5. From Stadt to Hustadvika
6. Nordmøre and Sør-Trøndelag
7. Nord-Trøndelag including Bindal
8. Helgeland to Bodø
9. Vestfjorden and Vesterålen
10. From Andøya to Senja
11. From Kvaløya to Loppa
12. West Finnmark
13. East Finnmark

## 7.14 Custom spatial analysis

Users can create custom regions using:

- **Draw area**
- **Draw circle**

This turns the service into a user-driven spatial query tool rather than a fixed-regions dashboard.

## 7.15 Map/list dual view

A result count is displayed, followed by a **Show list** action.

This creates two complementary modes:

- Spatial visualization on map
- Structured list of matching sites

## 7.16 KPI/summary panel

The supplied Fishhealth screenshots show several automatically generated summaries.

### Lice threshold status

- Number of sites above threshold
- Number below threshold
- Percentage of reporting sites above threshold
- Percentage of reporting sites below threshold
- Progress-bar representation
- Expandable threshold explanation

### Disease status

Aggregated counts by disease, for example:

- Pancreas disease
- Infectious salmon anaemia
- Franciscellosis

### New disease outbreaks

The panel can list:

- New outbreaks
- Site/locality
- Disease type

### Escape incidents

The panel can show:

- Incident/site name
- Date
- Estimated number escaped
- Estimated weight escaped
- Incident explanation/notes

The supplied capture showed examples where escape quantities are described as preliminary estimates from the breeder.

## 7.17 Data source panel

The Fishhealth UI exposes the underlying dataset/source catalogue, reinforcing provenance.

Examples of source domains shown in the supplied captures include:

- Directorate of Fisheries
- Norwegian Food Safety Authority
- Norwegian Veterinary Institute
- Norwegian Environment Agency
- Norwegian Mapping Authority

## 7.18 Favorites

The broader BarentsWatch service pattern supports favorite objects/datasets, and Fishhealth exposes user-oriented favorite interaction in its interface ecosystem.

## 7.19 APIs and map services

The official Fish Health API documentation states that Fishhealth data include aquaculture sites, salmon lice, diseases and countermeasures. It also documents map services, including WMS/WFS for aquaculture localities with ongoing disease outbreaks and ISA control/surveillance areas. [Official source: Fish Health API]

## 7.20 Fishhealth quality/provenance caveats

The official API documentation says, in substance:

- Data are raw reported data.
- Individual and compiled values can contain inaccuracies.
- Data are not manually corrected by the authority before exposure through Fishhealth/API.
- The authority quality-controls data when using it for its own supervision/decisions.
- External users are responsible for appropriate quality control after publication.

This is a critical architectural principle for any equivalent data platform: **displaying authoritative source data does not mean every derived value is guaranteed to be decision-ready for every use case.**

---

# 8. FishInfo

## 8.1 What FishInfo is

FishInfo is the professional/recreational fishing information service centered on a marine map containing information from Norwegian authorities.

Its purpose is to help users:

- See fishing regulations
- Understand where activities/operations are occurring
- See navigation hazards/warnings
- Check industry interactions
- See fishing facilities where allowed
- Obtain information suitable for chartplotters
- Report fishing gear for authorized users

The official FishInfo description explicitly positions it as a common information base for fishing and offshore activities, including seismic operations. [Official source: About the FishInfo service]

## 8.2 Main map layers observed

### AtoN / navigation

- AtoN (AIS)

### Fishing infrastructure

- Fishing facilities
- Fishing facility buoys
- Lost fishing gear
- Lost fishing gear — found and removed
- Vessels (AIS)

## 8.3 Fishery regulation layer catalogue

The supplied capture lists the following regulation/closed-area layers:

- Fishery regulation
- Temporarily closed areas
- Lofot fishing
- Breivikfjorden local regulation
- Svalbard restriction zone – Fish protection zone
- Fishing ban in vulnerable ecosystems around Svalbard
- Coastal Cod Regulations
- Pollock Seine Regulations
- Cod, haddock, saithe for boats 21–27.9 m
- Cod, haddock, saithe for boats over 28 m
- Restriction zone – coral reef
- Fishing for coastal cod prohibited
- Fishing in coastal cod spawning grounds prohibited
- Lopphavet marine protected area fishing ban
- No-fishing areas in the Oslofjord
- Benthic habitat protected areas
- Cod growing areas – Prohibition areas
- Cod spawning ground – prohibition areas
- Kelp harvesting areas
- Kelp reference areas
- Kelp harvesting ban Revtangen
- Lobster conservation areas
- Maximum measurements for lobster
- Flat oyster harvesting ban in Sørlandsleia

## 8.4 Industry and survey layers

### Surveys, oil and gas

- Cautionary zones
- Surface facilities
- Subsea facilities
- Ongoing seismic activity
- Planned seismic activity
- Ongoing electromagnetic surveys
- Planned electromagnetic surveys
- Ongoing other surveys
- Planned other surveys
- Ongoing surveys – planned work areas

## 8.5 Ice/weather/current layers

- Weather stations
- Severe weather
- Vessel icing
- Ice concentration
- Ice edge
- Sea currents

## 8.6 Other fisheries information

- Statistical areas – locations
- Aquaculture – surface area
- Aquaculture – mooring
- Shrimp fishing grounds
- National salmon fjords
- Trade areas
  - Trade area bankfiske 1
  - Trade area fjord fishing
  - Trade area coastal fishing
  - Trade area liten kystfart
  - Trade area 1
  - Trade area 2
  - Trade area 3
  - Trade area 4

## 8.7 Communication coverage

- VHF Coverage

The supplied data description says this is theoretical coverage; actual coverage depends on factors such as vessel antenna height.

## 8.8 Marine map-detail layers

- Shell sand
- Depth points
- Depth curves
- Seamarks
- Maritime boundaries
- 2 nautical miles
- Place names in the sea
- Place descriptions from the Norwegian Pilot Guide
- Sailing directions from the Norwegian Pilot Guide
- Protected areas
- Fairway area
- Police districts
- Anchorage areas
- Speed limits for commercial vessels
- Speed limits for recreational vessels

## 8.9 Background maps

Observed background-map options include:

- Simple background map with some details on land
- National Mapping Authority background map
- Nautical chart of Norway and Svalbard
- Seabed-type / sediment map in the supplied material

## 8.10 Navigation warnings

FishInfo has a dedicated navigation-warning panel.

Features include:

- Show all warnings
- Show only warnings in the map bounds
- Warning number/identifier
- NAVAREA identification
- Warning title
- Detailed warning text
- Coordinates/bounded area
- Operational timing
- Cancellation information where provided
- Map display of warning area

Observed warning types in the supplied material include:

- Seismic survey operations
- Rocket launch operations
- Unlit lights/navigation marks
- Marine construction / underwater work
- Drifting timber

The service also displays an important safety notice that its warnings are **not a substitute for official navigational warnings** distributed through official maritime channels.

## 8.11 Weather/point query

The service supports a point-on-map workflow where a user can click anywhere on the map to see information such as:

- Weather
- High/low tide timing / ebb and flow information
- Forecast information

The supplied UI also references the modern hourly forecast replacing the older “Marinogram”.

## 8.12 Hourly forecast

The new hourly forecast workflow provides forecasts for:

- Wind
- Waves
- Water levels
- Precipitation
- Fog
- Air temperature
- Air pressure

The supplied notice says future expansions are intended to add:

- Ocean currents
- Sea temperature

## 8.13 Dataset downloads

The supplied interface shows:

- Dataset favorites
- All datasets
- Dataset update time
- Download button
- Multiple output formats
- Link to additional downloadable datasets

The captured FishInfo screen shows **53 datasets** at that point in the interface.

## 8.14 Chartplotter integration

FishInfo is explicitly built around the fact that fishermen use chartplotters as an information source. The service can distribute relevant data in chartplotter-oriented formats.

## 8.15 Fishing-gear reporting

For users with extended access, FishInfo can support:

- Report deployed/set gear
- Report serviced gear
- Report retrieved/hauld gear
- Report lost gear
- Retrieve user's lost-report information
- View more detailed fishing-gear information
- See more vessel information than the public view

The FishInfo Reporting API specifically exists for reporting fixed gear and supports set, serviced, hauled and lost gear reporting. [Official source: Open data via BarentsWatch]

## 8.16 Access levels

The supplied and official material describes extended-access users such as professional fishermen and some other groups.

For foreign fishermen, official documentation says extended access can provide, depending on vessel/account circumstances:

- More vessels displayed
- More detailed fishing-gear information
- Fishing-gear reporting

Foreign users operating a Norwegian fishing vessel can connect to the fishing vessel in the application process; foreign users on foreign vessels without a Norwegian vessel ID need to contact BarentsWatch. [Official source: FishInfo for foreign fishermen]

## 8.17 FishInfo data-distribution role

FishInfo is not merely a visualization layer. It bridges:

```text
Regulation data
+ navigation data
+ industry operations
+ weather/ice
+ gear data
+ vessel information
      |
      v
Interactive map
      |
      +--> human decision-making
      +--> fishing operations
      +--> chartplotter data
      +--> reporting workflows
```

---

# 9. Fishery Activity

## 9.1 What it is

The official service catalogue describes Fishery Activity as a **historical overview of fishing facilities**.

## 9.2 Layers

Observed:

- Fishery activity
- Lost fishing gear
- Lost fishing gear — found and removed

## 9.3 Temporal control

The supplied screenshot shows a **month-based timeline**:

- January
- February
- March
- April
- May
- June
- July
- August
- September
- October
- November
- December

This makes the system suitable for historical/seasonal analysis.

## 9.4 Data download

The service exposes download controls and dataset metadata.

A current 2026 developer update states that the Fishery Activity download is moving from the Fishery Activity app to **BarentsWatch Data**. The same announcement says:

- More filter options will be added to the new download.
- SHAPE-ZIP support is being discontinued.
- GeoJSON newline-delimited output replaces SHAPE-ZIP.
- Several redundant CSV columns are being removed.

[Official source: Changes to the download of fishery activity, 24 April 2026]

## 9.5 Favorites

The service has a My favorites pattern and dataset favorites.

---

# 10. NAIS

## 10.1 What NAIS is

**NAIS is the vessel/AIS intelligence application for Norwegian waters.**

It presents ship locations, vessel information, historical tracks and filtering tools.

## 10.2 AIS data sources

The official AIS documentation says open AIS data are collected from:

- Norwegian Coastal Administration terrestrial stations in Norway and Svalbard
- Offshore stations organized by Equinor
- Norwegian satellites

The public stream is intended to support maritime safety, marine-environment management, transport efficiency, and monitoring. [Official source: Live AIS API]

## 10.3 Public AIS coverage limitations

The currently documented public AIS feed is limited to the relevant Norwegian maritime zones and does **not** include:

- Fishing vessels under 15 m
- Leisure/recreational or sailing vessels under 45 m
- Data older than 14 days

The supplied NAIS page likewise states that smaller fishing and recreational vessels are not displayed because of privacy considerations. [Official sources: Live AIS API; supplied NAIS material]

## 10.4 Live stream

The supplied capture shows a **10-minute update** cadence for the NAIS stream.

## 10.5 Historical AIS

NAIS exposes:

- Historical AIS data
- Up to two weeks in the user interface/data model described
- Vessel tracks over selected historical periods

The official developer ecosystem also documents historical track APIs in addition to live AIS.

## 10.6 Search

- Search for vessels
- Vessel-name lookup
- MMSI-linked vessel identification in relevant APIs

## 10.7 Filters

- Vessel flag
- Vessel type

The UI also groups visible vessels by type.

## 10.8 Vessel-type counters

The supplied screen shows live counts by categories such as:

- Cargo vessel
- Fishing vessel
- Passenger
- Other vessel type
- Tug
- High speed craft
- Search and rescue
- Dredging / underwater operations
- Tanker
- Port tender
- Dive vessel
- Unknown vessel type
- Pilot vessel
- Military
- Law enforcement
- Local vessel
- Medical transport
- Reserved
- Hazardous tanker/cargo subclasses
- Pleasure craft
- Sailing vessel
- Search-and-rescue aircraft

The exact counts change over time; the screen captured a total on the order of several thousand vessels and displayed a first page of vessel names.

## 10.9 Current map information

A selected vessel can be placed into geographic context with:

- Vessel position
- Course
- Speed
- Type
- Flag
- Nearby maritime information
- Historical track functionality where available

## 10.10 User features

- Favorites
- Zone alerts
- My Page
- Apply for extended access
- Registered user/account
- Developer access/API clients

## 10.11 AtoN weather stations

NAIS includes AIS-weather-station information. The supplied description says coastal/North Sea weather stations can broadcast:

- Wind
- Temperature
- Waves

via AIS.

## 10.12 Base maps and marine context

NAIS can overlay:

- Seamarks
- Primary and secondary fairways
- Fairway areas
- Protected areas
- Police districts
- Rocks
- Depth curves
- Depth points
- Weather stations
- Offshore surface facilities
- Anchorage areas
- Commercial speed limits
- Recreational speed limits
- VHF coverage
- VTS areas
- Danger areas
- Navigation warnings
- Severe-weather information

## 10.13 Background maps

Observed:

- Simple background map
- National map from Norwegian Mapping Authority
- Aerial imagery
- Nautical chart of Norway and Svalbard

The supplied material includes explicit notes around nautical-chart coverage at some scales.

---

# 11. Ohoi

## 11.1 What Ohoi is

Ohoi is the recreational-boating service. The official service catalogue describes it as a map with information for recreational boat users, while the portal describes it as information for a safe and pleasant boat trip.

## 11.2 AIS

The supplied Ohoi screen shows a **Vessels (AIS stream)** layer updating every **4 minutes**.

The open AIS data has the same underlying privacy/coverage limits described for the open Norwegian AIS ecosystem.

## 11.3 Navigation layers

Ohoi can provide marine-navigation context including:

- Vessels
- Speed limits
- Fairways
- Seamarks
- Depth
- Place information
- Fishing-related information where appropriate
- Protected areas
- Other operational marine constraints

## 11.4 Weather and marine conditions

The service can be used to inspect:

- Wind
- Wind direction
- Waves
- Wave direction
- Water level/tide
- Temperature
- Forecast conditions
- Weather-station observations

## 11.5 Fishing-related information

The supplied Ohoi material shows:

- Recreational fishing
- Fishing facilities

The detailed vessel association of fishing facilities is restricted to authorized fishermen rather than being public.

## 11.6 Route/planning model

The broader Ohoi design is route-oriented and integrates marine weather/safety conditions with boat-trip planning.

Features documented/observed across the BarentsWatch boating ecosystem include:

- Route-oriented map use
- Point forecasts
- Time-aware conditions
- Vessel awareness
- Safety/navigation layers
- Location sharing/user-position capabilities where implemented
- Emergency-oriented information

## 11.7 Safety

The boating ecosystem includes safety-oriented facilities/information and integrates official marine warnings and local condition data.

---

# 12. ArcticInfo

## 12.1 What ArcticInfo is

ArcticInfo is a specialized service for ships operating in Arctic waters.

The official description targets:

- Fishing boats
- Cruise traffic
- Research vessels
- Expedition vessels

The system combines Arctic weather, ice, navigation warnings, vessel traffic and reporting workflows. [Official source: ArcticInfo material]

## 12.2 Geographic scope

The supplied material describes Arctic information spanning from the Norway/Russia region toward Canada, including:

- Barents Sea
- North Sea
- Arctic waters around Svalbard
- Greenland-related waters
- Broader Arctic vessel coverage for extended users

## 12.3 Ice layers

### Vessel icing

Information describing the risk/process of ice accumulation on ships due to freezing water in sub-zero conditions.

### Ice concentration

- Ice categories
- Fast ice
- Open water
- Concentration values/classes
- High-resolution sea-ice charting

The supplied source says operational sea-ice charts are produced from manual interpretation of satellite data and are updated on working days.

### Greenland ice concentration

Separate Greenland-focused ice concentration information is supplied through Danish sources.

### Ice edge

- Current ice-edge boundary
- Updated regularly on working days
- Satellite-supported analysis
- Focus on Svalbard/Barents Sea regions

### Iceberg limit

- Boundary between ice-free water and bergy water
- Updated approximately 1–2 times weekly

## 12.4 Weather

- Wind
- Wind arrows
- Weather stations
- Sea currents
- Forecast information
- Severe-weather information
- Vessel icing

## 12.5 Navigation warnings

The service includes Norwegian navigation warnings and can show:

- All warnings
- Warnings within current map bounds
- Warning content
- Operational details
- Affected-area geometry

The supplied capture included real warning notices for seismic operations, rocket launches, navigation-light failures, marine operations, and drifting objects.

## 12.6 Maritime map layers

- Place names at Svalbard and Jan Mayen
- Place names in Norwegian sea areas
- Norwegian Pilot Guide place descriptions
- Norwegian Pilot Guide sailing directions
- Maritime boundaries
- Seamarks
- Rocks
- Depth curves
- Depth points
- Protected areas
- Disembarkation sites
- Helipads

## 12.7 Extended access

Authorized users can gain:

- Broader Arctic AIS access
- Vessel association
- Quick access to their vessel on the map
- Greenland ship-reporting capabilities

The application process is manually reviewed according to the supplied documentation.

## 12.8 Offline controls

The supplied ArcticInfo UI contains **offline controls**, indicating special attention to maritime/offline operational usage.

## 12.9 Favorites/downloads

- Favorites
- Dataset downloads
- Dataset metadata
- My Page/account

## 12.10 Background context

ArcticInfo replaced an older Arctic service; the official historical article says the previous service was closed and replaced by ArcticInfo, with its core weather/ice/reporting information retained and expanded. [Official source: The Arctic service is replaced]

---

# 13. Wave Forecast

## 13.1 What it is

Wave Forecast provides specialized marine forecasts for exposed/coastal areas and shipping lanes.

The official material describes forecast information for particularly vulnerable areas and stretches along the Norwegian coast. [Official source: Wave Forecast]

## 13.2 Current UI layers seen in the supplied screenshot

### Wind/wave

- Wind restrictions cruise
- Wind arrows
- Wave forecast for fairways
- Wave arrows
- Crossing waves
- Wave forecast isolines

### Vessel/traffic

- Vessels (AIS)

### Currents

- Sea currents
- Saltstraumen
- Moskstraumen
- Karmsundet
- Langesund
- Vatlestraumen
- Gimsøysundet
- Raftsundet
- Tjeldsundet
- Tromsø area

### Weather/ice

- Weather stations
- Severe weather
- Vessel icing
- Ice concentration

### Marine map detail

- Place names in the sea
- Seamarks
- Depth points
- Depth curves
- Primary and secondary fairways

## 13.3 Forecast horizon

The supplied current UI says the forecast covers the **coming 66 hours** for selected fairways and areas.

Older official explanatory material describes previous model/configuration periods reaching 60–72 hours and three-hour forecast intervals. Therefore, the safest interpretation is:

- **Current supplied UI:** 66-hour forecast wording.
- **Older documentation:** longer/older forecast horizons were used in previous versions/configurations.

## 13.4 Forecast variables

Current/modern hourly forecast material referenced in the supplied source includes:

- Wind
- Waves
- Water levels
- Precipitation
- Fog
- Air temperature
- Air pressure

The future roadmap note in the supplied text mentions plans for:

- Ocean currents
- Sea temperature

## 13.5 Point forecasts

The service supports selecting a point on the map and viewing forecast information.

The supplied UI text says a point can be used to inspect:

- Waves
- Tide
- Wind
- Speed limits

## 13.6 Fairway forecasts

The historical/official Wave Forecast description explains that fairway forecasts can provide:

- Significant wave height
- Maximum wave height
- Wave direction
- Data along selected shipping lanes

The older technical description states calculations can be based on a **100 m grid** and take account of seabed topography and local wind conditions to refine coastal forecasts. [Official source: Special forecasts for waves]

## 13.7 Wave isolines

- Wave-height contours/isolines
- Spatial visualization of wave conditions
- Helps identify areas of greater exposure

## 13.8 Crossing waves

- Detection/visualization of intersecting/crossing wave conditions
- Warnings/analysis for exposed areas

## 13.9 Current information

The current UI has named current-forecast areas for multiple Norwegian straits/locations, including Saltstraumen and the other named current systems listed above.

## 13.10 Route/custom-route model

The Wave Forecast API documentation says the API can support:

- Predefined fairways
- Points
- Custom routes in a larger area
- Wind forecast along fairways
- Wave forecasts along fairways
- Special warnings
- Crossing waves

Older documentation also describes route-oriented planning and custom fairway endpoints.

## 13.11 AIS integration

Because AIS is reusable across the platform, Wave Forecast can place vessel traffic into the wave/current/weather context.

---

# 14. Saltstraumen

## 14.1 What Saltstraumen is

Saltstraumen is a specialized marine-current forecast service focused on the Saltstraumen tidal current near Bodø.

The official service describes it as an automatically updated forecast for the coming **48 hours**.

## 14.2 Daily view

The supplied screen shows day navigation for:

- Wednesday
- Thursday
- Friday
- Saturday
- Sunday
- Monday
- Tuesday

## 14.3 Measurement settings

Users can choose:

- Meters per second (m/s)
- Knots

## 14.4 Forecast graph

The visualization distinguishes:

- Speed out
- Speed in
- Current reversing
- Forecast without weather data

## 14.5 Semantic event extraction

A key feature is that the service translates a continuous forecast curve into understandable events.

Examples:

- Current reversing
- Current reverse
- Tide going out toward Saltfjorden
- Maximum speed out
- Current reversing again
- Tide coming in toward Skjerstadfjorden
- Maximum speed in
- Periods below a speed threshold

This is an example of **derived event generation** from numerical forecast data.

## 14.6 Current speed milestones

The supplied screen reports events such as:

- Less than 3 knots
- 6.4 knots maximum speed out
- 7.3 knots maximum speed in

These values are time-dependent examples from the supplied forecast view.

## 14.7 Forecast freshness

The page displays:

- Time since forecast update
- Warning when the forecast is old/stale
- Current wind state when available
- Current speed state when available

## 14.8 Live webcam

The service includes an integrated **Watch Saltstraumen live** link to a live visual view.

## 14.9 Forecast model information

The page explains that Saltstraumen's timing is influenced by:

- Tide/high-water timing
- Weather
- Water levels
- Wind
- River-water flow
- Local winds
- Spring/neap tide cycle

It also explains that actual current-turn timing can differ from a simple average and that the model accounts for weather effects.

## 14.10 Data sources

The supplied material identifies:

- Saltstraumen forecast — NORCE
- Saltstraumen long-term forecast — NORCE
- Wind forecast — Norwegian Meteorological Institute

---

# 15. Marine Spatial Management Tool 2.0 / Arealverktøy

## 15.1 What it is

The Marine Spatial Management Tool is a GIS/planning environment for assembling and analyzing authoritative marine data to support management of Norwegian sea areas.

The supplied screenshot's description says users can:

- Combine map data
- Analyze map data
- Save maps in a personal map library
- Share maps with other users
- Collaborate in the same map
- Use a catalogue of public/official datasets
- Import their own map data

## 15.2 Core capabilities

- Interactive marine GIS
- Map layer catalogue
- Map library
- Background maps
- Map saving
- Sharing
- Collaboration
- Public/authoritative datasets
- Own-data import
- Analysis tools
- Measurement tools
- Versioning
- Comments

## 15.3 Left-side modules shown in supplied screenshot

- Kartlag / Map layers
- Versjoner og kommentarer / Versions and comments
- Kartinnstillinger / Map settings

## 15.4 Map tools shown in supplied screenshot

The visible toolbar includes functions for:

- Information
- Fullscreen
- Measurement
- Drawing/analysis
- Time/version-related interaction
- Data/API/code-related access
- Map/library interaction
- Favorites or similar saved-map access
- Sharing

The exact icon semantics depend on the application build; this document treats them as observed UI tools rather than inferring undisclosed backend behavior.

## 15.5 Marine-planning data

The system's role is to combine authoritative data about:

- Industry activities
- Environmental values
- Marine infrastructure
- Protected areas
- Other planning-relevant marine spatial information

## 15.6 Collaboration model

The distinctive collaborative pattern is:

```text
Official datasets
      +
User-imported datasets
      |
      v
   Shared map
      |
  +---+---+
  |       |
Save    Share
  |       |
  +---+---+
      |
Collaborative planning
```

---

# 16. Polar Lows

## 16.1 Current status

This needs a special status note because the service has changed.

The supplied current page says:

- There are no Polar Low forecasts on the BarentsWatch page at the moment.
- BarentsWatch's own subscription service was discontinued on **1 April**.
- Varsom.no now offers free natural-hazard alerts that include Polar Lows.

Therefore, as of the supplied current material, BarentsWatch should **not** be described as currently sending its own Polar Low SMS/e-mail alerts.

## 16.2 Current functionality

- Polar-low explanatory/educational material
- Current forecast availability state
- Information about Polar Lows
- Redirect/reference to Varsom.no for active alerts

## 16.3 Historical/legacy functionality

Older BarentsWatch pages described:

- Polar Low forecasts
- SMS alerts
- E-mail alerts
- Seasonal service from roughly October to May

Those descriptions are historical and are superseded by the current discontinuation notice.

## 16.4 API status nuance

The developer portal still lists a **Polar Lows API** among the documented APIs, but the user-facing subscription alert service has been discontinued. API availability and user-facing notification functionality therefore must be treated as separate concepts.

---

# 17. Sustainability in aquaculture

## 17.1 What it is

The BarentsWatch services catalogue lists **Sustainability in aquaculture** as a service described as facts about Norwegian aquaculture.

## 17.2 Historical API

Older BarentsWatch API documentation included a dedicated Sustainability in Aquaculture API and documented datasets such as greenhouse-gas emissions and medication purchases.

However, the BarentsWatch Developer change log states that the dedicated Sustainability in Aquaculture API was removed in **2025**.

Therefore:

- The public/service catalogue entry exists.
- The old dedicated API should **not** be treated as current.
- Historical API documentation must be distinguished from the present API surface.

---

# 18. NordicSpatial

NordicSpatial is a related marine-planning product associated with BarentsWatch's technical development work.

A 2026 BarentsWatch article describes it as a **free, web-based map tool** designed to make cross-border marine spatial planning easier across Nordic and Baltic countries.

## 18.1 Scope

Participating countries/data contributors described by the source include:

- Finland
- Sweden
- Estonia
- Latvia
- Lithuania
- Denmark
- Norway

## 18.2 Core functionality

- Marine spatial planning across national borders
- Common map/data environment
- Official marine data visualization
- Real-time collaboration
- Cross-border situation awareness
- Lower GIS barrier for non-specialists
- Data from EMODnet and HELCOM
- Marine planning for activities such as offshore wind, shipping and protection of sensitive ecosystems

## 18.3 Relationship to Arealverktøy

The article says NordicSpatial builds on systems developed for the Norwegian Arealverktøy experience and on years of marine-planning tooling work.

It is best regarded as a related extension of the BarentsWatch marine-GIS capability rather than merely another layer in a Norwegian-only map.

---

# 19. BarentsWatch Data platform

## 19.1 What the Data service is

BarentsWatch exposes the datasets behind its applications so that external developers can build their own services.

The official site says most of the data found in BarentsWatch services are available as open data via:

- APIs
- Downloads

The Data service provides a central distribution/catalogue role.

## 19.2 Developer use case

The basic pattern is:

```text
BarentsWatch dataset
      |
      +---- Interactive website
      |
      +---- Another application
      |
      +---- Mobile app
      |
      +---- GIS software
      |
      +---- Chartplotter
      |
      +---- Research/analytics pipeline
```

## 19.3 Current documented API families

The current BarentsWatch Developer portal highlights:

- AIS API
- Fish Health API
- FiskInfo API
- Polar Lows API
- Saltstraumen API
- Wave Forecast API

In addition, official open-data documentation describes the **FishInfo Reporting API**, and AquaInfo is documented as being delivered through the Fishhealth API infrastructure. [Official sources: Developer portal; Open data via BarentsWatch]

## 19.4 API architecture

The official documentation says the APIs are generally:

- REST or REST-like
- JSON-based
- HTTPS
- GET for retrieval
- POST for additions
- PUT for updates
- DELETE for removals where applicable

## 19.5 Authentication

The API system requires authentication and supports **OpenID Connect**.

Typical flow:

```text
BarentsWatch account
      |
      v
My Page
      |
      v
Create API client
      |
      +--> Client ID
      +--> Client secret
      |
      v
Token request
      |
      v
Bearer access token
      |
      v
API request
```

The current developer tutorial documents token requests using a client ID/client secret and shows an access token with a one-hour validity period for the example flow. [Official source: Getting started]

## 19.6 Separate API-client scopes

The developer documentation explains that users may need separate clients/scopes for different API families, including a distinct AIS client when using AIS access.

## 19.7 AIS live API

The live AIS API is a real-time stream of vessel positions.

Documented limitations include:

- Norwegian maritime-zone coverage as specified by the service
- No fishing vessels under 15 m
- No leisure/sailing vessels under 45 m
- No data older than 14 days

## 19.8 Historical AIS APIs

The developer ecosystem also provides APIs for historical vessel tracks, including recent track windows and specified periods.

## 19.9 Fishhealth API

Contains data involving:

- Fish farms
- Diseases
- Salmon lice
- Escapes
- Countermeasures
- Vessel traffic at fish farms
- Production-area information
- Other fish-health datasets

Historical data reaches back to **2012** in the official documentation.

## 19.10 FishInfo API

Contains:

- Fishing regulations
- J-notices / J-messages
- Navigation warnings
- Seismic activity
- Vessel information through Ship Register/MMSI lookup
- Chartplotter-oriented datasets

## 19.11 FishInfo Reporting API

Supports reporting workflows involving fixed fishing gear, including:

- Set/deployed gear
- Serviced gear
- Retrieved/hauld gear
- Lost gear
- User's lost reports

The reporting and vessel-specific information is **not open data** in the same sense as the public map datasets.

## 19.12 Wave Forecast API

Supports:

- Wave forecasts
- Wind forecasts
- Predefined fairways
- Points
- Custom routes
- Crossing waves
- Special warnings in defined areas

## 19.13 Saltstraumen API

Provides current forecasts including:

- Current speed
- Current direction

Used by both Saltstraumen and Wave Forecast.

## 19.14 Polar Lows API

Provides Polar Low information reported by the Norwegian Meteorological Institute, but this API's continued listing should not be confused with the discontinued BarentsWatch user-facing subscription-alert service.

## 19.15 GIS map services

The open-data documentation describes WMS/WFS map-service availability through BarentsWatch GeoServer infrastructure.

Examples include:

- Wave forecast isolines
- Wave forecast crossing waves
- Wave forecast point data
- Fishing activity/passive gear
- Fish-farm localities with disease
- ISA control zones
- ISA surveillance zones
- Ice edge

## 19.16 Download formats

The public data ecosystem supports formats including:

- CSV
- JSON
- Chartplotter-oriented formats
- GIS data/service formats
- GeoJSON in relevant current workflows

The Fishery Activity download transition in 2026 specifically moves toward newline-delimited GeoJSON and away from SHAPE-ZIP for that download path.

## 19.17 Licensing

The official open-data page says BarentsWatch's open data is generally available under the **Norwegian Licence for Open Government Data (NLOD)**, subject to dataset-specific terms and attribution requirements.

Not every data element is necessarily identical in licensing: the official Fishhealth developer documentation explicitly notes a commercial license exception for its `v1/shipinfo` data.

## 19.18 API change management

BarentsWatch maintains a developer change log documenting:

- New endpoints
- Endpoint additions
- Obsolete endpoints
- Removals
- Data-model changes
- Format changes
- Filtering changes
- New forecasts
- Other API migrations

This matters for any integration: **BarentsWatch's public API surface evolves over time.**

---

# 20. Data catalogue and metadata model

One of the most useful shared features is the dataset catalogue.

A typical dataset entry can expose:

- Dataset name
- Human-readable description
- Data owner
- Latest update time
- Checked time
- Download button
- Dataset favorite/bookmark
- Format choice where applicable
- Source organization link
- Method/usage notes

## Example provenance model

```text
Dataset
  |
  +-- Owner
  +-- Source organization
  +-- Last update
  +-- BarentsWatch checked time
  +-- Description
  +-- Geometry / semantic meaning
  +-- Download
  +-- API
  +-- Usage/license information
```

## Why this matters

It allows a user to distinguish:

- **What the data says**
- **Who produced it**
- **When the source changed**
- **When the platform checked it**
- **What the geometry means**
- **How reliable/quality-controlled it is for a given use**
- **How to obtain the machine-readable original/derived dataset**

---

# 21. Background maps and cartography

The supplied services show a reusable background-map concept.

Possible backgrounds include:

- Simple land-detail map
- National topographic/background map
- Nautical chart
- Aerial imagery / orthophoto
- Seabed/sediment background where supplied

Marine detail layers can then be placed on top:

```text
Background map
      +
Bathymetry
      +
Seamarks
      +
Fairways
      +
Protected areas
      +
Regulations
      +
Weather
      +
AIS
      +
Industry activity
      +
Forecasts
      |
      v
Operational marine map
```

---

# 22. Common marine/navigation datasets

Across services, the platform can work with layers including:

## Navigation

- Seamarks
- Rocks
- Depth points
- Depth curves
- Fairways
- Fairway areas
- Anchorage areas
- Speed limits
- VTS areas
- Maritime boundaries
- Place names
- Pilot Guide descriptions
- Pilot Guide sailing directions
- Navigation warnings

## Communications

- VHF coverage

## Safety

- Severe weather
- Danger areas
- Access restrictions
- Navigation warnings
- Vessel icing

## Environmental

- Protected areas
- Proposed protected areas
- Seabed types
- Shell sand
- Ice concentration
- Ice edge
- Sea currents
- Weather stations

## Commercial/industrial

- Offshore surface facilities
- Subsea facilities
- Seismic surveys
- Electromagnetic surveys
- Other survey activity
- Aquaculture sites
- Aquaculture moorings
- Fishing facilities

---

# 23. Forecast system as a whole

BarentsWatch is not just a map of static facts. It is a **forecast delivery layer**.

## Forecast categories represented across services

### Atmospheric

- Wind speed
- Wind direction
- Air temperature
- Air pressure
- Precipitation
- Fog
- Severe weather

### Ocean/water

- Wave height
- Maximum wave height
- Wave direction
- Wave period where applicable
- Current speed
- Current direction
- Tide/high/low water
- Water level

### Ice

- Ice concentration
- Ice edge
- Iceberg limit
- Vessel icing

### Derived risk/events

- Crossing waves
- Wind restrictions
- Current reversal
- Maximum current events
- Danger areas
- Navigation warnings

---

# 24. Alert and warning philosophy

BarentsWatch contains several different kinds of warning systems.

## 24.1 Navigation warnings

Operational notices affecting navigation.

## 24.2 Severe weather

Weather warnings/alerts such as:

- Strong wind/storm conditions
- Polar-low conditions in relevant datasets
- Icing risk

## 24.3 Area restrictions

Spatial polygons/areas in which:

- Fishing is prohibited/restricted
- Certain gear/activity is restricted
- Navigation is constrained
- Protected-area rules apply
- Industrial operations create cautions/danger areas

## 24.4 Zone alerts

NAIS exposes a logged-in concept of zone alerts.

## 24.5 Historical Polar Low alert service

The BarentsWatch Polar Low subscription system is discontinued; current active natural-hazard alerting is delegated/referred to Varsom.no.

---

# 25. User accounts and access control

## 25.1 Public vs registered

Many map functions are public.

A registered user can gain additional functions including:

- Favorites
- My Page
- API-client management
- Extended-access applications
- Vessel association in applicable services
- Personal datasets/maps/routes in applicable services

## 25.2 Extended access

Used by certain professional or operational users.

### FishInfo

May unlock:

- More vessels
- More gear detail
- Gear reporting

### ArcticInfo

May unlock:

- Wider Arctic AIS coverage
- Vessel association
- Greenland reporting

### Other restricted services

Use organizational authorization rather than ordinary public access.

## 25.3 My Page

The developer documentation places API-client creation under My Page. User/account functions are also used for:

- Extended-access applications
- Newsletter/email subscription where supported
- Personal service/account management

## 25.4 Privacy

BarentsWatch documents processing of personal data associated with use of the site and specific services, including access to FishInfo, ArcticInfo, NordicSpatial, and historical Polar Low subscriptions.

---

# 26. Restricted operational services

## 26.1 Shared Resource Information Repository (FRR)

### Purpose

FRR supports search-and-rescue and emergency preparedness by maintaining a common picture of available resources.

### Core concepts

- Resource register
- Resource owner
- Resource type
- Resource capability
- Expertise
- Equipment
- Location
- Availability/status
- Contact information
- Shared information among organizations

### Operational value

The official service description emphasizes the ability for operational agencies to find/select/alert the right resource based on factors such as:

- Proximity
- Capability
- Expertise
- Equipment
- Availability

### Participating ecosystem

The official page describes collaboration with organizations including:

- Joint Rescue Coordination Centre
- Norwegian Coastal Administration
- National Police Directorate
- Fire/emergency centers
- Directorate for Civil Protection
- Volunteer rescue organizations

The resource owner can update their own information and share it with other organizations. [Official source: Shared Resource Information Repository]

## 26.2 Joint Operation Tool (JOT)

### Purpose

The Joint Operation Tool is designed to support joint Norwegian rescue-service operations at:

- Operational level
- Tactical level

### Goals

- Faster start-up of rescue operations
- Stronger cooperation
- Shared situational understanding
- Coordinated efforts among public, private and volunteer organizations

### Development basis

The official page says the request came from the Joint Rescue Coordination Centre and the tool builds on FRR.

An expert group from Norwegian rescue organizations contributes domain knowledge and continuous evaluation.

## 26.3 Ocean Surveillance Program

### Purpose

An operational system used by agencies involved in maritime tracking/interaction and analysis.

The current official page describes users conducting:

- Checks
- Events
- Operations
- Analyses of vessel movements

The system provides a **combined/common situational picture** of activity at sea and along the coast. [Official source: Ocean Surveillance Program]

## 26.4 Blue Justice

### Purpose

Blue Justice supports international cooperation against fisheries crime.

### Platform concept

- Cross-country collaboration
- Cross-border fisheries-crime investigations
- Operational agency cooperation
- AIS-based tracking/analysis
- Shared intelligence environment

BarentsWatch is responsible for the **Blue Justice Community** service and the initiative describes further development of a tracking solution using AIS data from Norwegian-owned satellites. [Official source: Blue Justice]

---

# 27. Common analytical patterns

Across the platform, several recurring analytical patterns appear.

## 27.1 Layer composition

```text
Layer A + Layer B + Layer C
          |
          v
Combined spatial situation
```

Example:

```text
Aquaculture sites
+ protected areas
+ shrimp grounds
+ disease zones
+ currents
= contextual aquaculture picture
```

## 27.2 Filtered population analysis

```text
All sites
   |
Apply filters
   |
Matched sites
   |
+----+----+
|         |
Map     List
|         |
+----+----+
     |
Aggregated KPIs
```

## 27.3 Temporal analysis

```text
Year
 |
 +-- Week
      |
      +-- daily/weekly dataset
      |
      +-- historical comparison
      |
      +-- incidents/outbreaks
```

## 27.4 Spatial query

```text
Draw circle/polygon
        |
        v
Intersect with datasets
        |
        v
Return matching features
```

## 27.5 Forecast-to-event transformation

```text
Numerical forecast curve
        |
        v
Detect thresholds / reversals / maxima
        |
        v
Semantic events
```

Saltstraumen is a strong example of this pattern.

---

# 28. Fishhealth's reusable application pattern

This is arguably the clearest reusable design pattern visible in the supplied material.

## 28.1 Pattern

```text
                 +-------------------+
                 | Time selection    |
                 | Year / Week       |
                 +---------+---------+
                           |
                           v
+------------------+   +---+------------------+   +----------------------+
| Filters          |-->| Geospatial result    |-->| Summary / analytics  |
|                  |   | set                  |   |                      |
| thresholds       |   |                     |   | KPIs                 |
| disease          |   |                     |   | disease status       |
| species          |   |                     |   | outbreaks            |
| license          |   |                     |   | incidents            |
| company          |   |                     |   | reporting status     |
| geography        |   +----------+----------+   +----------------------+
| custom geometry  |              |
+------------------+              v
                          +-------+--------+
                          | Map / List     |
                          +-------+--------+
                                  |
               +------------------+----------------+
               |                  |                |
               v                  v                v
           Site detail        Source data      Download/API
```

## 28.2 Why this matters

This pattern can be reused for many domains:

- Fisheries
- Crime geography
- Agriculture
- Logistics
- Environmental monitoring
- Public health
- Disaster response
- Infrastructure monitoring

The important innovation is not one particular disease filter; it is the **combination of temporal state + complex filters + map + aggregate analytics + incidents + provenance + data export**.

---

# 29. Minute UI/interaction inventory

The following small details are part of the observed BarentsWatch interaction language.

## Navigation/application chrome

- Service title/logo
- Login
- Language selector
- Feedback button
- About
- Settings
- Version display
- Current clock/time
- Time zone indication

## Map controls

- Search
- Zoom in
- Zoom out
- Fullscreen
- Measurement
- Draw area
- Draw circle
- Layer picker
- Current location
- Map/background selection
- Map scale
- Coordinate display

## Data controls

- Filter panel
- Themes panel
- Dataset catalogue
- Dataset favorites
- Download
- Format selection
- Source link
- Updated time
- Checked time
- Description

## Temporal controls

- Year
- Week
- Month
- Hour
- Timeline slider
- Previous period
- Next period
- Jump controls
- Current period indicator

## Personalization

- Favorites
- Saved maps
- Shared maps
- Saved routes where supported
- My Page
- User-linked vessel

## Reporting/operations

- Show list
- Show all alerts
- Show warnings in map bounds
- User gear reporting
- Incident display
- Outbreak display
- Resource data for restricted services

## Explainability

- Collapsible information boxes
- Threshold explanations
- Method explanations
- Data-source descriptions
- Safety disclaimers
- Dataset caveats
- Model notes

---

# 30. Examples of concrete dataset metadata observed in the supplied material

The supplied screenshots/text contain multiple examples of current metadata fields.

## AquaInfo examples

- Municipalities — Norwegian Mapping Authority
- Production areas — BarentsWatch
- Aquaculture sites — Directorate of Fisheries + Norwegian Food Safety Authority + Norwegian Veterinary Institute
- Aquaculture site area — Directorate of Fisheries
- Aquaculture moorings — Directorate of Fisheries
- Fish slaughterhouses — Norwegian Food Safety Authority
- National salmon fjords — Directorate of Fisheries
- Protected areas — Norwegian Environment Agency
- Proposed protected areas — Norwegian Environment Agency
- Offshore opportunity/planning layers — Directorate of Fisheries

## FishInfo examples

- Navigation warnings — Norwegian Coastal Administration
- Weather stations — Norwegian Meteorological Institute + Danish Meteorological Institute + Norwegian Coastal Administration
- Severe weather — Norwegian Meteorological Institute
- Sea currents — Norwegian Meteorological Institute / NORCE depending on location
- Seamarks — Norwegian Coastal Administration
- Depths — Norwegian Mapping Authority
- Speed limits — Norwegian Coastal Administration
- VHF coverage — Norwegian Maritime Authority
- Surface facilities — Norwegian Petroleum Directorate / related authority data

## ArcticInfo examples

- Ice concentration — Norwegian Meteorological Institute
- Greenland ice concentration — Danish Meteorological Institute
- Ice edge — Norwegian Meteorological Institute
- Iceberg limit — Danish Meteorological Institute
- Norwegian navigation warnings — Norwegian Coastal Administration
- Danish navigation alerts — Danish Maritime Authority
- Protected areas — Norwegian Environment Agency

---

# 31. Data quality and safety caveats

A serious recreation of BarentsWatch should preserve the system's explicit caveat culture.

## 31.1 Raw data may contain inaccuracies

The Fishhealth API documentation explicitly warns that raw farm-reported data may contain inaccuracies and that users are responsible for suitable quality control.

## 31.2 Some coordinates are not quality checked

The supplied AquaInfo description specifically warns that NYTEK aquaculture mooring coordinates are not quality checked.

## 31.3 Some datasets are not intended for navigation

The supplied NAIS/related material contains explicit warnings for particular offshore-facility data that the information can contain errors and is **not suitable for navigation**.

## 31.4 BarentsWatch navigation warnings are not substitutes

The FishInfo page explicitly says its navigation-warning publication does not replace official maritime warning systems.

## 31.5 Privacy-driven AIS filtering

Smaller vessels are excluded from public AIS presentation according to the documented public feed limitations.

## 31.6 Update time versus checked time

A dataset's "updated" time may differ from the platform's "checked" time. This is a useful distinction in data provenance.

---

# 32. Current 2026 platform evolution

The developer change log shows that BarentsWatch is an actively changing platform.

Relevant 2026 updates include:

- FiskInfo Buoys API update
- Fishery Activity download changes
- Removal of obsolete Waveforecast endpoints
- Fishhealth license-report download limits
- AIS filtering updates
- New AIS data properties
- New point-forecast endpoints
- New current-forecast endpoints

This confirms that the platform should be considered a **living service/data platform**, not a frozen specification.

---

# 33. Historical vs current capability management

When documenting BarentsWatch, it is important to separate three categories:

### A. Current UI/service functionality

What the current service visibly offers.

### B. Current developer/API functionality

What the current API documentation and developer portal exposes.

### C. Historical/legacy functionality

Older endpoints, discontinued services, or old descriptions that are no longer current.

Examples:

- **Polar Low subscriptions:** historically active; currently discontinued.
- **Sustainability in Aquaculture API:** historically documented; removed in 2025.
- **Fishery Activity SHAPE-ZIP download:** being replaced in 2026 by a Data-service workflow using GeoJSON newline-delimited output.
- **Old `/api` endpoints:** removed in favor of the newer `/bwapi` architecture years earlier.

---

# 34. BarentsWatch as a system architecture

A conceptual architecture that matches the documented capabilities is:

```text
                           +-----------------------+
                           | External source orgs  |
                           +-----------+-----------+
                                       |
                 +---------------------+-----------------------+
                 |                     |                       |
                 v                     v                       v
             Static GIS           Live streams            Forecast models
                 |                     |                       |
                 |                     +-----------+-----------+
                 |                                 |
                 +---------------------+-----------+
                                       |
                                       v
                          +----------------------------+
                          | Shared BarentsWatch layer  |
                          |                            |
                          | ingestion                  |
                          | normalization              |
                          | geospatial services        |
                          | time/version handling      |
                          | metadata/provenance       |
                          | authentication            |
                          | API gateway/distribution  |
                          +-------------+--------------+
                                        |
              +-------------------------+--------------------------+
              |                         |                          |
              v                         v                          v
       Specialized apps          Data/API layer           Restricted tools
              |                         |                          |
      +-------+------+          +-------+-------+          +-------+--------+
      |              |          |               |          |                |
      v              v          v               v          v                v
   FishInfo       Fishhealth  REST APIs       GIS/WMS   FRR/JOT         Surveillance
   AquaInfo       ArcticInfo  Downloads       /WFS      Blue Justice      systems
   NAIS           Ohoi       Chartplotter                          
   Wave Forecast  Saltstraumen
   Fishery Activity
   Arealverktøy
```

---

# 35. BarentsWatch feature matrix

| Capability | AquaInfo | Fishhealth | FishInfo | Fishery Activity | NAIS | Ohoi | ArcticInfo | Wave Forecast | Saltstraumen | Arealverktøy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Interactive GIS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Search | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Filters | ✓ | ✓✓✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Custom area | — | ✓ | service-dependent | — | — | route-oriented | service-dependent | custom routes | — | ✓ |
| Time navigation | ✓ | ✓✓✓ | ✓ | ✓ | historical | forecast | ✓ | ✓ | days/hours | versioned maps |
| AIS | ✓/context | ✓ | ✓ | —/context | ✓✓✓ | ✓ | ✓✓ | ✓ | — | context-dependent |
| Weather | context | context | ✓ | context | ✓ | ✓ | ✓ | ✓✓✓ | wind input | context |
| Waves | context | — | ✓ | — | context | ✓ | ✓ | ✓✓✓ | — | context |
| Ice | — | — | ✓ | — | —/context | context | ✓✓✓ | ✓ | — | — |
| Currents | — | — | ✓ | — | — | context | ✓ | ✓✓ | ✓✓✓ | — |
| Regulations | — | — | ✓✓✓ | — | — | context | navigation | — | — | planning |
| Health/disease | — | ✓✓✓ | — | — | — | — | — | — | — | context |
| Statistics | ✓✓✓ | ✓ | — | historical | counts | — | — | — | — | — |
| Download | ✓ | ✓ | ✓✓✓ | ✓ | data/API | data-dependent | ✓ | API | API | map/data |
| API | shared infrastructure | ✓ | ✓ | Data migration | ✓ | shared | ✓ | ✓ | ✓ | GIS/data |
| Favorites | ✓ | ✓/common | ✓ | ✓ | ✓ | ✓/common | ✓ | ✓ | account | ✓ |
| Extended access | service/account | account | ✓ | account | ✓ | — | ✓ | — | — | account |
| Sharing/collaboration | — | sharing tools | — | — | — | — | — | route use | — | ✓✓✓ |
| Operational use | medium | high | high | medium | high | safety | high | high | local | planning |

Legend: `✓` documented/observed; `✓✓` strong/central; `✓✓✓` a defining capability; `—` not a central documented function.

---

# 36. Complete domain feature inventory

This section is a compact “everything checklist” suitable as a requirements baseline.

## 36.1 Mapping/GIS

- Interactive map
- Pan
- Zoom
- Scale bar
- Coordinate readout
- Search
- Map layers
- Layer toggling
- Layer descriptions
- Layer metadata
- Background maps
- Nautical charts
- Aerial imagery
- National base maps
- Seabed/sediment maps
- Measurement
- Distance measurement
- Area measurement
- Point selection
- Object selection
- Custom polygons
- Custom circles
- Map bounds
- Layer overlays
- Spatial intersection logic
- Administrative boundaries
- Marine boundaries
- Protected-area geometry
- Fairway geometry
- Planning polygons

## 36.2 Temporal intelligence

- Year picker
- Week picker
- Month picker
- Hour timeline
- Date range display
- Historical navigation
- Forecast navigation
- Timeline slider
- Previous/next period
- Selected-week state
- Selected-year state
- Dataset update timestamps
- Data checked timestamps
- Forecast freshness
- Historical disease data
- Historical fishing activity
- Historical AIS

## 36.3 Search/filtering

- Text search
- Vessel search
- Company search
- County filter
- Municipality filter
- Production-area filter
- Species filter
- License filter
- Purpose filter
- Disease filter
- Lice threshold filter
- Reporting-status filter
- Treatment filter
- Vessel flag filter
- Vessel type filter
- Regulation layer filter
- Time filter
- Custom geographic filter
- Proximity filter
- Map-bounds filter

## 36.4 Data provenance

- Data owner
- Source organization
- Update timestamp
- Checked timestamp
- Human-readable description
- Data-source link
- Quality notes
- Method notes
- Usage restrictions
- License information

## 36.5 User account

- Register/login
- My Page
- Favorites
- Dataset favorites
- API clients
- Extended-access application
- Vessel association
- Service-specific account state
- Personalization

## 36.6 Data exchange

- REST/REST-like APIs
- JSON
- HTTPS
- OpenAPI
- OpenID Connect
- Bearer access tokens
- CSV
- GeoJSON
- Newline-delimited GeoJSON for current Fishery Activity download migration
- Chartplotter formats
- OLEX in observed Fishery Activity/FishInfo download UI
- WMS
- WFS
- GIS consumption

## 36.7 Realtime streams

- Live AIS
- Vessel position updates
- AIS-weather stations
- Live-ish fishing facility information for authorized workflows
- Current forecast refreshes
- Weather refreshes
- Warning updates

## 36.8 Forecasting

- Wind
- Waves
- Maximum waves
- Wave direction
- Crossing waves
- Wave isolines
- Water level
- Tide
- Sea currents
- Current direction
- Severe weather
- Vessel icing
- Ice concentration
- Ice edge
- Iceberg limit
- Forecast freshness
- Route-aware forecast
- Fairway-aware forecast
- Point forecast

## 36.9 Marine safety/navigation

- Navigation warnings
- Warning polygons
- Official-source links
- Fairways
- Seamarks
- Rocks
- Depths
- Anchorage areas
- Speed limits
- VHF coverage
- VTS areas
- Danger areas
- Pilot Guide descriptions
- Sailing directions
- Navigation restrictions

## 36.10 Fisheries

- Fishing regulations
- Temporary closures
- Species-specific restrictions
- Gear locations
- Fishing facilities
- Gear reporting
- Lost gear
- Found/removed gear
- Fishing activity history
- Trade areas
- Fishing grounds
- Spawning grounds
- Habitat protection
- Kelp protection/harvesting controls
- Lobster areas
- Oyster restrictions
- Coral reef restrictions
- Svalbard restrictions

## 36.11 Aquaculture

- Aquaculture sites
- Permitted site areas
- Moorings
- Slaughterhouses
- Production areas
- Traffic-light/growth system information
- Salmon lice
- Disease
- Countermeasures
- Cleaner fish
- Medicinal treatments
- Non-medicinal treatment
- Reporting status
- Escape incidents
- Disease outbreaks
- ISA zones
- PD zones
- Aquaculture statistics
- Biomass
- Employment
- Aquaculture-fund payments
- Environmental surveys

## 36.12 Arctic

- Ice concentration
- Greenland ice concentration
- Ice edge
- Iceberg boundary
- Vessel icing
- Arctic AIS
- Navigation warnings
- Greenland reporting
- Vessel association
- Place names
- Svalbard/Jan Mayen information
- Offline controls

## 36.13 Spatial planning

- Map layer catalogue
- Authoritative data
- Industry activity layers
- Environmental-value layers
- Custom data import
- Map saving
- Map library
- Version/comments
- Sharing
- Collaboration
- Cross-border marine planning through NordicSpatial

## 36.14 Operations

- Shared resource registry
- Resource capability data
- Resource location
- Resource availability
- Emergency coordination
- Joint operational/tactical rescue tool
- Common situational picture
- Ocean surveillance
- Vessel-movement analysis
- Fisheries-crime cooperation

---

# 37. Examples of current status values visible in supplied material

The supplied screenshots/text show how operational the UI is.

Examples include:

- Fishhealth: 1,779 aquaculture sites in the selected current map/context
- Fishhealth: selected Week 39 in September 2026
- Fishhealth: lice-threshold status displayed as counts and percentages
- Fishhealth: disease status counts
- Fishhealth: new disease outbreaks
- Fishhealth: escape incidents
- FishInfo: navigation warnings with live/current warning text
- FishInfo: 53 downloadable datasets shown in the captured UI
- NAIS: live vessel counts by category; thousands of vessels in current view
- Ohoi: AIS stream shown as updating every 4 minutes
- NAIS: AIS stream shown as updating every 10 minutes
- Saltstraumen: current events and maximum speeds shown as time-stamped semantic events
- Wave Forecast: current UI states a 66-hour forecast horizon

These values are **snapshots**, not permanent platform constants.

---

# 38. Content/documentation ecosystem

BarentsWatch is also a content/knowledge portal around its services.

## 38.1 Articles

The official portal publishes articles about topics such as:

- Safer Arctic voyages
- Illegal fishing/transport analysis
- Fishhealth updates
- Arctic definitions
- Invasive species
- Marine-data topics
- Open data and APIs
- Fish disease
- Wave forecasting
- Service updates

## 38.2 Tutorials

Examples in the current portal include:

- FishInfo for foreign fishermen
- About the FishInfo service
- Reporting for recreational fishing
- Charting farmed-fish health

## 38.3 Videos

The portal includes explanatory videos, including material about:

- Weekly fish-health overviews
- How BarentsWatch collects, develops and shares marine information

## 38.4 Feedback

User feedback is explicitly part of the platform-development process.

---

# 39. How the major services relate to one another

## 39.1 Shared AIS

```text
                    AIS
                     |
        +------------+------------+-------------+
        |            |            |             |
        v            v            v             v
      NAIS       FishInfo     ArcticInfo    Fishhealth
        |            |            |             |
        +------------+------------+-------------+
                     |
                  Wave Forecast
```

## 39.2 Shared fisheries context

```text
Regulations
Gear
Vessels
Warnings
Seismic operations
Protected areas
Weather
Ice
Depth
Fairways
        |
        v
     FishInfo
        |
        +--> Fishing operations
        +--> Chartplotters
        +--> Fishery Activity
```

## 39.3 Shared aquaculture context

```text
Aquaculture register
+ Fishhealth
+ Directorate of Fisheries
+ Food Safety Authority
+ Veterinary Institute
+ AIS
+ GIS/environment
        |
        v
Fishhealth + AquaInfo
```

## 39.4 Shared GIS planning

```text
Official marine layers
+ Environmental values
+ Industry activities
+ Restrictions
+ Infrastructure
+ Protected areas
+ User data
        |
        v
Arealverktøy / NordicSpatial
```

---

# 40. What BarentsWatch is NOT

To avoid misunderstanding:

- It is **not** just a vessel-tracking website.
- It is **not** just an aquaculture dashboard.
- It is **not** one monolithic GIS application.
- It is **not** simply a government open-data catalogue.
- It is **not** a single weather service.
- It is **not** a commercial maritime navigation app in the ordinary consumer-product sense.
- It is **not** only a public system; several capabilities are restricted to operational users.

It is better understood as a **marine information ecosystem**.

---

# 41. If you wanted to reproduce BarentsWatch's capability set as a software project

The requirements naturally break into layers.

## Layer 1 — Data ingestion

- Government APIs
- GIS feeds
- AIS
- Satellite feeds
- Sensor stations
- Forecast models
- Registers
- Manual/operational reports

## Layer 2 — Data platform

- Canonical schemas
- Spatial data store
- Time-series store
- Metadata catalogue
- Source/owner registry
- Update tracking
- Data-quality status
- Versioning

## Layer 3 — Geospatial infrastructure

- Map tiles
- WMS/WFS
- Vector features
- Spatial indexes
- Geometry intersection
- Buffer/proximity queries
- Coordinate transformation
- Layer styling

## Layer 4 — Realtime

- Streaming AIS
- Event processing
- Live warnings
- Forecast refreshes
- Change detection

## Layer 5 — Forecasting

- Weather
- Waves
- Currents
- Tide
- Ice
- Derived risk/event engines

## Layer 6 — Application framework

- Search
- Layer switcher
- Filter engine
- Timeline engine
- Detail panels
- List/map dual views
- Favorites
- Sharing
- Drawing
- Measurement
- Export

## Layer 7 — Domain applications

- Vessel intelligence
- Fisheries
- Aquaculture health
- Aquaculture economics
- Arctic
- Boating
- Wave forecast
- Current forecast
- Spatial planning

## Layer 8 — Identity/access

- Public access
- User accounts
- OAuth/OIDC
- Role/permission model
- Extended access
- API clients
- Organizational access

## Layer 9 — Operational systems

- Rescue resources
- Incident coordination
- Surveillance
- Cross-agency collaboration
- International fisheries-crime collaboration

---

# 42. Recommended canonical data model for a BarentsWatch-like platform

A domain-neutral version of the model looks like:

```text
DataSource
  id
  owner
  sourceSystem
  license
  updateSchedule

Dataset
  id
  name
  description
  sourceId
  version
  updatedAt
  checkedAt
  geometryType
  temporalCoverage
  qualityNotes
  downloadFormats

Feature
  id
  datasetId
  geometry
  properties
  validFrom
  validTo
  observedAt

Event
  id
  type
  geometry
  startTime
  endTime
  severity
  source

Forecast
  id
  model
  modelRun
  location/geometry
  forecastTime
  variable
  value
  unit
  confidence/quality

User
  id
  profile
  roles

Favorite
  userId
  objectType
  objectId

MapProject
  id
  owner
  layers
  filters
  geometry
  versions
  comments
  sharing

APIClient
  id
  owner
  scope
  secretHash
  createdAt
  lastUsedAt
```

This is conceptual and is **not a claim about BarentsWatch's private internal database schema**.

---

# 43. BarentsWatch's strongest reusable product patterns

## Pattern A — “Common marine picture”

Combine many sources onto a single map.

## Pattern B — “Map + analytics”

Every important spatial result has a corresponding numeric or textual summary.

## Pattern C — “Filter + time”

Do not treat a map as static; let users ask:

> What was true in this location during this week/month/year?

## Pattern D — “Data + provenance”

Show owner, update time, checked time and documentation.

## Pattern E — “Human-readable + machine-readable”

Every important data class can ideally be:

- Seen by a human
- Downloaded
- Accessed through an API

## Pattern F — “Public + authorized detail”

Expose broad public information while protecting sensitive vessel/gear/operational details behind access controls.

## Pattern G — “Derived event layer”

Turn numerical data into events humans can understand.

## Pattern H — “Explain the data”

Every complex filter, threshold or model should have contextual explanation.

---

# 44. Current official source map

The principal official sources reviewed for this reference are:

- BarentsWatch front page — public services and general platform role
- BarentsWatch Services — service catalogue
- BarentsWatch About us — governance and organizational structure
- BarentsWatch Open data via BarentsWatch — API, downloads, GIS services, licensing
- BarentsWatch Developer portal — current API families and update log
- Live AIS API documentation — AIS limits and authentication
- Fish Health API documentation — fish-health data, quality notes, WMS/WFS
- Getting started developer documentation — API client/token flow
- FishInfo tutorials — fishing/gear/chartplotter/access information
- Restricted-service pages — FRR, JOT, Ocean Surveillance Program, Blue Justice
- ArcticInfo official materials
- Wave Forecast official materials
- NordicSpatial official article

---

# 45. Useful official links

- BarentsWatch portal: https://www.barentswatch.no/en/
- Services: https://www.barentswatch.no/en/services/
- Data: https://www.barentswatch.no/data/
- Developer portal: https://developer.barentswatch.no/
- NAIS: https://nais.kystverket.no/
- Ohoi: https://www.barentswatch.no/ohoi/
- ArcticInfo: https://www.barentswatch.no/arcticinfo/
- AquaInfo: https://www.barentswatch.no/akvainfo/
- FishInfo: https://www.barentswatch.no/fiskinfo/
- Fishhealth: https://www.barentswatch.no/fiskehelse/
- Fishery Activity: https://www.barentswatch.no/fiskeriaktivitet/
- Wave Forecast: https://www.barentswatch.no/bolgevarsel/
- Saltstraumen: https://www.barentswatch.no/saltstraumen/
- Arealverktøy: https://kart.barentswatch.no/arealverktoy
- Polar Lows: https://www.barentswatch.no/polarelavtrykk/
- Restricted services: https://www.barentswatch.no/en/restricted-services/

---

# 46. Final mental model

The most useful mental model is:

```text
                         BARRENTSWATCH
                              |
        +---------------------+---------------------+
        |                     |                     |
        v                     v                     v
      PEOPLE                DATA                 OPERATIONS
        |                     |                     |
        |               +-----+------+              |
        |               |            |              |
        v               v            v              v
   Boaters          GIS layers    APIs/Downloads   Authorities
   Fishers          AIS           Forecasts         Rescue
   Aquaculture      History       Metadata          Surveillance
   Analysts         Regulations   Provenance        Fisheries crime
   Planners         Environment   GIS services
        |               |            |
        +---------------+------------+
                        |
                        v
               COMMON MARINE PICTURE
                        |
           +------------+-------------+
           |            |             |
           v            v             v
        Monitor      Analyze       Act/plan
```

Or, in plain English:

> **BarentsWatch takes fragmented marine information that normally lives in different government/research systems and turns it into an integrated set of maps, analytical dashboards, forecasts, historical views, regulatory tools, operational tools, downloads, and APIs.**

Its most technically interesting characteristic is not any one layer. It is the **integration pattern**: real-time + historical + forecast + GIS + domain filters + analytics + provenance + controlled access + machine-readable data, all presented as specialized applications that reuse shared infrastructure.

---

# 47. One-page “all features” checklist

## Platform

- [x] Public marine information portal
- [x] Multiple specialized services
- [x] Restricted operational services
- [x] Common data infrastructure
- [x] Shared GIS functionality
- [x] Open-data distribution
- [x] Developer APIs
- [x] Dataset catalogue
- [x] Data provenance
- [x] User accounts
- [x] Extended access
- [x] Favorites
- [x] Feedback
- [x] Tutorials
- [x] Articles
- [x] Videos

## GIS

- [x] Search
- [x] Pan/zoom
- [x] Coordinate readout
- [x] Scale
- [x] Layers
- [x] Themes
- [x] Settings
- [x] Background maps
- [x] Measurement
- [x] Drawing
- [x] Custom geometry
- [x] List/map views
- [x] Map saving
- [x] Map sharing
- [x] Collaboration
- [x] Version/comments
- [x] Import own map data

## Time

- [x] Year
- [x] Week
- [x] Month
- [x] Hourly forecast
- [x] Historical data
- [x] Forecast timelines
- [x] Selected period
- [x] Update timestamps
- [x] Checked timestamps

## Marine

- [x] AIS
- [x] Vessel search
- [x] Vessel filters
- [x] Historical tracks
- [x] Weather
- [x] Waves
- [x] Currents
- [x] Tide
- [x] Water levels
- [x] Ice
- [x] Icing
- [x] Navigation warnings
- [x] Fairways
- [x] Seamarks
- [x] Depth
- [x] Speed limits
- [x] VHF coverage
- [x] VTS areas
- [x] Anchorage
- [x] Protected areas
- [x] Offshore facilities
- [x] Surveys/seismic

## Fisheries

- [x] Regulations
- [x] Closures
- [x] Gear locations
- [x] Gear reporting
- [x] Lost gear
- [x] Found/removed gear
- [x] Fishing activity history
- [x] Fishing grounds
- [x] Trade areas
- [x] Species-specific restrictions
- [x] Svalbard restrictions
- [x] Habitat protections
- [x] Lobster/oyster/kelp restrictions
- [x] Chartplotter downloads

## Aquaculture

- [x] Sites
- [x] Permitted areas
- [x] Moorings
- [x] Slaughterhouses
- [x] Production areas
- [x] Traffic-light/growth information
- [x] Salmon lice
- [x] Disease
- [x] Countermeasures
- [x] Treatments
- [x] Disease outbreaks
- [x] Escape incidents
- [x] ISA zones
- [x] PD zones
- [x] Species filters
- [x] License filters
- [x] Purpose filters
- [x] Company filters
- [x] Geographic filters
- [x] Custom areas
- [x] Municipality statistics
- [x] Biomass
- [x] Employment
- [x] Aquaculture-fund payments
- [x] Historical statistics

## Forecasting

- [x] Point forecast
- [x] Fairway forecast
- [x] Custom route forecast
- [x] Wind forecast
- [x] Wave forecast
- [x] Wave direction
- [x] Maximum wave height
- [x] Crossing waves
- [x] Wave isolines
- [x] Current forecast
- [x] Current direction
- [x] Current event extraction
- [x] Tide/current reversal
- [x] Weather forecast
- [x] Severe-weather layer
- [x] Ice forecast/layers
- [x] Vessel icing

## Arctic

- [x] Arctic AIS
- [x] Ice concentration
- [x] Greenland ice concentration
- [x] Ice edge
- [x] Iceberg limit
- [x] Vessel icing
- [x] Navigation warnings
- [x] Greenland reporting
- [x] Vessel association
- [x] Offline controls

## Operations

- [x] Shared resources register
- [x] Search and rescue support
- [x] Joint rescue operation tool
- [x] Ocean surveillance
- [x] Vessel movement analysis
- [x] Fisheries-crime collaboration
- [x] International cooperation

## Developer/data

- [x] APIs
- [x] OpenAPI
- [x] OAuth/OpenID-style authentication
- [x] Client credentials
- [x] Bearer tokens
- [x] JSON/HTTPS
- [x] CSV
- [x] GeoJSON
- [x] GIS services
- [x] WMS
- [x] WFS
- [x] Chartplotter formats
- [x] API change log
- [x] Dataset downloads
- [x] Metadata
- [x] Licensing information

---

# 48. Bottom line

**BarentsWatch is best understood as a national marine data-and-decision-support ecosystem.**

At the surface, users see specialized services such as NAIS, FishInfo, Fishhealth, AquaInfo, ArcticInfo, Ohoi, Wave Forecast, Saltstraumen, Fishery Activity and Arealverktøy. Underneath, those services reuse common capabilities for GIS, real-time data, historical data, forecasts, identity/access, metadata, APIs and downloads. Behind the public services are restricted operational systems for rescue, surveillance and international fisheries-crime cooperation.

The deepest design pattern is:

```text
SOURCE DATA
    ↓
NORMALIZE + INDEX + GEOREFERENCE + TIME-VERSION
    ↓
COMMON MARINE DATA PLATFORM
    ↓
MAP + FILTER + TIMELINE + ANALYTICS + PROVENANCE
    ↓
DOMAIN-SPECIFIC SERVICE
    ↓
HUMAN UI + DOWNLOAD + API + OPERATIONAL WORKFLOW
```

That is the essence of BarentsWatch.
