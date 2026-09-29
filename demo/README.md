# ORCA SIH Demonstration Kit & Media Artifacts

> **Owned by Member 6 (QA & Demo Lead)**  
> **Jury:** ISRO / Department of Space (SIH 2026)

---

## 1. Demo Checklist
- [ ] Primary laptop running Docker Compose with PostgreSQL/PostGIS.
- [ ] Backend running with `DATA_MODE=HYBRID` (and verified `DATA_MODE=SNAPSHOT` fallback).
- [ ] Frontend running at `http://localhost:5173`.
- [ ] MapLibre basemap tiles pre-cached locally (or using offline fallback tiles).
- [ ] Secondary backup laptop pre-warmed with duplicate environment.
- [ ] High-definition screen recording (`orca_demo_backup.mp4`) placed in this folder.
- [ ] Presentation slides synchronized with [`docs/DEMO.md`](file:///c:/Users/dyara/ORCA/docs/DEMO.md).

---

## 2. Quick Offline Toggle Command
If presentation Wi-Fi becomes unstable, run:
```bash
# In backend .env, set:
DATA_MODE=SNAPSHOT
```
And restart FastAPI or trigger snapshot mode via UI toggle.
All 4 core journeys will resolve instantaneously from `data/fixtures/` with zero latency.
