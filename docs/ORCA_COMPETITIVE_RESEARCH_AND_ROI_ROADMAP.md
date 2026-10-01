# ORCA Competitive Research & ROI Roadmap

Research date: **2026-10-02**. Repository basis: checkout `786c495`, inspected read-only. This document proposes future work; it does not certify live providers, navigation safety, competitor deployments, or completion of the roadmap.

**Evidence labels:** **FACT** = inspected local implementation; **RESEARCH FINDING** = linked external implementation/publication; **INFERENCE** = interpretation of that evidence; **RECOMMENDATION** = proposed ORCA work. External source inspection establishes implementation structure, not runtime reliability. Competitor tests were inspected where available, not executed. Local tests/builds were not rerun for this research task; reported results below come from `PROGRESS.md`.

## 1. Executive Conclusion

**RECOMMENDATION:** Make ORCA demonstrate a **traceable mission decision that survives a changed plan**. Concentrate on three improvements: shared mission/evidence identity, faithful explanations across every surface, and evaluated route/departure alternatives. Keep the current workspace design and compose the existing engines.

**INFERENCE:** Maps, PFZ discovery, multilingual alerts, vessel advisories and scenario tools are established capabilities elsewhere. Competitive value lies in how reliably ORCA connects them for a particular fisherman: understand the mission, expose the deciding evidence, compare a changed assumption, apply the evaluated plan, and explain subsequent changes. [INCOIS services](https://incois.gov.in/site/forecast.jsp), [SACHET](https://sachet.ndma.gov.in/), [BarentsWatch route workflow](https://www.barentswatch.no/artikler/hvordan-bruke-boelgevarsel/), [EcoConnect fisheries](https://niwa.co.nz/fisheries/fisheries-and-ecoconnect).

The shortest credible pitch: **“ORCA helps a fisherman understand which plan is supported by the available evidence, why, and what must change before departure.”** Demonstrate uncertainty and unchanged restrictions as competently as improved conditions. No claim of being first, unique, or a replacement for official advisories is supported.

## 2. Current ORCA Strengths

**FACT — reusable assets, not proposed additions:**

| Asset | Actual implementation and ownership |
|---|---|
| Intelligence core | FastAPI; `agents/graph.py` implements intent, clarification, supervisor/tool execution, evidence validation and composition. `AssessmentService` separately owns guided trip evaluation. |
| Mission and decision contracts | `contracts/mission.py`, `assessment.py`, `chat.py` contain MissionState, DecisionObject, DecisionDelta and assessment/chat contracts. Preserve these. |
| Deterministic safety | `domain/risk_engine.py`: vessel thresholds, temporal validity, degraded evidence handling and severe-hazard precedence. Recent corrections explicitly distinguish operational and simulated sources. |
| Spatial/temporal routing | `route_engine.py`, `trajectory_exposure.py`: geofences, route alternatives, waypoint timelines, peak exposure, craft speed assumptions and departure-window scans. PFZ ranking is geodesic domain code. |
| Existing Mission Twin | `/trip-assessments/simulate` recomputes baseline and proposed requests and returns server DecisionDelta. `AssessmentSimulator.tsx` shifts the planned times, preserves duration and applies the returned assessment. |
| Field workflow | Updated Fisher Home/Plan/Ask/Map/Trips/Alerts/Profile, compact MissionSummary, saved PFZs, device preferences and local history. Existing voice, geolocation and language resources. |
| Maps and inspection | MapLibre/deck.gl, hazard/restriction/PFZ/route layers, evidence drawer and threshold rows. Current Vite map preserves UNKNOWN instead of overriding it with a wave heuristic. |
| Institutional demonstrations | Authority fleet/sector/replay surfaces and Researcher observations/EO/scenario/query tools. These are substantial demo assets, not verified operational fleet services. |
| Reproducible data and offline behavior | Explicit data modes, generated daily demo records, archived fixtures, browser assessment cache and expiry handling. Demo persistence can use offline stores. |

**Correction to the pasted audit:** `nextjs/package.json`, `nextjs/views/` and `nextjs/components/` exist alongside `frontend/`. Vite remains an executable client; Next.js is a real migration client, not merely a document aspiration. The Fisher simulator has also advanced beyond the audit's exclusively browser/chat comparison. Legacy chat simulation still remains. Native Expo is not established by the inspected tree.

`PROGRESS.md` reports 53 snapshot/hazard integration tests, 22 selected domain tests and a successful Vite production build for the latest corrections. These are documented verification results, not fresh results from this research. No deployed upstream/database readiness is established.

## 3. Current Critical Gaps

| Gap → current limitation | User impact | Judge/demo impact → opportunity |
|---|---|---|
| Shared evidence identity | Guided assessment and chat remain separate paths. Simulation checks equal `data_mode`, then independently refetches/re-evaluates both requests; it does not enforce an immutable evidence bundle. | A difference can reflect a data refresh as well as a plan change. | “Same scenario” is stronger than the endpoint guarantees → bind snapshot, baseline and evaluation identity. |
| Faithful execution explanation | Assessment derives `agent_collaboration` from observations/risk and a constructed trace. This differs from executed LangGraph trace. | Users may mistake presentation roles for actual executed specialists. | Replace execution-like claims with actual service/tool events or explicitly labelled derived explanation. |
| Provenance consistency | Assessment bundle mode uses source-name matching for SAVED and otherwise LIVE outside DEMO; graph provenance was recently strengthened. | Badges can be less precise than the evidence beneath them. | Carry structured origin, delivery mode, validity and quality end to end. |
| Two simulation semantics | Assessment-based wrapper is improved; `useChat.simulateWhatIf` still uses browser now, a default 12-hour duration and prior chat status or READY. | Follow-up context can diverge from the displayed mission. | Make the Fisher comparison path authoritative and route conversational changes through it. |
| Actionable alternatives | Route timelines and window scans exist, but a single mission-wide verdict and route recommendation do not necessarily explain whether each alternative is feasible throughout the mission. | “Later” or “safest” can be mistaken for permission despite an unchanged hazard. | Show candidate feasibility, deciding segment/time and explicit rejection reasons. |
| Demonstration consistency | Daily and archived data paths coexist; archived DEMO PFZ/routes can still be replaced by scenario constants. Two clients require verification. | Numbers, date windows and route claims may vary across entry points. | Select and freeze one supported demo package; verify all displayed values against its outputs. |
| Field proof | Browser speech/cache and local profile/history exist, but reliable voice correction, language continuity and disconnected operation have not been established here. | Hard-to-correct harbor/time recognition or stale cache undermines use. | Rehearse one regional-language mission plus explicit cache age and expiry. |

The supplied screenshots document earlier dense cards, cramped narrow layouts, reasoning overlays and chart contrast. Current source has newer Fisher composition and styling. **INFERENCE:** prioritize legibility of the decision/delta on the actual current narrow viewport; those screenshots alone do not justify another redesign.

## 4. Exact SIH / Problem Landscape

**RESEARCH FINDING — verification limit:** The official [SIH 2026 problem portal](https://www.sih.gov.in/sih2026PS) could not be retrieved successfully. Two independent public mirrors identify **SIH26176, “ORCA Marine EcOsystem Reasoning with Collaborative Agents,” ISRO / Department of Space**. The title and sponsor are corroborated by mirrors, not independently authenticated against a retrieved official 2026 record. [Full mirrored text](https://github.com/aditya-kr86/sih2026/blob/main/ps_2026/SIH26176.md), [second mirror](https://www.sihbuddy.in/ps/SIH26176).

The mirrored brief asks for natural-language intent, planning/task decomposition, specialist coordination, multi-source EO/marine/weather/GIS retrieval, contextual multi-turn interaction, Indian-language responses, spatial/temporal reasoning, explainable recommendations, proactive hazards, geofencing and route planning. Examples cover PFZ, tomorrow's departure safety, local tides/conditions, cyclone/lightning alerts, productivity and restrictions. This supports the complete mission loop rather than agent count as an objective. Dataset access, provider credentials and a PS-specific scoring rubric were not verified.

**RESEARCH FINDING:** Official **2024** SIH college guidance names novelty, complexity, clarity, feasibility, practicability, sustainability, impact, user experience and future progression. Use these as historical guidance, not asserted 2026 weights. [Official historical guidelines](https://sih.gov.in/letters/Guidelines-College-SPOC.pdf). Unofficial “2026 rubric” sites provide conflicting weights; none is adopted here.

**Related landscape:** SIH25040 FloatChat concerned conversational ARGO discovery/visualization; an institution-hosted 2025 catalogue records it. That is adjacent scientific exploration, not equivalent to vessel departure clearance. [2025 catalogue](https://www.driems.ac.in/wp-content/uploads/2025/09/Smart-India-Hackathon_PROBLEM-STATEMENTS.pdf). The OceanEmbed repository self-identifies with SIH26066; its scientific reconstruction focus is adjacent, and its contest metadata is not official verification. No marine winner/finalist status was independently established through an official result source. Team READMEs and social posts are not treated as proof of selection or awards.

## 5. SIH Competitor & GitHub Research

**Method:** Searched exact ID/title and related SIH/ocean/routing/GIS/fisheries/agent terms; examined repository trees and selected implementation files, not just READMEs. The following are retained for specific implemented lessons. Public HEADs are mutable; inspection date is above. UI descriptions are source/README observations, not tested interactions.

| Repository | Source-backed implementation | Quality boundary and lesson |
|---|---|---|
| [blueberry0710/orca-sih26176](https://github.com/blueberry0710/orca-sih26176) — exact PS | [Planner](https://github.com/blueberry0710/orca-sih26176/blob/main/backend/app/agents/planner.py) runs requested specialists concurrently, then risk, route and explanation; records status/latency/source/mode. [Risk service](https://github.com/blueberry0710/orca-sih26176/blob/main/backend/app/services/risk_engine.py) exposes weighted factors and deterministic hazard floors. | Meaningful readable orchestration. Handwritten state machine, not proof of executed LangGraph. Planner marks aggregate LIVE if any specialist is LIVE; missing values use default risk factors, and [risk agent](https://github.com/blueberry0710/orca-sih26176/blob/main/backend/app/agents/risk_agent.py) derives improvement time from demo_store. Extract transparent dependency/trace presentation; reject mixed-source LIVE promotion, defaults as evidence, or demo timing as live advice. No validated calibration inferred from comments. |
| [52North/WeatherRoutingTool](https://github.com/52North/WeatherRoutingTool) | [Constraints](https://github.com/52North/WeatherRoutingTool/blob/main/WeatherRoutingTool/constraints/constraints.py) implement route constraint checks, including land/water-depth logic; [tests](https://github.com/52North/WeatherRoutingTool/blob/main/tests/test_constraints.py) exercise constraint behavior. Repository includes optimization algorithms and route postprocessing. | Strong engineering reference for constrained routing; merchant-vessel fuel optimization is not small-craft safety validation. Borrow explicit feasibility/rejection and segment constraints, not its vessel model or a second route engine. |
| [OpenDrift](https://github.com/OpenDrift/opendrift) | [OceanDrift model](https://github.com/OpenDrift/opendrift/blob/master/opendrift/models/oceandrift.py) implements environmental forcing, advection and stochastic diffusion; repository contains readers, examples and tests. | Real physical trajectory framework, not a departure adviser. Borrow explicit forcing/model assumptions and uncertainty treatment; do not add a SAR/oil-spill simulation to the SIH critical path. |
| [searoute-py](https://github.com/genthalili/searoute-py) | [Source](https://github.com/genthalili/searoute-py/blob/main/searoute/searoute.py) constructs routes on maritime graphs with shortest-path traversal and passage restrictions; [tests](https://github.com/genthalili/searoute-py/blob/main/searoute/tests/test_searoute.py) cover route behavior. | Useful distinction between connected sea geometry and evaluated weather exposure. It is not proof of navigational safety or weather optimization. ORCA already owns a route evaluator; no replacement recommended. |
| [Global Fishing Watch Python client](https://github.com/GlobalFishingWatch/gfw-api-python-client) | Typed vessel resources and [integration tests](https://github.com/GlobalFishingWatch/gfw-api-python-client/blob/main/tests/integration/test_vessels_api.py) exercise search/detail responses and DataFrame conversion. [Official API](https://api-doc.globalfishingwatch.org/our-apis/documentation/docs/v3/vessels) explains AIS/registry identity combination and caveats. | Useful institutional evidence/identity pattern, not artisanal-vessel tracking coverage or local fish abundance. AIS effort must not become a PFZ/catch guarantee. New AIS dependency deferred. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | [Checkpoint memory implementation](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint/langgraph/checkpoint/memory/__init__.py) saves/retrieves thread checkpoints, metadata and parent relationships; repository has checkpoint conformance tests. | Strong state lineage reference. Checkpointing execution alone does not freeze externally fetched weather. ORCA already uses LangGraph; persist normalized evidence with mission versions before promising replay. |

**Rejected as capability benchmarks after inspection:**

- [ORCA-SIH/ORCA dispatcher](https://github.com/ORCA-SIH/ORCA/blob/main/backend/services/agent_dispatcher.py) includes deterministic simulator fallback across specialists; [aggregator](https://github.com/ORCA-SIH/ORCA/blob/main/backend/services/aggregator.py) implements threshold/evidence synthesis. Useful evidence-row example, but provider reliability and vessel/time-aware clearance are not established. Do not copy “always returns valid data” behavior into operational safety.
- [ChandanrajM/ORCA risk agent](https://github.com/ChandanrajM/ORCA/blob/main/app/agents/risk.py) generates simulated risk input when sources fail; [risk tool](https://github.com/ChandanrajM/ORCA/blob/main/app/tools/risk_tool.py) repeats substantial risk-assessment logic. Reject as an architecture template: fallback and competing calculations need stronger contracts.
- [OceanEmbed source](https://github.com/hiralirs/OceanEmbed-SIH/blob/main/app.py) conditionally loads model/data files but otherwise generates synthetic profiles/embeddings; displayed RMSE includes a literal 0.32 value. The inspected repository tree did not include the referenced model artifact. Reject performance claims as demonstrated scientific validation.
- [FloatChat query engine](https://github.com/saad-mh/floatchat/blob/main/backend/llm_query_engine.py) has real SQL-generation and Supabase retrieval code, alongside heuristic fallback/query parsing. Relevant researcher interaction, but no inspected evidence of marine safety reasoning or validated general query correctness. Defer borrowing the pipeline; do not grant unrestricted LLM SQL execution.

No repository's number of agents, screenshot polish, stars, README test totals or award claims is used as a quality score.

## 6. Best Competitor Ideas Worth Learning From

**RECOMMENDATIONS derived from the retained implementations:**

| Project → implemented value | Why it works | ORCA adaptation |
|---|---|---|
| WeatherRoutingTool → constraints and tested infeasibility | Explains why a short route cannot be selected. | Expose existing route/geofence evaluation rejection reasons and peak-exposure segment. [Source/tests](https://github.com/52North/WeatherRoutingTool/blob/main/tests/test_constraints.py). |
| BarentsWatch → route-specific forecast interaction | Places forecast interpretation on a user's journey. | Select a route and display its existing waypoint times and conditions, with departure comparison. [User guide](https://www.barentswatch.no/artikler/hvordan-bruke-boelgevarsel/). |
| Same-PS planner → actual specialist trace records | Inspectable dependencies make coordination concrete. | Show executed tools, inputs, outcome and failures; label derived assessment explanations honestly. [Planner source](https://github.com/blueberry0710/orca-sih26176/blob/main/backend/app/agents/planner.py). |
| LangGraph → parent/thread checkpoint lineage | Separates mission revisions and execution history. | Attach evidence-bundle identity and evaluation version to the existing mission/decision contracts; make branches replayable. [Checkpoint source](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint/langgraph/checkpoint/memory/__init__.py). |
| Copernicus → query by place/time/variable plus QC metadata | Limits retrieval to the question and retains interpretation context. | Bound tool discovery to approved datasets covering the mission; retain dataset version, resolution, QC and missing cells. [Toolbox documentation](https://toolbox-docs.marine.copernicus.eu/en/stable/usage/subset-usage.html). |

## 7. Real-World & Research Case Studies

**RESEARCH FINDINGS**, followed by **INFERENCE / ORCA lesson**. These are documented services or research, not proof that ORCA has integrated them.

| Case | Problem → what users get | Lesson for ORCA |
|---|---|---|
| [INCOIS OSF](https://www.incois.gov.in/oceanservices/osfforecast.jsp) and [ship-track forecast](https://sarat.incois.gov.in/shipforecast/register.jsp) | Marine planning → forecasts with issue/forecast times, wave/wind/current information; route forecast service entry. | Source products already support decisions. Preserve issued time versus valid time and evaluate the whole mission. |
| [INCOIS PFZ research/service account](https://incois.gov.in/documents/Reports/Others/Report_2015_20251023100117.pdf) | Finding promising fishing areas → satellite SST/chlorophyll-based advisories. | PFZ suitability and voyage safety are separate questions; a productive destination does not override a restriction. Historical report, not current coverage verification. |
| [IMD marine bulletins](https://mausam.imd.gov.in/responsive/text_bulletins.php) | Weather hazards → fishermen, port, coastal, sea-area and GMDSS bulletins. | Keep original bulletin geography/validity and explicit restrictions ahead of favorable local measurements. |
| [NDMA SACHET](https://sachet.ndma.gov.in/) | Warning dissemination → CAP-based geo-targeted, multilingual multi-channel alerts. | Notification novelty is weak. Improve mission relevance, deduplication and “what changed for my route?” |
| [MOSDAC PFZ application](https://mosdac.gov.in/pfz/) | EO exploration → dated SST/chlorophyll/current/wind layers and stated provider credits. | Demonstrate a bounded EO query with provenance; do not confuse a satellite layer with catch prediction. |
| [CMFRI NMFDC](https://eprints.cmfri.org.in/19494/) and [data summary](https://www.cmfri.org.in/uploads/files/NMFDC%20Data%20Summary.pdf) | Fisheries analysis → catch/effort data organized by time, geography and sector. | Researcher productivity questions need historical series and sampling context; one SST/chlorophyll observation cannot establish causation. |
| [Copernicus Marine Toolbox](https://toolbox-docs.marine.copernicus.eu/en/stable/usage/subset-usage.html) | Large heterogeneous ocean data → bounded subsets and retained QC/institution/DOI fields. | Retrieve a mission-sized subset; preserve unavailable values and observation/model identity. |
| [EMODnet bathymetry portfolio](https://emodnet.ec.europa.eu/sites/emodnet.ec.europa.eu/files/public/PDF/202105_EMODnet_Portfolio.pdf) | Unequal seabed knowledge → source-reference and survey age/accuracy quality layers. | A displayed boundary or depth layer needs lineage and resolution. Do not infer chart-grade precision from a basemap. |
| [NOAA nowCOAST](https://oceanservice.noaa.gov/facts/nowcoast.html) | Fragmented coastal conditions → integrated observation/forecast/warning maps and web services. | Multi-source map integration is established. Add mission consequences and interpretation rather than more layers. |
| [BarentsWatch](https://www.barentswatch.no/en/) | Coastal travel/fishing → specialist map services, FishInfo and vulnerable-area wave forecasts. | Different roles need targeted workflows; retain existing Authority/Researcher views, reduce demo breadth. |
| [Australia BOM boating workflow](https://www.bom.gov.au/marine/knowledge-centre/meteye.shtml) | Fishing-trip timing/exposure → forecasts explored across locations and times. | Explain nearby hazards and timing uncertainty; a calm departure point is insufficient. |
| [NZ EcoConnect fisheries](https://niwa.co.nz/fisheries/fisheries-and-ecoconnect) | Fishing operational risk → environmental observations and forecasts across timescales. | Tailored fishing decision support already exists. Differentiate through traceable interactive mission refinement, not merely personalization. |
| [Japan JMA marine warnings](https://www.jma.go.jp/bosai/map.html?contents=seawarning) | Ship hazards → sea-area warnings/forecasts and latest-issue information. | Make area/time applicability visible. Do not average away a relevant warning. |
| [Indonesia BMKG](https://maritim.bmkg.go.id/) and [published route forecast](https://maritim.bmkg.go.id/inawis/assets/pdf/route_jakarta_surabaya.pdf) | Shipping conditions → maritime forecasts and route products. | Route planning is an established category. INA-WIS's crawled page contains old example rows; these do not establish current end-to-end live routing reliability. |
| [NISTIR 8312](https://doi.org/10.6028/NIST.IR.8312) | Trustworthy explanation → principles covering explanation, meaningfulness, accuracy and knowledge limits. | Explain the actual deciding rule in field language and admit evidence limits; an attractive agent narrative is insufficient. |
| [European Digital Twin Ocean](https://www.mercator-ocean.eu/ocean-intelligence/the-digital-twin-of-the-ocean/the-european-digital-twin-of-the-ocean/) | Ocean scenario decision support → integrated data/model infrastructure for testing scenarios; continued scaling is described. | “Twin” and what-if are not novel labels. Scope ORCA's Mission Twin to reproducible mission alternatives; do not claim a coupled ocean physics twin. |

## 8. ORCA vs Existing Solutions

Landscape evidence is in §§5–7. **FACT** in the ORCA column; **INFERENCE/RECOMMENDATION** in the final column.

| Capability | Existing solutions | ORCA today | Gap → opportunity |
|---|---|---|---|
| Integration/discovery | Copernicus subsets; NOAA/INCOIS layers | Normalized connectors, tools, demo datasets | Verify one bounded provider path; retain dataset identity. |
| Mission understanding/multi-turn | Same-PS planners; FloatChat scientific queries | Guided MissionState plus contextual graph | Make guided/chat views share the same active revision. |
| Multi-source reasoning | Official advisories; same-PS synthesis | Deterministic risk plus evidence gate | Trace decisive source/rule, not synthesized agent consensus. |
| Temporal reasoning | BOM time exploration; EcoConnect forecasts | Forecast windows, validity, trajectory timing | Distinguish issue time, mission time and source expiry. |
| Spatial/geofencing | BarentsWatch, GFW, routing constraints | Geometry, restrictions, PFZ geodesics | Show applicability and rejected corridor. |
| Route/corridor alternatives | WeatherRoutingTool, BarentsWatch, BMKG | Routes, exposure timeline, departure scan | Surface feasible route/time pairs and assumptions. |
| PFZ intelligence | INCOIS/MOSDAC | Ranking and candidate evidence | Explain distance/suitability/safety tradeoffs without catch claims. |
| Safety/personalization | INCOIS vessel advisories; competitor craft curves | Craft/size-specific deterministic limits | Show changing vessel limits without erasing hard stops. |
| Explanation/provenance | QC/lineage products; NIST principles | Thresholds, evidence, trace, brief | Harmonize structured provenance and executed events. |
| What-if/what-changed | DTO scenarios; checkpoint lineage | Server assessment delta plus legacy chat diff | Separate parameter changes from newly arrived evidence. |
| Uncertainty/source conflict | QC products; OpenDrift stochastic modeling | Confidence, stability and validity checks | Explain insufficient support; avoid uncalibrated probabilities. |
| Memory/replay | Checkpoints, fleet history systems | Mission/thread context, device history, run records | Link immutable baseline, evidence and applied revision. |
| Proactive alerts/adaptation | SACHET and official warning services | Alert API/monitor/geofences; replanning controls | Acknowledge mission-specific material change and reevaluate. |
| Voice/multilingual | SACHET language/readout; same-PS interfaces | Speech hooks/endpoints and locale resources | Prove harbor/time correction and language continuity. |
| Offline/low bandwidth | Not established by this comparison | IndexedDB cache and six-hour expiry | Cached decision remains inspectable with age/expiry; no fresh clearance implied. |
| Authority/research analytics | GFW/NMFDC/NOAA/EO platforms | Synthetic fleet/replay/EO/scenario views | One shared decision record across roles; defer new analytics. |
| Community/field signals | JMA accepts ship observations; official warning networks | No verified moderated field-report evidence pipeline | Defer: validation, privacy and source trust cost exceed demo value. [JMA observations](https://www.data.jma.go.jp/marine/en/index-en.html). |

## 9. Credible Differentiation Opportunities

**INFERENCE:** Individually, mission context, what-if, voice, alerts and routing have precedents. The defensible opportunity is their **composition with evidence identity and conservative safety semantics** in an accessible Indian coastal workflow. This is a positioning hypothesis, not an established market uniqueness claim.

Three demonstrations could support it:

1. **Parameter change:** same evidence bundle, different departure/craft, auditable deterministic delta.
2. **Evidence change:** same mission, newer bulletin/expired source, separate explanation of why the decision changed.
3. **Operational boundary:** all alternatives remain blocked or unknown; ORCA identifies the unresolved restriction/evidence rather than manufacturing a favorable plan.

A trustworthy negative result is particularly useful when nearby raw measurements look favorable. It visibly demonstrates correlation, applicability, rule precedence and knowledge limits. [NIST explanation principles](https://doi.org/10.6028/NIST.IR.8312), [IMD bulletins](https://mausam.imd.gov.in/responsive/text_bulletins.php).

## 10. The Strongest ORCA USP

**RECOMMENDATION — target promise:**

> One fishing mission, a traceable decision, and a clear comparison of what changes the plan—using vessel limits, route exposure, time and evidence quality together.

**Available now:** mission contracts, deterministic engines, evidence rows, route timing and a server simulator. **Still to prove:** common snapshot semantics across chat/assessment, faithful explanation, exact apply/replay consistency, and a repeatable field interaction. Avoid claims of certified safety, autonomous navigation, scientifically validated catch prediction or a fully operational ocean digital twin.

## 11. The “One ORCA Moment”

**RECOMMENDATION:** Demonstrate a **constraint-preserving changed plan**:

1. Fisher asks: “From Ratnagiri, can my traditional craft reach this fishing area tomorrow at five and return by evening?”
2. ORCA confirms harbor, vessel, local time, duration and destination; visibly selects needed tools.
3. Decision shows the deciding condition/restriction, its validity and route segment/time. Show why favorable readings do not cancel a relevant hazard.
4. Fisher asks: “What if I leave four hours later?” The same mission and frozen evidence are reused.
5. Compare baseline/proposal: departure, expected exposure, governing limit, evidence IDs and unchanged constraints. If the hazard remains active, the answer remains blocked. If an evaluated alternative is supported, show the exact candidate and its limits.
6. Apply the evaluated plan; the card, map, brief and history agree. Explain what changed in one regional language.

**Why this interaction:** It combines intent, planning, collaboration, spatial/temporal reasoning, explainability and adaptation within one observable result. Existing route forecast/scenario systems establish the value of the ingredients; ORCA can demonstrate their connected execution. Do not choose a fixture solely to force NO_GO → GO.

## 12. P0 — Highest-ROI Changes

**RECOMMENDATION — scoring:** Scores are engineering judgments, not official SIH marks. Rate 1–5; higher is better. Columns: alignment A, user value U, technical depth T, differentiation D, demo M, visual V, reuse C, effort E (**5 = low effort**), reliability R. Weighted total = Σ(weight × score/5): A15/U15/T10/D10/M15/V5/C10/E10/R10. Reliability gates override ranking: no synthetic live claims, no ignored restrictions, no unpinned comparison advertised as same evidence.

| Candidate | A | U | T | D | M | V | C | E | R | /100 | Priority |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Shared mission/evidence baseline | 5 | 5 | 5 | 4 | 5 | 3 | 5 | 3 | 5 | 92 | P0-1 |
| Faithful decision/evidence surfaces and replay proof | 5 | 5 | 4 | 4 | 5 | 5 | 5 | 4 | 5 | 94 | P0-2 |
| Evaluated route × departure alternatives | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 3 | 4 | 92 | P0-3 |
| Mission-specific material-change alert | 5 | 5 | 4 | 4 | 4 | 3 | 4 | 3 | 3 | 81 | P1-1 |
| Regional-language correction + offline brief | 5 | 5 | 3 | 3 | 5 | 4 | 5 | 4 | 4 | 87 | P1-2 |
| New scientific productivity prediction | 3 | 3 | 5 | 3 | 3 | 4 | 2 | 1 | 1 | 55 | P2 |
| New native app during demo preparation | 3 | 4 | 3 | 2 | 3 | 4 | 2 | 1 | 2 | 54 | P2 |

### P0-1. Bind Ask, Plan and Compare to one mission evidence bundle

- **Why / user value:** a changed departure must not silently change the baseline/provider retrieval. Follow-ups retain the actual planned vessel/time/destination.
- **Judge value:** demonstrates contextual reasoning with inspectable input lineage.
- **Research lesson:** checkpoint lineage plus mission-bounded dataset selection (§6); neither alone freezes external observations.
- **Reuse:** MissionState, ObservationBundle, existing repositories/run records, AssessmentService, graph tool context, TripSimulationResponse and DecisionDelta.
- **Approach:** retain normalized evidence under an immutable bundle ID with dataset version/validity and evaluator version. Pass baseline assessment/revision IDs to comparison; reject mismatch or explicitly identify a refresh. Have chat plan changes invoke the existing assessment/simulation service; preserve API compatibility with additive fields. Refresh is a distinct operation and delta. No new risk model or compulsory graph rewrite.
- **Complexity:** medium; dependency for P0-3 and P1-1. **Demo impact:** very high. **Risk:** over-scoping persistence or duplicating services.
- **Acceptance:** same-input replay reproduces decisions; comparison cannot swap bundle; exact proposed times survive Apply; chat “four hours later” uses mission departure, not browser now.

### P0-2. Prove that every decision surface tells the same truth

- **Why / user value:** status, route, threshold, provenance, spoken summary and action must agree. Clarify actual versus derived execution.
- **Judge value:** traceable rule/evidence pairs provide concrete technical depth; a failure case establishes disciplined uncertainty.
- **Research lesson:** NIST explanation accuracy/limits; EMODnet quality lineage; same-PS source mixing weaknesses (§§5–7).
- **Reuse:** MissionSummary, evidence drawer, threshold matrix, DecisionObject/assessment projections, map canonical props, graph trace and existing validity regression tests.
- **Approach:** propagate structured provider origin, observed/modelled/synthetic identity, delivery mode, issued/valid/captured times, QC and references. Label assessment collaboration as derived unless backed by executed events. Freeze one demo package/clock; distinguish archived fixture outputs. Present action + two decisive reasons + source/time, with details expandable. Verify the selected demo client and a narrow viewport; document its launch path.
- **Complexity:** small–medium. **Demo impact:** very high. **Risk:** cosmetic fixes masking upstream mismatch, or repeating unsupported “official/verified” claims.
- **Acceptance:** calm readings + expired evidence remains UNKNOWN/LOW; active applicable verified hazard preserves deterministic restriction; synthetic scenario clearly labelled; changed/source-failed tools visible; no contradictory map/audio clearance. Reuse existing tests and add only missing cross-surface/lineage regressions in the future implementation.

### P0-3. Surface existing route and departure reasoning as evaluated choices

- **Why / user value:** answers which plan is supportable and why another is rejected; “lowest exposure” alone is insufficient.
- **Judge value:** an interactive segment/time explanation makes spatial-temporal reasoning visible.
- **Research lesson:** route constraints and route-specific forecasts from WeatherRoutingTool/BarentsWatch; BOM evaluates surrounding time/area (§§6–7).
- **Reuse:** route_engine, trajectory_exposure, departure-window scan, PFZ ranking, geofence checks, waypoint timelines and existing map layers.
- **Approach:** evaluate a bounded set of existing corridors/departure candidates against the P0-1 bundle. Display feasibility/rejection, peak segment/time, governing vessel limit, ETA assumptions and forecast coverage. Evaluate the full requested return window; if only outbound exposure is modelled, say so and withhold whole-trip claims. Select the evaluated route/time pair and apply its returned mission revision.
- **Complexity:** medium; expose existing calculations before extending them. **Demo impact:** very high. **Risk:** uniform harbor forecasts presented as spatial grids, implied chart-grade navigation, or ranking blocked routes as safe.
- **Acceptance:** restriction cannot be removed by a delay/craft change; no feasible alternative is a valid result; out-of-coverage candidates remain unknown; numerical timeline/delta/map agree. Current engine ETA explicitly assumes craft speeds and unadjusted currents—retain that limitation.

## 13. P1 — Strong Differentiators

### P1-1. “What changed for my mission?” alert

- **Why / user/judge value:** turns an existing notification into a relevant decision update with an auditable cause.
- **Lesson:** SACHET establishes warning delivery; ORCA should add mission intersection and consequence, not duplicate channels.
- **Reuse:** alerts API/monitor, geofences, MissionState, evidence validity, saved assessments and DecisionDelta.
- **Approach:** use a controlled versioned bulletin update first. Intersect its geometry/time with the mission/corridor, reevaluate, report old/new evidence and decision, deduplicate, request acknowledgment and offer a bounded comparison. Never silently apply a new route.
- **Complexity:** medium. **Demo impact:** high. **Risk:** alarm fatigue, false applicability and stale update loops.
- **Acceptance:** irrelevant sector alert leaves mission unchanged; relevant valid update produces one explanation; expiry causes an evidence warning, not automatic safety. Needs P0-1/P0-2.

### P1-2. Regional-language mission correction and offline brief

- **Why / user/judge value:** proves that the same mission is usable beyond English and remains intelligible under poor connectivity.
- **Lesson:** multilingual geo-alerting already exists in SACHET; differentiation is accurate mission continuity and correction.
- **Reuse:** speech endpoints/hooks, locale resources, mission context, IndexedDB cache, expiry and local preferences.
- **Approach:** rehearse one Marathi or Hindi interaction; show recognized harbor/time/vessel for correction before evaluation. Keep mission IDs/numerics/units consistent across language change. On disconnection show saved brief, source age and expiry; restore online evaluation explicitly. Retain text fallback for unavailable speech.
- **Complexity:** small–medium. **Demo impact:** high. **Risk:** mistranslated safety status, timezone/number recognition and browser permissions.
- **Acceptance:** correction changes canonical request; spoken action agrees with deterministic status; expired cached assessment cannot authorize departure. Higher raw ROI than alerts, but optional after the core reasoning demo passes.

## 14. P2 — Do Not Prioritize for SIH

**RECOMMENDATION:** Defer additional agents, ocean-scale digital twins, new prediction models, AIS fleet ingestion, blockchain, social/community reporting, extra generic charts, new researcher causal analytics, full authentication infrastructure and native-app implementation during this demo workstream. Authentication remains required before exposing protected operational data; deferral does not establish production readiness.

Native Expo remains a strategic target. Complete the selected web journey first. Do not expand two client implementations simultaneously without a contract change requiring parity. Do not migrate frameworks merely for the pitch, replace deterministic safety with learned risk scores, claim catch guarantees, or add a second routing engine. Provider activation beyond one verified bounded integration belongs after reliable demo composition.

## 15. Recommended End-State Demo

**RECOMMENDATION — five minutes, one mission:**

| Time | Interaction | Observable proof |
|---|---|---|
| 0:00–0:40 | Ask and confirm coastal mission | Language, harbor, vessel, destination, local departure/return; needed tools. |
| 0:40–1:30 | Decision and WHY | Governing rule, valid evidence, degraded inputs; explicit demo package. |
| 1:30–2:15 | Inspect route/time | Peak segment, exposure timeline, rejected restriction, ETA assumptions. |
| 2:15–3:20 | Test later departure | Same bundle/baseline IDs, changed conditions/limits and unchanged hard stops. |
| 3:20–4:05 | Apply supported candidate or retain hold | Returned mission revision agrees across map, brief and history. |
| 4:05–4:40 | Optional bulletin change or language/offline proof | Distinguish new evidence from changed parameters; honest cache age. |
| 4:40–5:00 | Brief Authority/Researcher evidence handoff | Inspect the same record if implemented; otherwise end on Fisher. |

Use frozen, clearly labelled controlled data for the reasoning demonstration; disclose any archived scenario. A separate provider check may show an authentic dated product with its actual license/access conditions, but must not imply the whole mission uses live official feeds. Rehearse an unchanged restriction and missing-evidence case. Replace the old fixed September 29 departure with the supported frozen scenario's stated date/clock; do not call it “tomorrow” against an unrelated wall clock.

## 16. Implementation Sequence

**RECOMMENDATION for the next engineering task; nothing implemented here:**

1. **Contract and dependency review:** select demo client/package, inventory existing snapshot IDs, baseline semantics and tests. Record additive shared-bundle/revision contracts and deterministic invariants before edits.
2. **P0-1:** freeze normalized inputs; connect mission revisions and chat plan changes to existing assessment/simulation services. Prove replay and exact Apply.
3. **P0-2:** audit status/provenance/action/trace projections; fix discrepancies and verify failure states. Choose one bounded authentic data retrieval only if access is available; label captured evidence honestly.
4. **P0-3:** expose route/time candidate outputs, feasibility and coverage. Add no alternate engine. Rehearse the One ORCA Moment before expanding scope.
5. **P1-2 then P1-1, if time permits:** language/correction/cache proof, followed by one mission-specific controlled update.
6. **Release gate:** focused deterministic safety/validity/geofence regressions, comparison lineage and apply tests, selected client production build, desktop/narrow browser rehearsal, online failure/offline expiry checks. Record actual commands/results in required engineering documentation when implementation is authorized.

**Stop condition:** one repeatable Ask → mission → evidence → decision → explanation → comparison → applied revision flow, with no status/provenance contradictions. Measure reproducibility, request/output consistency and legibility. Do not invent percentages for fuel savings, catch gains, safety improvements or judge scores without evaluation data.

## 17. Research Sources

All links were researched on 2026-10-02; important findings are linked at their point of use. Local basis: `ORCA_CURRENT_STATE_AUDIT.md`, `ORCA_AI_MASTER_CONTEXT.md`, `PROGRESS.md`, `DECISIONS.md`, `ORCA_IMPLEMENTATION_BLUEPRINT.md`, API/data/safety contracts, current assessment/graph/domain services, both client trees and the four supplied screenshots. Audit assertions superseded by source are corrected in §2.

- **SIH:** [official 2026 portal — retrieval unsuccessful](https://www.sih.gov.in/sih2026PS); [PS text mirror](https://github.com/aditya-kr86/sih2026/blob/main/ps_2026/SIH26176.md); [independent mirror](https://www.sihbuddy.in/ps/SIH26176); [official historical guidance](https://sih.gov.in/letters/Guidelines-College-SPOC.pdf); [institution-hosted 2025 PS catalogue](https://www.driems.ac.in/wp-content/uploads/2025/09/Smart-India-Hackathon_PROBLEM-STATEMENTS.pdf).
- **GitHub implementation evidence:** [same-PS planner](https://github.com/blueberry0710/orca-sih26176/blob/main/backend/app/agents/planner.py); [WeatherRoutingTool constraints](https://github.com/52North/WeatherRoutingTool/blob/main/WeatherRoutingTool/constraints/constraints.py); [OceanDrift model](https://github.com/OpenDrift/opendrift/blob/master/opendrift/models/oceandrift.py); [searoute implementation](https://github.com/genthalili/searoute-py/blob/main/searoute/searoute.py); [GFW integration tests](https://github.com/GlobalFishingWatch/gfw-api-python-client/blob/main/tests/integration/test_vessels_api.py); [LangGraph checkpoint implementation](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint/langgraph/checkpoint/memory/__init__.py). Rejected candidates and file evidence are in §5.
- **Indian operational/data sources:** [INCOIS forecast catalogue](https://incois.gov.in/site/forecast.jsp); [IMD marine bulletins](https://mausam.imd.gov.in/responsive/text_bulletins.php); [NDMA SACHET](https://sachet.ndma.gov.in/); [MOSDAC PFZ](https://mosdac.gov.in/pfz/); [CMFRI NMFDC](https://eprints.cmfri.org.in/19494/).
- **International operational/research sources:** [Copernicus subset/QC documentation](https://toolbox-docs.marine.copernicus.eu/en/stable/usage/subset-usage.html); [EMODnet portfolio](https://emodnet.ec.europa.eu/sites/emodnet.ec.europa.eu/files/public/PDF/202105_EMODnet_Portfolio.pdf); [NOAA nowCOAST](https://oceanservice.noaa.gov/facts/nowcoast.html); [BarentsWatch route guide](https://www.barentswatch.no/artikler/hvordan-bruke-boelgevarsel/); [BOM boating workflow](https://www.bom.gov.au/marine/knowledge-centre/meteye.shtml); [EcoConnect fisheries](https://niwa.co.nz/fisheries/fisheries-and-ecoconnect); [JMA warnings](https://www.jma.go.jp/bosai/map.html?contents=seawarning); [BMKG route product](https://maritim.bmkg.go.id/inawis/assets/pdf/route_jakarta_surabaya.pdf); [NISTIR 8312](https://doi.org/10.6028/NIST.IR.8312); [European DTO](https://www.mercator-ocean.eu/ocean-intelligence/the-digital-twin-of-the-ocean/the-european-digital-twin-of-the-ocean/).

**Research limits:** targeted public-source review, not exhaustive competitor census or field validation. No official 2026 PS rubric, exact-PS winner list, competitor production SLA, live ORCA provider readiness or market uniqueness was verified. ROI scores are prioritization estimates. This task created only this roadmap; code and other documentation were left unchanged.
