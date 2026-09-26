# ORCA — Marine EcOsystem Reasoning with Collaborative Agents
### Active Prototype Moniker: SAMUDRA (Smart Autonomous Marine Understanding, Decision & Risk Assistant)

> **SIH 2026 Problem Statement:** PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents  
> **Organization:** Indian Space Research Organisation (ISRO) / Department of Space  
> **Theme:** Disaster Management & Coastal Maritime Safety  
> **Classification:** Production-Grade Hackathon Prototype & AI Decision-Support System

---

## 🌊 Overview

**ORCA** is the final product identity for the Marine Mission Intelligence platform. It is not another marine dashboard; it is the intelligence and reasoning layer above existing marine information systems.

The final ORCA principle is:

```text
ASK → PLAN → DISCOVER → REASON → DECIDE → EXPLAIN → SIMULATE → ADAPT
```

The final product value chain is:

```text
DATA → REASONING → DECISION → ADAPTATION
```

The primary user is the fisherman or field marine operator. Institutional users include fisheries officers, fleet operators, researchers, Emergency/SAR teams, and administrators.

This repository still contains a current implementation prototype and historical design artifacts. The product direction below is the final target architecture and should be treated as the canonical product definition, while current implementation status remains separate and factual.

> [!CAUTION]
> **CURRENT IMPLEMENTATION STATUS**  
> This codebase reflects an active prototype / integration build, not a finished production marine operations platform. The decisions below define the final ORCA product direction and target architecture.

---

## 🧭 Canonical Documentation & Single Source of Truth

Before making any modifications or assuming feature states, review the canonical project documentation:

1. [docs/ORCA_AI_MASTER_CONTEXT.md](docs/ORCA_AI_MASTER_CONTEXT.md) — Final strategic and architectural source of truth for ORCA product direction, product interfaces, shared intelligence core, and technology stack decisions.
2. [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Canonical development roadmap and phased implementation plan.
3. [docs/SAFETY.md](docs/SAFETY.md) — Deterministic risk thresholds, craft limits, and safety hard-stops.
4. [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) — Canonical Pydantic schemas (`ChatRequest`, `ChatResponse`, `VoiceChatResponse`).
5. [AGENTS.md](AGENTS.md) — AI agent entry rules, source of truth priority, and development guardrails.

---

## 🏛️ Final Product Architecture

ORCA has two product interfaces sharing one intelligence core:

1. **Mobile Field Application**: Built with **React Native + Expo + TypeScript**. Primary user value is fishermen and other field users with low-friction, voice-first interaction, GPS, mission context, safety decisions, WHY/WHAT-IF reasoning, offline capability, and maps.
2. **Web Platform**: Built with **Next.js + React + TypeScript**. Primary user value is the public demo entry point and institutional / operational / research experiences for fleet operators, fisheries officers, researchers, emergency/SAR users, and administrators.

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

---

## 🛠️ Final Technology Stack

| Domain | Final Technology | Notes |
| :--- | :--- | :--- |
| **Mobile Field App** | **React Native + Expo + TypeScript** | Native field product, primarily Android; EAS build / install distribution; Expo Web is optional and not primary. |
| **Web Platform** | **Next.js + React + TypeScript** | Primary frictionless demo and judging interface; role-oriented institutional experience. |
| **Backend & Core API** | **FastAPI, Python, SQLAlchemy, Alembic** | Shared intelligence core powering both interfaces. |
| **Database & GIS** | **PostgreSQL, PostGIS, Redis** | Spatial constraints, route logic, evidence and operational data. |
| **Deterministic Engines** | **Shapely, GeoPandas, PyProj** | Safety, geofencing, route calculations, temporal validity, evidence validation. |
| **Agent Orchestration** | **LangGraph** | Intent, planning, source selection, synthesis, explanation. |
| **Scientific Storage** | **S3 / MinIO compatible object storage** | Large EO / scientific assets. |
| **Observability** | **OpenTelemetry, Prometheus / Grafana** | Monitoring and traceability where already planned. |

---

## ⚖️ Mobile vs Web Responsibilities

| Dimension | Mobile Field App (React Native + Expo) | Web Platform (Next.js) |
| :--- | :--- | :--- |
| **Primary Audience** | Fisherman, crew, field marine user | Demo users, institutional operators, researchers, emergency/SAR, administrators |
| **Interaction Style** | Low-friction, voice-first, map-first, offline-friendly | Analytical, multi-role, operational and research-focused |
| **Primary Scope** | Mission setup, Ask ORCA, decision, WHY, WHAT-IF, GPS, alerts, offline | Fleet, fisheries, research, analytics, evidence, historical and replay views |
| **Delivery / Target** | EAS build → Android app / install link | Deployed web URL as the frictionless judge access point |

The mobile app is not a reduced web experience and does not need feature parity with the institutional web application.

---

## 🏆 Final Demonstration & Judging Strategy

1. **Primary demo surface**: Existing deployed **Next.js web URL**. This remains the zero-install, instant-access judge experience.
2. **Mobile demonstration**: A focused native **React Native + Expo** fisherman MVP is shown in the demo video and can be distributed through an **EAS / Android install link**.
3. **Web-first judgment**: Judges should not be expected to install the APK as the primary way to experience ORCA.
4. **Data honesty**: Data modes are explicit (`LIVE`, `LIMITED`, `CACHED_REAL`, `HISTORICAL`, `MOCK`, `UNAVAILABLE`), and mock or cached data is never misrepresented as live.

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

### 2. Frontend Execution (Web)

#### A. Next.js Migration Application (`nextjs/` - Active Target)
```bash
# In a new terminal
cd nextjs

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```
Open `http://localhost:3000` in your browser. Target routes: `/` (portal), `/fisher` (primary operational demo), `/authority`, `/researcher`, `/marinewatch`, `/settings`.

#### B. Legacy Vite Frontend (`frontend/` - Preserved During Migration)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### Production topology

Local development uses `Docker Postgres/PostGIS → FastAPI → Vite or Next.js`.
Production uses `Vercel frontend → Render FastAPI → Render Managed PostgreSQL/PostGIS`.
The browser never connects directly to PostgreSQL. Render supplies the real
`DATABASE_URL`; run Alembic migrations against that database during deployment.
The frontend receives only the public backend base through
`VITE_API_BASE_URL` (Vite) or `NEXT_PUBLIC_API_BASE_URL` (Next.js).

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
2. Read [`docs/ORCA_AI_MASTER_CONTEXT.md`](docs/ORCA_AI_MASTER_CONTEXT.md) for canonical system behavior and final product direction.
3. Read [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) and identify your assigned workstream.
4. Inspect the relevant source code before making changes.
5. **Verify implementation status** before assuming a feature exists.
6. Follow the current implementation plan and maintain existing tests.
7. Update the canonical documentation when important architectural decisions change.
