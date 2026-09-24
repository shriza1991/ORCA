# ORCA — Architecture Understanding + Implementation Blueprint

> Status: Locked Architectural Blueprint & Active Migration Plan.
> Principles: REUSE → ADAPT → EXTRACT → REWRITE.
> State Management Rule: Migrate existing React hooks and fetch client first; prove migration before introducing Zustand/TanStack Query.

---

# 1. Repository Understanding

## 1.1 Current State

**Version:** `v0.2.2-features-main-integrated`  
**Milestone:** India MarineWatch + Autonomous Marine Intelligence

### Frontend (existing in `frontend/`)

| Item | Detail |
|------|--------|
| Framework | React 18 + Vite + TypeScript |
| Routing | Manual state machine in `App.tsx` — `useState<PortalMode>` |
| Maps | MapLibre GL 4.x + Deck.gl 9.x |
| State | React `useState` / custom hooks (`useChat`, `useTripAssessment`, `useAlerts`, etc.) |
| API client | Hand-rolled `fetch` wrapper in `src/api/client.ts` |
| Types | Canonical TypeScript contracts in `src/types/contracts.ts`, `mission.ts`, `assessment.ts`, `alerts.ts` |
| Pages | `PortalPage`, `FisherPage`, `AuthorityPage`, `ResearcherPage`, `MarineWatchPage`, `SettingsPage` |
| Offline | `useTripAssessment` hook with `idb-keyval` offline cache, 6-hour expiry |
| Voice | `useVoiceRecorder`, `useCallSession`, `useSpokenGuidance` hooks; `CallModal` |
| i18n | `src/i18n/translations.ts` — en/hi/mr |
| Tests | 235 vitest tests passing across 16 test suites |

### Backend (existing in `backend/`)

| Item | Detail |
|------|--------|
| Framework | FastAPI (Python) |
| Agent/AI | LangGraph + Groq LLM (`qwen3.8-27b` default) |
| DB | PostgreSQL + PostGIS + SQLAlchemy + Alembic |
| Cache | In-memory rate limiter |
| Key APIs | `POST /api/v1/chat`, `POST /api/v1/voice/chat`, `POST /api/v1/voice/transcribe`, `POST /api/v1/trip-assessments`, `GET /api/v1/demo/*`, `GET /api/v1/scenarios/*`, `GET /api/v1/layers/base` |
| MarineWatch | `/forecast/point`, `/forecast/route`, `/hazards/active`, `/fisheries/pfz`, `/ports/nearby`, `/aquaculture/sites/nearby`, `/coast/profile`, `/datasets`, `/search`, `/spatial/query` |
| Agent graph | `backend/app/agents/graph.py` — LangGraph multi-turn with ThreadContext, intent classification, supervisor, specialist tools, evidence validation, response composer, decision delta |
| Decision engine | `DeterministicRiskEngine` — hard safety constraints (severe weather → geofence → wave ceiling), 100% Python deterministic |
| MissionState | In `ThreadContext.metadata` + partial schema in `backend/app/contracts/mission.py` + `frontend/src/types/mission.ts` |
| Voice STT/TTS | `backend/app/services/stt_service.py` + `tts_service.py` |
| Tests | 466 agent_eval + 19 marinewatch API + 18 domain passing |

---

# 2. Final Locked Architecture

```text
                    ORCA CORE
                       │
          ┌────────────┴────────────┐
          │                         │
       MOBILE                      WEB
 React Native + Expo             Next.js
      TypeScript                TypeScript
          │                         │
          └────────────┬────────────┘
                       │
                    FastAPI
                       │
        Existing AI + Marine + GIS
                       │
          PostgreSQL + PostGIS
                 + Redis/S3
```

### Shared Intelligence Principle
Mobile and web use the **SAME** backend intelligence.
Never duplicate:
- decision logic
- safety logic
- marine reasoning
- evidence logic
- agent orchestration

### Split of Responsibilities

| Dimension | Web Platform (`nextjs/`) | Mobile Field App (`React Native + Expo`) |
|-----------|--------------------------|-----------------------------------------|
| **Audience** | Institutional users, fleet operators, researchers, public demo & judges | Fishermen, crew, field marine operators |
| **Delivery** | Deployed web application (zero-friction URL) | Android APK / EAS build |
| **Interaction** | Analytical, role-based dashboards, high-res interactive GIS | Touch-first, voice-guided, GPS-driven, offline-first |
| **GIS / Map** | MapLibre GL 4.x + Deck.gl 9.x | MapLibre React Native (no WebGL Deck.gl) |
| **Audio** | Browser Web Audio API | Expo AV native audio |
| **Storage / Cache** | Browser IndexedDB (`idb-keyval`) | Expo SQLite + SecureStore |

---

# 3. Execution Philosophy & State Management Strategy

### First make the existing product portable. Then improve it.

```text
                    CURRENT ORCA
                         │
              ┌──────────┴──────────┐
              │                     │
          React/Vite             FastAPI
              │                     │
              │              Existing intelligence
              │                     │
              └──────────┬──────────┘
                         │
                  MIGRATION LAYER
                         │
             ┌───────────┴───────────┐
             │                       │
          Next.js                React Native
          WEB FIRST              MOBILE MVP
             │                       │
        Fisher first             Fisher first
             │                       │
        Institutional             Field
```

### State Management Rule:
- The existing codebase uses standard React hooks (`useChat`, `useTripAssessment`, `useAlerts`) and a hand-rolled fetch client (`client.ts`).
- We do **NOT** mandate adding Zustand or TanStack Query on Day 1.
- First port the existing working hooks and fetch client into Next.js.
- Prove the Fisher workflow runs end-to-end.
- Introduce Zustand or TanStack Query later only where justified by concrete state-management friction.

---

# 4. Reuse / Adaptation Matrix

| Area | Current (`frontend/`) | Reusable in `nextjs/` | Migration Action |
|------|------------------------|-----------------------|------------------|
| **TypeScript types** | `src/types/contracts.ts`, `mission.ts`, `assessment.ts`, `alerts.ts` | **100% Reuse** | Copy verbatim into `nextjs/types/` |
| **API Client** | `src/api/client.ts`, `marinewatch-client.ts`, `researcher-client.ts` | **Full Reuse** | Adapt `import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*` |
| **Domain Logic** | `useChat`, `useTripAssessment`, `useAlerts`, `useGeolocation`, `useGeofence` | **Full Reuse** | Add `'use client'`, adapt browser APIs safely |
| **Utilities & i18n** | `geo.ts`, `fisher-map.ts`, `provenance.ts`, `translations.ts` | **100% Reuse** | Copy into `nextjs/lib/` |
| **Styles** | `variables.css`, `globals.css`, `components.css`, `marinewatch.css` | **Full Reuse** | Import into Next.js root layout |
| **Routing** | Manual `useState<PortalMode>` in `App.tsx` | Replaced | Next.js App Router (`app/page.tsx`, `app/fisher/page.tsx`, etc.) |
| **Maps** | MapLibre GL + Deck.gl | Reused | Wrapped in client component with dynamic SSR disabled (`dynamic(() => ..., { ssr: false })`) |
| **Backend** | FastAPI `/api/v1/*` | **Zero Change Required** | Add Next.js dev port 3000 to CORS allowed origins |

---

# 5. Phased Roadmap (P0 / P1 / P2)

```
PHASE A — Documentation alignment & Decisions (D033)
   ↓
PHASE B — Next.js scaffold alongside frontend/
   ↓
PHASE C — Shared types, API client, utilities, i18n, and hooks
   ↓
PHASE D — Next.js routing shell & layout (app/layout.tsx, app/page.tsx)
   ↓
PHASE E — Fisher experience (/fisher) ★ PRIMARY DEMO ★
   ↓
PHASE F — Remaining web pages (/authority, /researcher, /marinewatch, /settings)
   ↓
PHASE G — React Native + Expo scaffold
   ↓
PHASE H — Mobile mission + Ask + Decision
   ↓
PHASE I — Mobile map (MapLibre RN) + offline (SQLite)
   ↓
PHASE J — Mobile voice / what-if / alerts
   ↓
PHASE K — Retire old Vite frontend
```

---

# 6. Definition of Done — Current Phase (Web Migration Kickoff)

- [x] Documentation updated to reflect target architecture.
- [x] Migration plan and architectural blueprint stored in `ORCA_IMPLEMENTATION_BLUEPRINT.md`.
- [x] Decision `D033` recorded in `docs/DECISIONS.md`.
- [x] Next.js scaffold created at `nextjs/` alongside `frontend/`.
- [x] Shared types, API clients, utilities, and i18n ported to `nextjs/`.
- [x] Backend CORS origin updated for Next.js (`http://localhost:3000`).
- [x] Fisher route (`/fisher`) established with minimal behavioral change.
- [x] Old React/Vite frontend remains available and completely functional.
