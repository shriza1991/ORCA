# ORCA Mission Demo ? Verified Vite Journey

Implementation/verification: 2026-10-02?03. Use the Vite client; Next.js was not modified.

## Launch a controlled package

From the repository root, in PowerShell:

```powershell
$env:DEBUG='false'
$env:DATA_MODE='DEMO'
$env:LLM_MODE='deterministic'
$env:ORCA_DEMO_REFERENCE='2026-10-02T06:00:00Z'
$env:CORS_ORIGINS='http://localhost:5173,http://127.0.0.1:5173'
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
$env:VITE_DATA_MODE='DEMO'
$env:VITE_API_BASE_URL='http://127.0.0.1:8000/api/v1'
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`. The reference setting projects the existing generated data package, including institutional records, onto one explicitly frozen clock. It is not live telemetry. Omit the reference override for the existing daily package. After the fixed recording date passes, choose a new reference and a future mission inside its coverage; the guided plan rejects past departures. Do not call the fixed recording date ?tomorrow? against an unrelated wall clock.

## Rehearsal

1. Enter Fisher. Plan Ratnagiri, medium motorized boat, **3 October 2026 05:00?17:00 IST**, auto PFZ; confirm. The fixed package contains a warning overlapping this mission. Show NO_GO, source validity and the actual governing reason.
2. Expand a corridor and inspect waypoint arrival/wave/wind values and rejection reasons. If no retained PFZ covers a proposed departure, no corridor is invented. Origin-based exposure is not a spatial forecast grid or return-route clearance.
3. Compare a **four-hour delay**. Inspect the same bundle ID, baseline/proposal times and server delta. An applicable warning remains restrictive; the fixture was not chosen to force a positive result.
4. Use the exact returned plan. The displayed mission, map, Ask baseline and history must agree; Apply does not refetch providers.
5. Ask ?Why??, nearest PFZ, nearby hazards, and route questions. They show different evidence content while retaining the same mission decision. A conversational What-If returns a separate proposal and Apply control.
6. Select Hindi/Marathi where available. Recorded speech is editable before sending; confirm/correct harbor, vessel and dates. Call turns also carry the same assessment/bundle identity. Physical microphone recognition and external STT/TTS provider quality have not been field-verified.
7. Open Alerts and check changes. This refresh is separate from parameter comparison. Optional minute monitoring runs only while that view is open, deduplicates material changes and requires review; it is not a push-notification service.
8. Show cached age/expiry under a failed connection. An assessment cached more than six hours ago displays UNKNOWN and has no supported corridor. Text remains the fallback for unavailable speech.
9. Return to Workspaces; Authority/Researcher can inspect that same saved Fisher record. The handoff is explicitly historical/device-local, without implying fleet membership or authenticated operational access.

## Verification and limits

Desktop 1440 px and Fisher 390 px browser checks cover guided planning, pinned chat, server comparison, exact Apply without refetch, map restriction, explicit refresh, cross-role record identity and expired offline evidence. The narrow Fisher view has no horizontal overflow in those checks. No browser page errors were recorded.

Retention is limited to 256 bundles/assessments per backend process and is lost on restart. Missing IDs fail explicitly. No live upstream, deployment, chart-grade navigation, real fleet feed, catch guarantee, calibrated uncertainty probability, or production authentication is certified by this demonstration.
