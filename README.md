# ORCA — Marine EcOsystem Reasoning with Collaborative Agents
### Active Prototype Moniker: SAMUDRA (Smart Autonomous Marine Understanding, Decision & Risk Assistant)

> **SIH 2026 Problem Statement:** PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents  
> **Organization:** Indian Space Research Organisation (ISRO) / Department of Space  
> **Theme:** Disaster Management & Coastal Maritime Safety  
> **Classification:** Production-Grade Hackathon Prototype & AI Decision-Support System

---

## 🌊 Overview

**ORCA** (implemented via the **SAMUDRA** codebase) is an Agentic AI-powered Marine Intelligence & Mission Reasoning Platform. Its purpose is to empower coastal fishermen, vessel skippers, marine researchers, and disaster management authorities to query complex ocean conditions in natural language (including Indian vernacular languages like Hindi, Marathi, and Tamil) and receive deterministic, evidence-backed, geospatial recommendations.

ORCA bridges the gap between sophisticated Earth Observation datasets (ISRO MOSDAC, INCOIS, IMD) and grassroots maritime safety through coordinated AI agents, deterministic geospatial calculations, and transparent provenance tracking.

> [!CAUTION]
> **PROTOTYPE DISCLAIMER**  
> ORCA / SAMUDRA is a functional prototype built for the Smart India Hackathon 2026. It is **NOT** a certified marine navigational aid, SOLAS-compliant safety-of-life system, or official replacement for statutory bulletins issued by IMD, INCOIS, or the Indian Coast Guard.

---

## 🧭 Canonical Documentation & Single Source of Truth

Before making any modifications or assuming feature states, review the canonical project documentation:

1. [docs/ORCA_AI_MASTER_CONTEXT.md](docs/ORCA_AI_MASTER_CONTEXT.md) — Strategic and architectural source of truth. Mission-intelligence positioning, MissionState, evidence model, decision object, priorities (P0/P1/P2), and implementation direction.
2. [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Canonical development roadmap and phased implementation plan.
3. [docs/SAFETY.md](docs/SAFETY.md) — Deterministic risk thresholds, craft limits, and safety hard-stops.
4. [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) — Canonical Pydantic schemas (`ChatRequest`, `ChatResponse`, `VoiceChatResponse`).
5. [AGENTS.md](AGENTS.md) — AI agent entry rules, source of truth priority, and development guardrails.

---

## 🎯 The Four Core User Journeys

ORCA delivers four canonical, judge-facing user journeys:

1. **Nearest PFZ Discovery**  
   *Query:* *"Where is the nearest Potential Fishing Zone today from Ratnagiri?"*  
   *Outcome:* Ranked PFZ zones, geodesic distance, compass bearing, map marker, source attribution, and validity window.

2. **GO / NO-GO Safety Decision Gate**  
   *Query:* *"Is it safe to leave tomorrow at 6 AM on a motorized boat?"*  
   *Outcome:* Deterministic safety state (`GO` / `CAUTION` / `NO_GO` / `UNKNOWN`), decisive factors, wave/wind evidence, and confidence rating.

3. **Hazard & Maritime Boundary Alerts**  
   *Query:* *"Any cyclone, lightning or restricted-water risk on this trip?"*  
   *Outcome:* Active hazard polygons, geofence intersection with naval or protected zones, and hard-stop alerts.

4. **Safer Alternative Route Comparison**  
   *Query:* *"Which of these routes has the lowest weather and boundary risk?"*  
   *Outcome:* Comparative evaluation of candidate routes, exposure scoring, and clear risk tradeoffs.

---

## 🏛️ System Architecture

ORCA is architected as a **Modular Monolith**:

```
┌─────────────────────────────────────────────────────────────┐
│                 FRONTEND (React + MapLibre)                 │
│    Chat Interface │ Vector Maps │ Evidence Drawer │ Call UI │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON REST / Multipart Audio API
┌──────────────────────────────▼──────────────────────────────┐
│                  FASTAPI APPLICATION BACKEND                │
│                                                             │
│  [ LangGraph Agent Orchestrator ]                           │
│  - Intent & Locale Detection   - Planning & Coordination    │
│  - Response Localization       - Evidence Validation        │
│                                                             │
│  [ Deterministic Domain Engines ] (No LLM in Calculations!) │
│  - Geodesic Distances          - Shapely Geofencing         │
│  - Deterministic Risk Engine   - Route Exposure Scoring     │
│                                                             │
│  [ Voice Services (Sarvam AI) ]                             │
│  - saaras:v4 (Vernacular STT)  - bulbul:v3 (Natural TTS)    │
│                                                             │
│  [ Hybrid Ingestion & Storage ]                             │
│  - INCOIS (PFZ & OSF)          - IMD Weather Bulletins      │
│  - Open-Meteo Marine (Live)    - Curated Maritime GeoJSON   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Domain | Technology |
| :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript, MapLibre GL JS, Lucide Icons, Vanilla CSS |
| **Backend API** | FastAPI, Pydantic v2, HTTPX, SQLAlchemy, Uvicorn |
| **Agent Runtime** | LangGraph, Provider-Agnostic LLM Interface (OpenAI / Ollama / Fake) |
| **Geospatial & Domain** | Shapely, GeoPandas, PyProj, GeoAlchemy2, PostGIS |
| **Voice & Speech** | Sarvam AI SDK (`saaras:v4` STT, `bulbul:v3` TTS), Faster-Whisper |
| **Testing** | Pytest (526 tests), Vitest (39 tests) |

---

## 🛡️ Core Safety Principles

1. **Deterministic Risk Authority**: LLMs understand context and explain results, but **never calculate risk or distances**. All safety thresholds and geofence intersections run in pure deterministic Python.
2. **Hard-Stops**: Active IMD Red Alerts or prohibited boundary intersections trigger unconditional `NO_GO` states that the LLM cannot soften.
3. **Stale Data Preclusion**: Stale (>24h) or missing forecast data can never produce a `GO` status.
4. **Evidence-First**: Every numerical fact presented to the user is backed by an `EvidenceItem` with source URLs and validity timestamps.
5. **No Hallucinated Percentages**: Confidence is derived from data freshness and official source availability.

---

## 🚀 Quickstart & Local Execution

### Prerequisites
* Python 3.11+
* Node.js 18+ and npm
* (Optional) Docker & Docker Compose for PostgreSQL/PostGIS

### 1. Backend Setup
```bash
# From repository root
cd backend

# Install dependencies
pip install -r requirements.txt
pip install sarvamai

# Run backend development server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
# In a new terminal
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🧪 Verification & Testing Commands

```bash
# Run all backend unit, contract, domain, connector, and agent tests
pytest

# Run frontend tests
cd frontend && npm test -- --run

# Run frontend production build
cd frontend && npm run build
```

---

## 🤖 AI / Developer Handoff

Before modifying this repository:

1. Read this `README.md`.
2. Read [`docs/ORCA_MASTER_CONTEXT.md`](file:///d:/Projects/SAMUDRA/docs/ORCA_MASTER_CONTEXT.md) for canonical system behavior.
3. Read [`docs/ORCA_IMPLEMENTATION_PLAN.md`](file:///d:/Projects/SAMUDRA/docs/ORCA_IMPLEMENTATION_PLAN.md) and identify your assigned workstream (A through F).
4. Inspect the relevant source code before making changes.
5. **Verify implementation status** before assuming a feature exists.
6. Follow the current implementation plan and maintain existing tests.
7. Update the canonical documentation when important architectural decisions change.
