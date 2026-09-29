# ORCA â€” AI PROJECT MASTER CONTEXT
## Machine-Readable Single Source of Truth
### SIH 2026 | Problem Statement SIH26176
### Marine EcOsystem Reasoning with Collaborative Agents

> STATUS: AUTHORITATIVE PROJECT CONTEXT
> AUDIENCE: AI coding agents, LLMs, code assistants, autonomous development agents, reviewers
> HUMAN READABILITY: secondary
> PRIMARY PURPOSE: preserve project intent, architecture, priorities, constraints, research conclusions, and implementation direction across AI sessions
> RULE: when repository code conflicts with this document, inspect the code/tests/current contracts and update this document only when the project decision has intentionally changed. Do not silently invent a new direction.

---

# 0. SYSTEM INSTRUCTION FOR AI AGENTS

When working on ORCA, treat this document as the project's strategic and architectural context.

## 0.1 Final product direction

ORCA is the final product identity: a Marine Mission Intelligence platform.

Core principle:

```text
ASK → PLAN → DISCOVER → REASON → DECIDE → EXPLAIN → SIMULATE → ADAPT
```

ORCA is not another marine data dashboard. It is the intelligence and reasoning layer above existing marine information systems.

Primary value:

```text
DATA → REASONING → DECISION → ADAPTATION
```

Primary user:
- Fisherman / field marine user

Institutional users:
- Fisheries officers
- Fleet / boat operators
- Researchers
- Emergency / SAR users
- Administrators / operations users

The product promise is:

> A field user should describe a marine mission or question in natural language, and ORCA should determine what information is needed, retrieve and correlate the relevant evidence, reason over time and geography, apply safety constraints, decide, explain the rationale, simulate alternatives, and adapt as the mission changes.

## 0.2 Final product strategy

ORCA has two product interfaces sharing one intelligence core.

### A. Mobile Field Application
Primary field product for:
- Fishermen
- Crew
- Other field users where appropriate

Purpose:
- Low-friction interaction
- Voice-first interaction where useful
- GPS / location
- Mission context
- Marine decision
- WHY explanation
- WHAT-IF exploration
- Maps
- Alerts
- Offline / low-connectivity capability

The mobile app is a native field product and does not attempt to reproduce the entire institutional web platform.

### B. Web Platform
Primary:
- Public / demo entry point
- Institutional / operations interface
- Research / analytics interface
- Role-specific views

Roles may include:
- Fisherman
- Boat owner
- Fleet operator
- Fisheries officer
- Researcher
- Emergency / SAR
- Administrator

The web platform exposes more operational and analytical complexity than the mobile field experience, without duplicating the intelligence core.

## 0.3 Shared intelligence core

Mobile and web must use the same ORCA backend and intelligence layer.

```text
                    ORCA CORE
                       │
          +------------+------------+
          |                         │
       MOBILE                      WEB
   React Native + Expo            Next.js
          │                         │
          +------------+------------+
                       │
                    FastAPI
                       │
             Mission / Agent / Data
                       │
        Decision + Evidence + GIS
```

Shared concepts include:
- MissionState
- MarineContext
- Source Registry
- Decision Engine
- Safety / Constraint Engine
- Evidence / Provenance
- Explanation Engine
- Route / GIS services
- Alerts
- What-if / Decision Delta
- Data modes

## 0.4 Final platform stack

### Mobile (final)
React Native + Expo + TypeScript

Use React Native with Expo as the mobile application technology.

Target:
- Primarily Android for field / SIH use case
- iOS remains possible for future expansion

The mobile app is a real native product, not a mobile website.
Expo / EAS is the intended build and distribution path.

Mobile distribution model:
- EAS build / install distribution for development and demo
- Google Play testing or release later if appropriate

Important distinction:
- Web: Next.js → Vercel / hosting → URL
- Mobile: React Native + Expo → EAS build → Android application → distribution / install link

Expo Web is optional and not the primary mobile strategy.

### Web (final)
Next.js + React + TypeScript

The web platform is the primary frictionless demo and judging surface. Existing Vercel / Render deployment remains the public demo entry point and should not be replaced or redesigned in this task.

### Backend / core (final intended stack)
- Python
- FastAPI
- PostgreSQL
- PostGIS
- Redis
- SQLAlchemy
- Alembic
- Shapely / GeoPandas / PyProj as appropriate
- LangGraph for agent orchestration where applicable
- Object storage such as S3 / MinIO for large scientific / EO assets
- OpenTelemetry + Prometheus / Grafana for observability where already planned

Critical rule:
- LLMs / agents understand intent, plan, select tools / sources, synthesize, and explain.
- Deterministic services handle GIS, spatial calculations, temporal validity, route calculations, safety constraints, geofencing, evidence validation, and hard decision rules.

Safety-critical decisions must not depend solely on LLM output.

## 0.5 Mobile vs web responsibility

### Mobile = field-first
Prioritize:
- Fisherman workflow
- Mission setup
- Ask ORCA
- Decision
- WHY
- WHAT-IF
- Map
- GPS
- Voice
- Offline / cache
- Alerts

### Web = platform / institution-first
Prioritize:
- Fisherman demo experience
- Operations
- Fleet
- Fisheries
- Research
- Emergency / SAR
- Analytics
- Evidence
- Historical / replay views
- Broader maps / data layers

Do not require feature parity between mobile and web.

## 0.6 Demo / judging strategy

This is final.

Primary demo:
- Existing deployed Next.js web URL

Reason:
- Zero installation
- Immediate judge access
- Works from PPT link / QR
- Can expose Fisherman Mode + institutional roles
- Main judging surface

Mobile:
- Build a focused native React Native + Expo fisherman MVP
- Demonstrate in the demo video
- Can be distributed through an installable EAS / Android link

Judges should not be expected to install the APK as the primary way to experience ORCA.

PPT flow:
1. Primary QR / link → deployed web demo
2. Optional QR / link → mobile app distribution / install
3. Demo video → shows actual mobile app + web platform

Do not create a second web product merely because mobile needs a shareable URL.

## 0.7 Mobile MVP scope

Intended initial mobile scope only:
1. Mission setup / context
2. Ask ORCA
3. Decision: GO / CAUTION / AVOID or applicable decision state
4. WHY / evidence
5. WHAT-IF / Decision Delta
6. Marine map
7. GPS / location
8. Voice
9. Offline / low-connectivity support
10. Alerts where already supported

Do not expand mobile into a full institutional dashboard.

## 0.8 Demo mode and data honesty

ORCA should support a controlled demo / prototype mode where applicable.

Important distinction:
- LIVE
- LIMITED
- CACHED_REAL
- HISTORICAL
- MOCK
- UNAVAILABLE

Never claim mock / cached data is live.

Demo scenarios should be reproducible and should use the same ORCA reasoning pipeline as much as possible.

---

# 1. PROBLEM STATEMENT

## 1.1 Official SIH problem

```yaml
problem_id: SIH26176
title: ORCA Marine EcOsystem Reasoning with Collaborative Agents
organization: Indian Space Research Organisation (ISRO)
category: Software
theme: Space Technology
```

The problem asks for an agentic AI conversational platform that can access, analyze, and reason over marine information in natural language.

The platform is expected to:

- interpret user intent
- decompose complex requests into executable tasks
- coordinate specialized agents
- discover/retrieve relevant marine/geospatial datasets
- perform spatial-temporal reasoning
- synthesize actionable recommendations
- correlate multiple sources rather than merely retrieve individual datasets
- explain reasoning
- provide maps/charts/geospatial visualization
- provide proactive alerts
- support geofencing
- support route optimization/safe navigation
- support contextual, multi-turn interaction
- support Indian regional languages
- provide evidence-backed recommendations

The expected architecture encourages modular collaborative agents for planning, marine data discovery, weather, ocean analytics, geospatial reasoning, risk assessment, visualization, reporting, and user interaction.

## 1.2 Important interpretation

The problem statement does NOT require a specific framework, LLM provider, number of agents, database, cloud architecture, messaging platform, or UI stack.

Do not create requirements that are not in the problem statement.

---

# 2. STRATEGIC POSITION

## 2.1 Existing ecosystem reality

India already has substantial marine information infrastructure.

Relevant systems researched include:

- INCOIS PFZ
- INCOIS OSF
- INCOIS SVAS
- INCOIS ORCA
- IMD marine weather/forecast services
- SACHET alerts
- Nabhmitra / VCSS
- MOSDAC
- CMFRI / NMFDC
- GIS/restriction/boundary datasets
- related maritime/ocean services

Therefore:

```text
EXISTING SYSTEMS
Observe â†’ Forecast â†’ Advise â†’ Alert â†’ Disseminate

ORCA
Understand â†’ Orchestrate â†’ Correlate â†’ Reason â†’ Decide â†’ Explain â†’ Simulate â†’ Adapt
```

ORCA should consume and reason over the ecosystem instead of rebuilding every existing service.

## 2.2 Strategic statement

Use this when deciding whether a feature belongs:

> **ORCA is the mission-intelligence layer above existing marine information systems.**

## 2.3 Product tagline

Primary:

> **ASK. SIMULATE. DECIDE. ADAPT.**

System identity:

> **DATA â†’ REASONING â†’ DECISION â†’ ADAPTATION**

---

# 3. THE CORE PRODUCT ABSTRACTION: MISSION

The most important architectural transformation is from:

```text
QUERY â†’ ANSWER
```

to:

```text
MISSION â†’ EVIDENCE â†’ REASONING â†’ DECISION â†’ SIMULATION â†’ ADAPTATION
```

A user query is an interaction with a mission, not an isolated text request.

## 3.1 MissionState / Mission Twin

Every meaningful interaction should resolve into or update a canonical mission state.

Conceptual schema:

```yaml
MissionState:
  user:
    identity:
    locale:
    profile:

  vessel:
    type:
    size:
    speed:
    range:
    capabilities:
    safety_constraints:

  objective:
    type: fishing | transit | research | emergency | other
    description:

  origin:
    latitude:
    longitude:
    name:

  destination:
    latitude:
    longitude:
    name:

  operation_area:
    geometry:

  timing:
    departure:
    operation_start:
    operation_end:
    return_deadline:

  constraints:
    legal:
    safety:
    operational:
    vessel:
    user_preferences:

  preferences:
    distance:
    fuel:
    time:
    opportunity:
    risk_tolerance:

  selected_area:
    geometry:

  route:
    geometry:
    waypoints:

  previous_decision:
    decision:
    confidence:
    evidence:
    decisive_factor:

  current_context:
    weather:
    ocean:
    waves:
    wind:
    current:
    pfz:
    alerts:
    restrictions:
    vessel_context:

  provenance:
    sources:
    timestamps:
    validity_windows:
    quality:

  uncertainty:
    missing:
    conflicts:
    freshness:
```

This is a conceptual contract. Do not add fields casually; update the canonical model when the project intentionally changes.

## 3.2 Why MissionState exists

It enables:

```text
User:
"Can I go tomorrow?"

ORCA:
decision + explanation

User:
"Why?"

ORCA:
explanation using same mission/evidence

User:
"What if I leave at 11?"

ORCA:
counterfactual mission + recomputation

User:
"What changed?"

ORCA:
decision delta
```

The system must NOT treat these as unrelated queries.

---

# 4. FINAL TARGET ARCHITECTURE

```text
USER CHANNELS
  Web / Mobile UI / Voice
          â”‚
          â–¼
LANGUAGE + INTERACTION
  STT
  Language Detection
  Localization
  TTS
          â”‚
          â–¼
MISSION UNDERSTANDING
  Intent Classification
  Entity Extraction
  Missing-Context Detection
  Mission Update
          â”‚
          â–¼
MISSION STATE / MISSION TWIN
  User
  Vessel
  Objective
  Origin / Destination / Area
  Departure / Operation / Return
  Constraints
  Preferences
  Previous Decision
          â”‚
          â–¼
ORCA PLANNER / ORCHESTRATOR
  Query Type
  Evidence Plan
  Tool Selection
  Dependency Ordering
  Parallelization
  Validation
  Re-planning
          â”‚
          â–¼
SOURCE REGISTRY
  Capability
  Authority
  Coverage
  Resolution
  Freshness
  Access
  Quality
  Data Mode
          â”‚
          â–¼
BOUNDED SPECIALIST TOOLS / CONNECTORS
  PFZ
  Ocean / OSF
  Weather / IMD
  Safety / SVAS
  Alerts
  GIS / Restrictions
  Vessel
  Tides
  EO / Satellite
  Fisheries / historical data
          â”‚
          â–¼
UNIFIED MARINE CONTEXT
  Normalized observations
  Forecasts
  Advisories
  Provenance
  Validity
  Quality
  Conflicts
  Missing evidence
          â”‚
          â–¼
VALIDATION + EVIDENCE ENGINE
  Authority
  Freshness
  Spatial applicability
  Temporal validity
  Conflict detection
  Missing evidence
  Evidence lineage
          â”‚
          â–¼
SPATIAL + TEMPORAL + CONTEXTUAL REASONING
  Geometry
  Distance
  Intersection
  Trajectory
  Time windows
  Forecast validity
  Vessel context
  Mission context
          â”‚
          â–¼
CONSTRAINT ENGINE
  HARD CONSTRAINTS FIRST
  Safety
  Legal
  Vessel
  Operational feasibility
          â”‚
          â–¼
DECISION ENGINE
  Candidate generation
  Opportunity
  Risk
  Route cost
  Preferences
  Alternatives
          â”‚
          â–¼
DECISION OBJECT
  Decision
  Confidence
  Decisive factor
  Supporting factors
  Constraints
  Evidence
  Inferences
  Uncertainty
  Alternatives
          â”‚
          â–¼
EXPLANATION ENGINE
  FACT
    â†“
  RELATION / INFERENCE
    â†“
  CONSTRAINT
    â†“
  DECISION
    â†“
  RECOMMENDED ACTION
          â”‚
          â–¼
RESPONSE + MAP + TIMELINE + EVIDENCE
          â”‚
          â–¼
COUNTERFACTUAL / ADAPTATION LOOP
  What-if
  What-changed
  Alternative
  Re-plan
  Re-simulate
  Compare
```

---

# 5. ARCHITECTURAL RULES

## 5.1 LLM responsibilities

LLMs may handle:

- natural-language understanding
- intent interpretation
- entity extraction
- mission clarification
- planning
- tool/source selection
- task decomposition
- coordination
- synthesis
- explanation wording
- multilingual interaction

## 5.2 Deterministic responsibilities

Do NOT let an LLM be the final authority for safety-critical calculations.

Deterministic services should handle:

- distance
- geometry
- point-in-polygon
- geofence intersection
- route geometry
- temporal validity
- forecast window selection
- vessel thresholds
- hard safety constraints
- legal constraints
- evidence lineage
- confidence rules
- source precedence
- numerical aggregation
- decision delta calculations

## 5.3 Principle

```text
LLM = interpretation + planning + coordination + synthesis

CODE = physics/geometry/time/constraints/evidence rules
```

If a decision can be expressed as a deterministic rule, prefer a deterministic implementation.

---

# 6. CANONICAL DECISION OBJECT

All important mission decisions should converge toward a structured object similar to:

```json
{
  "decision": "GO | CAUTION | AVOID | UNKNOWN",
  "confidence": "HIGH | MEDIUM | LOW",
  "mission": {},
  "decisive_factor": "",
  "supporting_factors": [],
  "constraints": [],
  "evidence": [],
  "inferences": [],
  "provenance": [],
  "uncertainty": [],
  "alternatives": []
}
```

## 6.1 Decision semantics

- `GO`: evidence supports proceeding under stated mission constraints.
- `CAUTION`: proceeding may be possible but material risk/uncertainty/constraint exists.
- `AVOID`: a hard safety/legal/operational condition makes the mission unacceptable under current assumptions.
- `UNKNOWN`: evidence is insufficient, stale, inaccessible, conflicting beyond resolution, or otherwise not adequate for a responsible decision.

Do not use `UNKNOWN` merely because a preferred provider is unavailable if another valid evidence source supports a lower-confidence decision.

Do not turn missing evidence into zero risk.

---

# 7. EVIDENCE AND TRUST MODEL

Every important recommendation must know:

```text
WHAT source produced the fact?
WHEN was it produced?
WHEN is it valid?
WHERE does it apply?
HOW authoritative is it?
WHAT quality does it have?
IS it live, cached, historical, or synthetic?
IS there conflicting evidence?
```

## 7.1 Data modes

The project uses explicit runtime/data modes.

Recommended modes:

```text
LIVE
LIMITED
CACHED_REAL
HISTORICAL
MOCK
UNAVAILABLE
```

Never claim `LIVE` unless the current machine-readable retrieval has actually been demonstrated.

Never silently present mock/synthetic data as real.

## 7.2 Source provenance

Every observation should preserve, where available:

```yaml
source:
provider:
product:
retrieved_at:
observed_at:
valid_from:
valid_to:
spatial_coverage:
resolution:
authority:
quality:
mode:
```

## 7.3 Safety principle

```text
Missing evidence != zero risk
Unknown != safe
Synthetic data != live data
Forecast != observation
Advisory != raw observation
```

---

# 8. SOURCE REGISTRY

ORCA should maintain a machine-readable registry describing what each source can answer.

Conceptual structure:

```yaml
source:
  id:
  name:
  authority:
  capabilities:
  coverage:
  spatial_resolution:
  temporal_resolution:
  freshness:
  access_mode:
  supported_query_types:
  data_mode:
  priority:
  limitations:
```

Example:

```yaml
INCOIS_PFZ:
  capabilities:
    - potential_fishing_zones
  authority: official
  coverage: India
  temporal_resolution: daily

INCOIS_OSF:
  capabilities:
    - waves
    - wind
    - currents
    - ocean_conditions
  authority: official
  temporal_resolution: forecast_series

IMD:
  capabilities:
    - marine_weather
    - weather_warning
  authority: official

SACHET:
  capabilities:
    - official_alerts
  authority: official

GIS:
  capabilities:
    - boundaries
    - restrictions
    - protected_areas
    - geofencing
```

The planner should ask:

> What information do I need to answer this mission question?

Then select the minimum sufficient evidence sources.

---

# 9. AUTONOMOUS PLANNING

A request should NOT map permanently to one hardcoded tool chain.

Example:

```text
"Can I go fishing tomorrow?"
```

Likely evidence plan:

```text
1. Understand mission
2. Determine vessel constraints
3. Determine location
4. Determine departure/operation/return window
5. Retrieve marine weather
6. Retrieve ocean conditions
7. Retrieve PFZ/opportunity context
8. Retrieve applicable alerts
9. Check restrictions/geofences
10. Evaluate spatial + temporal exposure
11. Apply hard constraints
12. Produce decision
13. Explain
```

Another query:

```text
"Why did fish productivity decline here?"
```

may require:

```text
1. Historical location/time window
2. SST history
3. chlorophyll/productivity proxies
4. ocean conditions
5. fisheries/catch/effort history if available
6. seasonal baseline
7. anomaly detection
8. correlation analysis
9. cautious explanation
```

Do not force every query through the same tool list.

---

# 10. SPECIALIST AGENTS / TOOLS

Agent count is NOT a goal.

Specialists should exist where they provide bounded expertise or tool access.

Suggested capabilities:

```text
Planner / Orchestrator
Marine Data Discovery
PFZ Intelligence
Weather Intelligence
Ocean Analytics
Geospatial Reasoning
Temporal Reasoning
Risk Assessment
Route / Navigation
Alert Intelligence
Vessel Context
Explanation
Visualization / Reporting
User Interaction
```

Implementation may combine several capabilities into fewer services.

Do NOT create agents merely to make architecture diagrams look complex.

---

# 11. SIGNATURE REASONING FLOW

The flagship ORCA interaction should demonstrate the complete reasoning loop.

## Mission example

```yaml
location: Kochi
vessel:
  size: 5m
  type: small fishing boat
gear: gillnet
departure: "05:00"
fishing_window: "07:00-13:00"
return_deadline: "16:00"
range: "30km"
objective: fishing
```

## Turn 1

```text
User:
"Can I go fishing tomorrow?"
```

ORCA should:

- infer mission
- identify missing context
- select evidence
- retrieve data
- reason spatially
- reason temporally
- apply hard constraints
- decide
- explain
- show map/evidence

## Turn 2

```text
User:
"Why?"
```

ORCA should reuse the mission and evidence context.

Explanation should distinguish:

```text
FACT
The forecast indicates X.

RELATION / INFERENCE
X overlaps the mission's 07:00â€“13:00 operating window.

CONSTRAINT
The vessel profile / safety rule requires Y.

DECISION
Therefore the mission is CAUTION.

ACTION
Consider delaying / shortening / selecting an alternative area.
```

## Turn 3

```text
User:
"What if I leave at 11?"
```

ORCA must create a counterfactual mission and recompute the affected evidence/reasoning.

It must NOT merely change a text field while reusing an invalid static decision.

## Turn 4

```text
User:
"What changed?"
```

ORCA should compare:

```text
ORIGINAL MISSION
vs
COUNTERFACTUAL MISSION
```

and report:

```text
decision delta
changed factors
new evidence
removed evidence
constraint changes
route/map changes
confidence changes
```

This is one of the most important product capabilities.

---

# 12. TEMPORAL REASONING IS FIRST-CLASS

Marine decisions are not only:

```text
WHERE?
```

They are:

```text
WHERE + WHEN + FOR HOW LONG + WITH WHAT VESSEL + UNDER WHAT CONDITIONS?
```

A route can be safe at one time and unsafe later.

A fishing zone can be attractive but inaccessible during the mission window.

A hazard can expire before departure.

A forecast must be evaluated against the mission's time window.

Therefore:

```text
spatial reasoning != sufficient
```

The system must support:

- time-window selection
- forecast validity
- temporal interpolation where scientifically appropriate
- trajectory exposure
- hazard validity windows
- departure-time scenarios
- operation duration
- return deadline
- time-dependent route cost

---

# 13. ROUTE REASONING

Do not implement route optimization as simply:

```text
shortest distance
```

The conceptual route cost should account for:

```text
distance
+ fuel
+ wave exposure
+ wind
+ current
+ hazard exposure
+ restrictions
+ vessel capability
+ mission timing
+ return deadline
```

Hard safety/legal constraints should eliminate invalid routes before soft optimization.

A* or another path algorithm is an implementation mechanism, not the differentiator.

---

# 14. FISHING OPPORTUNITY REASONING

ORCA should not merely show PFZ points.

The target behavior is:

```text
PFZ opportunity
+
SST / ocean context
+
distance
+
travel time
+
fuel
+
weather
+
wave/current conditions
+
legal/geofence constraints
+
vessel capability
+
mission timing
```

Then:

```text
filter impossible/unsafe candidates
â†“
rank feasible candidates
â†“
show why each candidate ranks where it does
â†“
provide alternatives
```

Safety and legal constraints must take precedence over opportunity optimization.

---

# 15. GEOFENCING

Geofencing alone is not a differentiator.

Existing maritime systems already use vessel tracking/geofencing concepts.

ORCA should make geofencing mission-aware:

```text
ROUTE / MISSION
      â†“
INTERSECTS RESTRICTED AREA
      â†“
IDENTIFY EXACT SEGMENT + TIME
      â†“
EXPLAIN CONSTRAINT
      â†“
REMOVE INVALID OPTION
      â†“
GENERATE LEGAL ALTERNATIVE WHERE POSSIBLE
```

The useful product behavior is not just:

> "You entered a restricted zone."

It is:

> "Your proposed mission intersects a restricted area between X and Y. Here is the affected segment and an alternative feasible area/route."

---

# 16. PROACTIVE ALERTS

Do not recreate government alert dissemination unnecessarily.

Use official alerts as authoritative inputs.

ORCA's value is contextualization:

```text
OFFICIAL ALERT
      â†“
WHICH ACTIVE MISSIONS ARE AFFECTED?
      â†“
WHERE?
WHEN?
HOW SEVERE?
      â†“
WHAT ACTION SHOULD THE USER CONSIDER?
```

This makes alerts mission-aware rather than generic.

---

# 17. EXPLAINABILITY

An agent trace is not automatically an explanation.

Do not expose only:

```text
Agent A ran
Agent B ran
Agent C ran
```

Instead expose the reasoning chain:

```text
SOURCE FACT
â†“
SPATIAL/TEMPORAL RELATION
â†“
CONSTRAINT
â†“
DECISION
â†“
ACTION
```

Example:

```text
Fact:
Wave height forecast exceeds vessel threshold.

Relation:
The threshold exceedance occurs during the planned fishing window.

Constraint:
This vessel profile cannot safely operate under that condition.

Decision:
CAUTION / AVOID.

Action:
Delay departure or select an alternative operating window.
```

The explanation engine must be grounded in structured evidence.

LLM prose must not invent scientific justification after a decision has already been made.

---

# 18. SOURCE CONFLICT RESOLUTION

Different sources can disagree.

ORCA needs explicit conflict handling.

Possible dimensions:

```text
authority
freshness
spatial applicability
temporal applicability
product type
resolution
quality
```

Example principle:

```text
Official warning
    >
lower-authority inference
```

But do not hardcode simplistic global precedence where it is scientifically inappropriate.

Conflict resolution must be explicit and auditable.

---

# 19. UNCERTAINTY AND CONFIDENCE

Confidence should describe evidence quality, not make the UI look authoritative.

Confidence should be affected by:

- source availability
- source freshness
- evidence completeness
- source agreement/conflict
- spatial coverage
- temporal validity
- model uncertainty
- fallback source usage

Do not use a 0â€“100 score merely because it looks impressive.

If a score is shown, its semantics must be defined and defensible.

---

# 20. COUNTERFACTUAL REASONING

Counterfactuals are a major focus.

Supported questions should include:

```text
What if I leave at 11?
What if I return by 3?
What if I use another fishing area?
What if wave conditions worsen?
What if the warning expires?
What if I choose a different route?
```

The system should:

```text
clone MissionState
â†“
modify selected variables
â†“
recompute affected evidence
â†“
re-run constraints
â†“
recompute decision
â†“
compare with baseline
```

Do not implement fake counterfactuals that only modify UI text.

---

# 21. DECISION DELTA

For:

```text
original mission
vs
counterfactual mission
```

calculate:

```yaml
decision_delta:
  original_decision:
  new_decision:
  confidence_change:
  decisive_factor_change:
  added_factors:
  removed_factors:
  changed_factors:
  evidence_changes:
  constraint_changes:
  route_changes:
  spatial_changes:
  temporal_changes:
```

The UI should make this visible.

---

# 22. SAFE ALTERNATIVES

A weak decision system says:

```text
AVOID
```

A useful mission-intelligence system tries to say:

```text
AVOID THIS
BECAUSE X
TRY THIS ALTERNATIVE
BECAUSE Y
```

Alternative generation can include:

- later departure
- earlier return
- different fishing zone
- safer route
- shorter operating window
- lower-risk candidate
- alternative legal area

Only provide alternatives that actually satisfy the hard constraints.

---

# 23. HISTORICAL PRODUCTIVITY REASONING

The PS includes questions like:

> Why did fish productivity decline in a coastal region?

This should be treated as a distinct analytical mode.

Potential evidence:

```text
SST
chlorophyll/productivity proxies
ocean conditions
seasonality
historical fisheries data
catch/effort
anomalies
```

Important:

Do not claim causation when the evidence only supports correlation.

Use language such as:

```text
observed
associated with
correlated with
consistent with
possible contributing factor
```

A scientific causal claim requires stronger evidence.

---

# 24. MULTILINGUAL + VOICE

Multilingual and voice are important but are not the core novelty.

Architecture:

```text
Speech
 â†“
STT
 â†“
Language Detection
 â†“
Canonical Mission Representation
 â†“
Canonical Reasoning
 â†“
Localized Response
 â†“
TTS
```

Do not create separate reasoning systems per language.

The mission state and evidence model should remain language-independent.

Supported language behavior should preserve multi-turn continuity.

---

# 25. OFFLINE / LOW-CONNECTIVITY DESIGN

Marine users may have asymmetric connectivity.

Therefore the system should explicitly distinguish:

```text
online
limited
cached
offline
unavailable
```

Potential offline/cached functions:

- last known advisories
- cached forecasts
- mission state
- local vessel profile
- local restriction data
- previously retrieved evidence
- deterministic safety evaluation
- delayed synchronization

Do not claim full offline operation unless actually implemented and tested.

Low-bandwidth channels such as WhatsApp/SMS/satellite delivery are useful later, but should not displace the core reasoning loop.

---

# 26. WHAT TO COPY / ADAPT / AVOID FROM COMPETITORS

This section captures research conclusions.

## 26.1 COPY / ADAPT

### Team Random / blueberry0710 pattern
Copy/adapt:

- mission-first fisher workflow
- source + timestamp + confidence visibility
- explicit cache/offline behavior
- ranked candidate fishing areas
- best-time reasoning
- field-oriented interaction

Do not copy their exact implementation.

### Marine-ORCA / Princevish-dev pattern
Copy/adapt:

- planner + specialist capabilities
- deterministic safety engine
- critic/conflict handling
- source traceability
- route reasoning
- guardian/monitoring concept
- local-first reproducible demo

### ORCA-AI / Pixel-Pioneer6 pattern
Copy/adapt:

- field UX principles
- vessel-aware workflows
- large, clear operational controls
- high-glare / wet-environment considerations

Do not immediately build every stakeholder dashboard.

### SagarMitra pattern
Adapt:

- EO integration ambition
- geodesic/geospatial reasoning
- geofencing
- route optimization

Rule:

> Only claim live/real EO capability when the actual runtime proves it.

### ChandanrajM / ReAct pattern
Adapt:

- dynamic tool selection
- iterative observe â†’ reason â†’ act loops
- tool-based planning

Do not allow unrestricted arbitrary tool execution.

### forampatel24 pattern
Copy principle:

- source/dataset registry
- explicit data capability metadata

Do not build infrastructure for its own sake.

### FROZENFIRE07 pattern
Copy:

- prompt/tool security boundaries
- typed tool permissions
- validation
- prompt-injection awareness

### DRISHTI pattern
Copy:

- explicit LIVE/DEMO/HISTORICAL states
- honest limitations
- clear unavailable-provider behavior

### BlueCurrent pattern
Adapt:

- evidence-backed map answers
- marine data fusion
- evidence visibility

### AquaVerse pattern
Adapt:

- risk-centric presentation
- forecast integration
- operational dashboard concepts where they directly support mission decisions

### Fisherman OS pattern
Defer/adapt later:

- WhatsApp-first access
- low-bandwidth delivery

Useful after the core mission reasoning engine is reliable.

---

# 27. DO NOT CHASE THESE AS PRIMARY DIFFERENTIATORS

These are baseline/converging features:

```text
generic multi-agent architecture
generic chatbot
generic multilingual support
generic voice
PFZ display
weather display
basic ocean data display
generic safety score
basic geofencing
basic A* route
generic map
generic RAG
agent-count marketing
```

If implemented, they must support the deeper mission reasoning loop.

---

# 28. EXPLICITLY AVOID

Do NOT prioritize:

```text
15+ agents just for architecture diagrams
huge microservice architecture
giant Kubernetes/cloud setup before core functionality
generic RAG as the main reasoning engine
opaque AI risk scores
fake live data
mock data presented as real
hardcoded formulas presented as satellite intelligence
unrestricted LLM tool execution
feature-heavy authority/researcher dashboards before core fisher mission loop
WhatsApp/SMS before reasoning works
SOS/emergency workflows before core mission reasoning works
raw satellite processing solely for novelty
blockchain
unnecessary infrastructure
social-media sources treated as authoritative marine evidence
```

Also avoid feature sprawl.

---

# 29. CURRENT PROJECT BASELINE

The project has an existing implementation with a strong deterministic foundation.

Previously audited state included:

- backend unit/contract/scenario test coverage
- frontend tests
- FastAPI
- LangGraph cognitive graph
- fallback LLM provider
- memory/session support
- specialist marine tools
- Shapely geofencing
- Haversine PFZ ranking
- deterministic vessel safety thresholds
- evidence IDs
- Sarvam STT/TTS
- multilingual UI
- MapLibre map
- evidence drawer
- agent timeline
- canonical scenario flow

The exact current repository state must always be verified against actual code and tests before claiming completion.

---

# 30. KNOWN BASELINE GAPS FROM THE AUDIT

The audit identified these important gaps/regressions.

## 30.1 Schema/payload regression

A `MarineConditionsPayload` validation issue existed around missing fields such as:

```text
harbor
observed_at
valid_to
```

The immediate requirement is to restore a stable typed observation contract.

## 30.2 Observation bundle lineage

`DataService.get_observation_bundle()` had a regression where a valid case could collapse to `UNKNOWN`.

Observation lineage and evidence propagation must be fixed.

## 30.3 Fallback confidence

Open-Meteo or other valid fallback evidence should not automatically cause:

```text
UNKNOWN
```

when the evidence is sufficient for a lower-confidence:

```text
GO / CAUTION
```

The system must distinguish:

```text
provider unavailable
```

from:

```text
evidence unavailable
```

## 30.4 Missing explanation context

The `explanation_context` capability/tool was missing/not registered in the audited state.

This blocks reliable:

```text
Why?
```

## 30.5 Temporal what-if weakness

The audited implementation could update a time window while reusing static forecast information.

That is not valid temporal simulation.

A changed departure/operation window must trigger appropriate temporal evidence recomputation.

## 30.6 What-changed unsupported

The audited implementation did not fully support:

```text
What changed your recommendation?
```

This requires baseline/counterfactual comparison.

---

# 31. IMPLEMENTATION PRIORITY

The project should now follow this priority order.

## P0 â€” MUST FIX / CORE

### 1. Backend / Orchestrator
Fix schema and payload regressions.

Definition of done:

```text
all relevant backend tests green
typed payloads stable
no hidden validation failures
```

### 2. Marine Data
Fix observation bundle lineage.

Definition of done:

```text
source
timestamp
validity
quality
mode
evidence IDs
```

survive the pipeline.

### 3. Decision / Evidence
Fix fallback confidence.

Definition:

```text
valid fallback evidence
â†’ explicit lower confidence
â†’ GO/CAUTION where justified
```

not automatic UNKNOWN.

### 4. Backend / Orchestrator
Freeze canonical `MissionState`.

Every major query should resolve into a mission state.

### 5. GIS / Temporal
Implement temporal validity and time-window selection.

### 6. Decision / Evidence
Implement hard constraints first.

Order:

```text
Safety
â†“
Legal
â†“
Vessel feasibility
â†“
Operational feasibility
â†“
Opportunity optimization
```

### 7. Frontend
Build mission-first decision UI.

Must show:

- decision
- confidence
- decisive factor
- supporting factors
- evidence
- map
- mission context

### 8. Voice
Connect voice input/output to the same MissionState.

---

# 32. P1 â€” HIGH VALUE

### 9. Backend
Source Registry + planner-driven evidence plan.

### 10. Decision/Evidence
Deterministic `ExplanationEngine`.

### 11. GIS/Temporal
Trajectory exposure engine.

### 12. Backend
Explicit intent classes:

```text
NORMAL
WHY
WHAT_IF
WHAT_CHANGED
ALTERNATIVE
ALERT_IMPACT
```

### 13. Marine Data
Cached-real fixtures + explicit data modes.

### 14. Decision/Evidence
Source conflict policy.

### 15. Frontend
Why panel with evidence causal chain.

### 16. Frontend
What-if controls + Decision Delta.

### 17. GIS
Alternative generation.

### 18. Voice
Multilingual continuity across turns.

---

# 33. P2 â€” STRATEGIC EXTENSION

### 19. Decision/Evidence
Decision robustness / sensitivity analysis.

Example:

```text
Would the decision remain the same if wave height changed by X?
```

### 20. GIS
Time-dependent routing.

### 21. Marine Data
SACHET and other selected connectors.

### 22. Backend
Mission Replay / audit trace.

### 23. Frontend
Replay/source/tool visualization.

### 24. Voice/Integration
Low-bandwidth / WhatsApp / SMS / satellite-ready delivery.

### 25. Decision/Evidence
ORCA-MarineEval benchmark with approximately 30â€“50 representative scenarios.

### 26. Marine Data
Historical CMFRI/research mode.

### 27. Frontend
Field UX hardening.

### 28. Voice
Voice-note / notification workflows.

---

# 34. TEAM OWNERSHIP

The six teammate roles are conceptual ownership boundaries.

## P1 â€” Frontend / UX

Primary:

```text
mission-first UI
decision card
map
evidence
Why
What-if
Decision Delta
mission timeline
field UX
```

Do not build large dashboards before the mission flow works.

## P2 â€” Backend / API / Orchestrator

Primary:

```text
MissionState
planner
intent classes
tool contracts
source registry
orchestration
re-planning
runtime modes
integration contracts
```

P2 is the main integration owner.

## P3 â€” Marine Data / Connectors

Primary:

```text
PFZ
OSF
IMD
SVAS
alerts
source adapters
cached-real fixtures
provenance
timestamps
validity
quality
data modes
```

Do not add connectors endlessly before existing evidence is reliable.

## P4 â€” GIS / Spatial / Temporal

Primary:

```text
geometry
geofencing
trajectory
time windows
temporal forecast lookup
route exposure
alternative generation
time-dependent route cost
```

P4 owns the transition from static map reasoning to mission trajectory reasoning.

## P5 â€” Decision / Evidence

Primary:

```text
hard constraints
risk engine
confidence
source conflict
ExplanationEngine
Decision Object
Decision Delta
robustness
evaluation benchmark
```

P5 owns the scientific/decision integrity of ORCA.

## P6 â€” Voice / Integration

Primary:

```text
STT
TTS
language continuity
voice mission updates
future low-bandwidth channels
```

Voice must consume the same canonical mission and decision objects.

---

# 35. TEAM DEPENDENCY GRAPH

```text
P2 canonical contracts
        â†“
P3 evidence quality
        â†“
P4 temporal/spatial reasoning
        â†“
P5 decision + explanation
        â†“
P1 decision/mission UI
        â†“
P6 voice integration
```

Important:

P1 and P6 should not invent independent business logic.

All clients consume the same backend MissionState / Decision Object.

---

# 36. RECOMMENDED DEVELOPMENT ORDER

Use this order unless a concrete repository dependency requires otherwise:

```text
PHASE 0 â€” BASELINE
    â†“
Fix payload/schema regression
    â†“
Fix observation lineage
    â†“
Fix fallback confidence
    â†“
ALL TESTS GREEN
    â†“
PHASE 1 â€” CORE REASONING
    â†“
Freeze MissionState
    â†“
Freeze typed tool results
    â†“
Temporal validity
    â†“
Hard constraints
    â†“
Decision Object
    â†“
ExplanationEngine
    â†“
WHY
    â†“
PHASE 2 â€” COUNTERFACTUAL
    â†“
Temporal recomputation
    â†“
What-if
    â†“
Decision Delta
    â†“
What-changed
    â†“
Mission Twin UI
    â†“
PHASE 3 â€” OPPORTUNITY + ADAPTATION
    â†“
Candidate ranking
    â†“
Safe alternatives
    â†“
Dynamic route exposure
    â†“
Source conflict
    â†“
Robustness
    â†“
PHASE 4 â€” CHANNELS + EXTENSIONS
    â†“
Voice polish
    â†“
Alerts
    â†“
Low-bandwidth
    â†“
Historical analytics
```

---

# 37. FLAGSHIP DEMO

The demo should be one coherent mission, not disconnected feature demos.

## Recommended mission

```yaml
location: Kochi
vessel_size: 5m
gear: gillnet
departure: 05:00
operation: 07:00-13:00
return_deadline: 16:00
range: 30km
objective: fishing
```

## Conversation

```text
USER:
Can I go fishing tomorrow?

ORCA:
[decision]
[confidence]
[decisive factor]
[evidence]
[map]
[recommended action]

USER:
Why?

ORCA:
[fact]
[relation]
[constraint]
[decision]
[action]

USER:
What if I leave at 11?

ORCA:
[counterfactual decision]
[changed factors]
[new map]
[new evidence]

USER:
What changed?

ORCA:
[original vs new]
[decision delta]
[changed decisive factor]
[changed time exposure]
[changed route/area if applicable]
```

This single interaction should demonstrate:

```text
natural language
intent understanding
mission extraction
planning
tool selection
multi-source correlation
spatial reasoning
temporal reasoning
contextual reasoning
hard constraints
decision
evidence
explanation
counterfactual simulation
adaptation
```

---

# 38. TESTING STRATEGY

Do not judge ORCA primarily by number of unit tests.

Create scenario-based tests around actual mission behavior.

Minimum categories:

```text
normal mission
missing context
provider unavailable
cached evidence
stale evidence
conflicting evidence
hazard during mission
hazard before mission
hazard after mission
geofence intersection
safe alternative
what-if departure
what-if return deadline
route change
vessel constraint
low confidence
official warning override
multilingual continuation
```

Future benchmark:

```text
ORCA-MarineEval
30â€“50 scenarios
```

Each scenario should evaluate:

```yaml
intent_correct:
mission_correct:
tools_selected:
evidence_sufficient:
spatial_reasoning_correct:
temporal_reasoning_correct:
constraint_application_correct:
decision_correct:
confidence_reasonable:
explanation_grounded:
counterfactual_correct:
decision_delta_correct:
```

---

# 39. REPOSITORY / CODE QUALITY RULES FOR AI AGENTS

When modifying the repository:

1. Read existing architecture before adding new abstractions.
2. Search for existing contracts/models before creating duplicates.
3. Reuse existing deterministic utilities where possible.
4. Do not duplicate MissionState definitions.
5. Do not create parallel decision schemas.
6. Do not bypass evidence/provenance.
7. Do not silently introduce fake data.
8. Do not label synthetic data as live.
9. Do not hardcode a demo result into production decision logic.
10. Add tests for behavioral changes.
11. Preserve backwards compatibility when practical.
12. Prefer typed schemas over free-form dictionaries at service boundaries.
13. Keep LLM output constrained by structured schemas.
14. Keep safety-critical decisions deterministic.
15. Avoid adding dependencies unless necessary.
16. Avoid infrastructure expansion unless it directly supports a P0/P1 requirement.
17. Update documentation/contracts when an intentional architectural decision changes.
18. Before declaring completion, run the relevant tests.
19. If tests fail, report the actual failure instead of masking it.
20. Never remove a failing test merely to make the suite green unless the requirement itself has intentionally changed and the replacement test preserves the intended behavior.

---

# 40. AI AGENT DECISION FILTER

Before implementing any feature, ask:

```text
Q1:
Does this improve mission-level reasoning?

Q2:
Does this improve evidence quality/provenance?

Q3:
Does this improve spatial or temporal reasoning?

Q4:
Does this improve safety/legal constraint handling?

Q5:
Does this improve explainability?

Q6:
Does this enable what-if / what-changed / adaptation?

Q7:
Does this improve field usability of the core mission flow?

Q8:
Is this merely another feature competitors already have?

Q9:
Is this infrastructure complexity without direct user value?

Q10:
Can this wait until P0/P1 is complete?
```

If Q1â€“Q7 are mostly `NO` and Q8â€“Q10 are `YES`, deprioritize the feature.

---

# 41. COMPETITIVE POSITIONING

Do NOT claim:

```text
ORCA is the only multi-agent marine system.
ORCA is the only multilingual marine AI.
ORCA is the only PFZ AI.
ORCA is the only system with routing.
ORCA is the only system with geofencing.
ORCA is the only system with voice.
```

Research indicates these capabilities are already common or claimed by multiple implementations.

The defensible project direction is:

> **Integrated, auditable mission-level marine reasoning that dynamically selects evidence, validates it across space and time, applies hard constraints, produces an explainable decision, and recomputes the mission when assumptions change.**

This is the standard the implementation should target.

---

# 42. RESEARCH CONCLUSIONS

## Existing Indian ecosystem

Research found substantial capabilities already available across:

```text
PFZ
ocean forecasts
weather
safety advisories
alerts
vessel communication
geofencing
satellite data
fisheries data
marine visualization
```

Therefore ORCA should integrate and reason over them.

## International lessons

Research reviewed patterns from systems/ecosystems including:

```text
BarentsWatch / Norway
Copernicus Marine
EMODnet
NOAA IEA
Australia BOM
NIWA / EcoConnect
Indonesia marine/weather systems
Japan JMA
Global Fishing Watch
PredictWind
other marine decision-support products
```

General lessons:

```text
interoperability
machine-readable data
metadata/provenance
offline/low-bandwidth support
scenario reasoning
uncertainty
human decision support
workflow integration
```

Do not blindly copy foreign systems; adapt principles to ORCA's mission.

## Competitive research conclusion

Current competing SIH implementations commonly claim or demonstrate:

```text
multi-agent
PFZ
weather
safety
geofencing
route optimization
multilingual
voice
maps
provenance
agent traces
offline/demo modes
```

Therefore the project must go deeper than feature checklist competition.

---

# 43. NOVELTY / WHITESPACE TARGET

The strongest research-backed whitespace identified for ORCA is the combination of:

```text
mission-level reasoning
+
dynamic evidence selection
+
space-time validation
+
hard safety/legal constraints
+
evidence-grounded explanation
+
counterfactual simulation
+
decision delta
+
adaptive replanning
```

No claim should be made that no other system anywhere implements any one of these.

The project differentiation is the integrated workflow.

---

# 44. NON-NEGOTIABLE SAFETY PRINCIPLES

```text
1. Safety overrides opportunity optimization.

2. Legal/restricted areas are hard constraints.

3. Missing evidence is not zero risk.

4. Unknown is not safe.

5. Forecasts are not observations.

6. Synthetic/mock data must be visibly labeled.

7. Live status must be demonstrated, not assumed.

8. Source facts must remain distinguishable from ORCA inferences.

9. LLMs must not invent evidence.

10. Scientific causality must not be claimed from simple correlation.

11. Safety-critical calculations should be deterministic.

12. When evidence is insufficient, communicate uncertainty.

13. Never conceal provider failure behind fabricated certainty.

14. Alternatives must satisfy hard constraints.

15. Every important decision should be replayable from evidence.
```

---

# 45. DEFINITION OF DONE FOR SIH CORE

ORCA core should not be considered complete until the following works coherently:

```text
[ ] Natural-language mission intake
[ ] MissionState persistence
[ ] Vessel/context handling
[ ] Planner/tool selection
[ ] PFZ evidence
[ ] Ocean/OSF evidence
[ ] Weather/IMD evidence
[ ] Safety/SVAS logic
[ ] GIS restrictions/geofencing
[ ] Temporal validity
[ ] Spatial reasoning
[ ] Hard constraints
[ ] Decision Object
[ ] Confidence
[ ] Evidence provenance
[ ] Explainable Why
[ ] Counterfactual What-if
[ ] Decision Delta / What-changed
[ ] Safe alternatives
[ ] Map visualization
[ ] Multilingual continuity
[ ] Voice connected to same mission
[ ] Explicit runtime/data modes
[ ] Reproducible demo fixtures
[ ] Relevant tests green
```

Do NOT expand the scope aggressively before these are stable.

---

# 46. FINAL IMPLEMENTATION PRINCIPLE

When choosing between two implementation options:

Prefer the option that produces:

```text
more reliable evidence
+
clearer reasoning
+
stronger temporal/spatial correctness
+
better safety guarantees
+
better explainability
+
real counterfactual behavior
+
less architectural complexity
```

over an option that produces:

```text
more agents
+
more UI
+
more infrastructure
+
more integrations
+
more buzzwords
```

---

# 47. SHORT AI CONTEXT

If an AI agent has limited context, preserve at least this:

```text
ORCA is a mission-intelligence layer above India's existing marine information ecosystem.

Core loop:
ASK â†’ PLAN â†’ DISCOVER â†’ REASON â†’ DECIDE â†’ EXPLAIN â†’ SIMULATE â†’ ADAPT

Identity:
DATA â†’ REASONING â†’ DECISION â†’ ADAPTATION

Core abstraction:
MissionState / Mission Twin

Core differentiators:
- dynamic evidence selection
- multi-source correlation
- spatial-temporal reasoning
- hard safety/legal constraints
- evidence-grounded explanation
- counterfactual simulation
- decision delta
- adaptive replanning

LLM:
intent + planning + tool selection + synthesis

Deterministic code:
geometry + time + safety + legal constraints + evidence + confidence

Do not chase:
agent count, generic chatbot, generic voice/multilingual, generic PFZ/weather dashboards, generic RAG, huge infrastructure, fake live data.

P0:
fix regressions â†’ stabilize evidence â†’ freeze MissionState â†’ temporal validity â†’ hard constraints â†’ decision UI â†’ voice integration

P1:
source registry â†’ explanation â†’ trajectory exposure â†’ intent classes â†’ data modes â†’ conflict policy â†’ Why â†’ What-if â†’ alternatives â†’ multilingual continuity

P2:
robustness â†’ time-dependent routing â†’ selected connectors â†’ mission replay â†’ low-bandwidth â†’ benchmark â†’ historical analysis â†’ field hardening

Flagship demo:
"Can I go tomorrow?" â†’ "Why?" â†’ "What if I leave at 11?" â†’ "What changed?"
```

---

# 48. CHANGE CONTROL

This document is a strategic source of truth, not a substitute for code.

When a deliberate architectural change is made:

1. update code
2. update tests
3. update relevant contracts
4. update this document
5. record the reason in the repository change/decision log if available

Do not let individual AI sessions silently redefine ORCA.

If an AI agent proposes a direction that conflicts with this document, it should explicitly identify the conflict and ask for/derive an intentional project decision rather than silently changing architecture.

---

# 49. END STATE

The desired ORCA experience is:

```text
USER:
"I want to go fishing tomorrow."

ORCA:
"I understand your mission."

        â†“

"What evidence do I need?"

        â†“

"I selected the relevant marine/weather/ocean/safety/geospatial sources."

        â†“

"I checked them for freshness, validity, spatial relevance and conflicts."

        â†“

"I evaluated your vessel and mission timeline."

        â†“

"I applied safety and legal constraints."

        â†“

"Here is the decision."

        â†“

"Here is exactly why."

        â†“

"Here is the map and evidence."

        â†“

"What if you change the plan?"

        â†“

"I recomputed the mission."

        â†“

"Here is what changed."

        â†“

"Here is the safest feasible alternative."

```

That is the ORCA transformation.

The project is not trying to make the biggest marine AI.

It is trying to make the system that can take a real marine mission, reason over the right evidence, make a defensible decision, explain it, and adapt when the mission changes.

---

# 31. ORCA FIELD INTELLIGENCE NETWORK (PLANNED)

> STATUS: ARCHITECTURAL SPECIFICATION & CANONICAL CONTRACT  
> TARGET INTEGRATION: P1 (Foundation in P0 contract alignment)

## 31.1 Definition and Strategic Identity

The ORCA Field Intelligence Network turns participating fishermen and field users into trusted, privacy-controlled sources of local marine observations, while returning aggregated intelligence and personalized insights to the same community.

It is strictly **NOT** social media, a follower/like graph, or an uncurated bulletin board.

Core loop:
```text
OBSERVE → REPORT → VERIFY → CORROBORATE → FUSE → REASON → INFORM → LEARN
```

## 31.2 Field Signal Concept

Community observations do not enter ORCA reasoning as raw social posts. They enter as **Field Signals** within the canonical Source Registry.

Source classification taxonomy:
- `OFFICIAL`: INCOIS, IMD, SACHET, DGLL, Navy/Coast Guard restrictions (Primary safety authority)
- `SCIENTIFIC`: CMFRI, MOSDAC, VLIZ, GEBCO (Ecosystem baselines)
- `OPERATIONAL`: Fleet telemetry, active replay, corridor models
- `COMMUNITY`: Verified participatory observations from mariners (**Field Signals**)
- `DERIVED`: Aggregates, counterfactuals, scenario deltas

## 31.3 Canonical CommunityObservation Schema (Target)

```yaml
CommunityObservation:
  id: UUID
  observer_id: UUID                 # Pseudonymous/hashed
  identity_state: UNVERIFIED | PHONE_VERIFIED | ESTABLISHED
  observation_type: CATCH | SEA_CONDITION | CURRENT | WAVE | WIND | FISH_ACTIVITY | HAZARD | UNUSUAL_EVENT | OTHER
  observed_at: ISO-8601 UTC
  reported_at: ISO-8601 UTC
  location_lat: float               # Stored server-side; protected by privacy policy
  location_lon: float
  location_precision: EXACT | APPROXIMATE | ZONE
  location_zone: string             # Resolved sector/harbour name
  location_grid_cell: string        # 5km / H3 aggregation index
  sea_state: CALM | MODERATE | ROUGH | VERY_ROUGH
  current_strength: LIGHT | MODERATE | STRONG | VERY_STRONG
  wave_height_approx: LOW | MODERATE | HIGH | VERY_HIGH
  wind_strength: LIGHT | MODERATE | STRONG
  visibility: GOOD | MODERATE | POOR
  fish_activity: LOW | MODERATE | HIGH        # Private by default
  species: string                             # Private by default
  catch_indication: LOW | MODERATE | HIGH     # Private by default
  description: string (max 280 chars)
  has_photo: bool
  has_gps: bool
  media_ids: list[UUID]
  privacy_level: PRIVATE | APPROXIMATE | ZONE | RESEARCH
  catch_is_private: bool (default true)
  corroboration_count: int
  agreement_with_official: CONSISTENT | INCONSISTENT | UNKNOWN
  status: PENDING | ACCEPTED | REJECTED | FLAGGED
  rejection_reason: string
  trip_id: UUID | null
```

## 31.4 Trust & Evidence Hierarchy (Safety Invariants)

1. **Deterministic Official Supremacy (Invariant C-1)**: Community signals NEVER override deterministic hard safety constraints (IMD cyclone warnings, prohibited naval/sanctuary geofences, vessel craft swamping thresholds).
2. **Missing Evidence Principle (Invariant C-2)**: Absence of community reports in a sector NEVER implies safety (`Missing community reports != safe`).
3. **Explicit Labeling (Invariant C-3)**: Community evidence in reasoning outputs must always bear the explicit tag `[FIELD SIGNAL]` and display corroboration count and freshness.
4. **No Artificial Trust Scores (Invariant C-4)**: Trust is rendered via verifiable categorical facts (`GPS captured`, `Evidence attached`, `Recently reported < 3h`, `Corroborated by N reports`, `Unconfirmed field report`), never arbitrary decimal percentages (`87.4% trusted`).
5. **Single-Observer Containment (Invariant C-5)**: An uncorroborated report from an unverified contributor cannot alter safety decision status or lower risk thresholds.

## 31.5 Privacy by Design

- **Fishing Ground Secrecy**: Location precision defaults to `APPROXIMATE` (5km grid / zone level). Exact coordinates are never exposed to peer fishers.
- **Catch Privacy**: Catch volume and species indications are `PRIVATE` by default. Contributor must explicitly opt in to share aggregated catch indicators.
- **Vessel Protection**: Contributor identities and vessel registrations are strictly scrubbed from public community aggregates.

## 31.6 Community → MarineContext Integration

```text
Field Observations (Mobile/Web)
       │
       ▼
Auto-Sanitization & Grid Aggregation (Backend)
       │
       ▼
CommunitySignalConnector (Source Registry: COMMUNITY)
       │
       ▼
Unified ObservationBundle (ObservationBundle.community_signals)
       │
       ▼
Validation & Evidence Engine
       │
       ├── Official Hard Constraints Evaluated (Risk Engine)
       │
       ├── Confidence Calibration (Medium ↔ High modulation only)
       │
       ▼
Reasoning & Explanation Engine ("[FIELD SIGNAL] 9 reports in Malvan indicate...")
```

## 31.7 Phased Implementation Roadmap

- **P0 Foundation**: Contract extension (`source_type` on `EvidenceItem`), privacy bounds definition, mock community signal in test harness. Does NOT block React → Next.js or Expo core MVP.
- **P1 Active Field Signals**: 10-15s mobile reporting flow, 5km grid spatial clustering, community signal card on Fisher Decision Surface, researcher spatial signal overlay.
- **P2 Ecosystem Expansion**: Personal historical catch insights ("My Trips"), cooperative fleet circles, offline SMS/packet bridge.

