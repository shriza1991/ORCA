# Prototype browser access repair

Verified on 2026-10-03 (Asia/Kolkata). Client: `https://orca-qxx1.vercel.app`; API: `https://samudra-1.onrender.com/api/v1`.

## Root cause and evidence

The deployed API answered its health request with HTTP 200, but returned HTTP 400, `Disallowed CORS origin`, to an OPTIONS request from the actual Vercel origin. Its GET response also omitted `Access-Control-Allow-Origin`. This proves the API was reachable and its effective CORS allowlist rejected the browser. We cannot inspect the Render environment directly, so the exact override value is not established.

The health payload reported deployed commit `a660d747ffc9b984adff3f030fa3205dfaa2c21d`, environment `development`, and mode `SNAPSHOT`. This differs from the inspected current repository; the dashboard service/branch and deployment must be checked. The existing code and blueprint already included the Vercel origin, so changing a repository default alone cannot correct an existing environment override on an old deployment.

Most supplied errors (forecast, base layers, health, fleet, alerts, sectors, scenarios, PFZ, boundaries, hazards, lighthouses, nearby ports) are consequences of that shared origin rejection. A successful health response alone does not prove browser access.

The separate MapLibre warning comes from the reusable DeckGL basemap calling `setStyle` at initial mount and requesting style diffing while switching unrelated styles. The Fisher map already guarded this; the foundation now does too. `installHook.js` is where the browser extension wraps logging, not evidence that it caused the network failure.

## Repository corrections

- Exact `FRONTEND_ORIGIN` setting independently includes the known prototype client even when `CORS_ORIGINS` is stale/local-only. Set it empty when deliberately deploying a different client. No wildcard or arbitrary Vercel preview origins are allowed.
- CORS configuration accepts comma-separated values or a JSON array, trims whitespace/trailing slashes, deduplicates, and rejects paths, credentials and wildcards.
- `.env.example` and `render.yaml` include the actual prototype origin explicitly; the template also documents Vite's API base variable.
- GET clients no longer send a needless JSON Content-Type header. JSON POST requests retain it and still require valid preflight permission.
- Reusable DeckGL basemap skips unchanged styles and uses `diff: false` on real theme changes.
- `backend/scripts/check_browser_access.py` checks representative GET/POST preflights plus the actual browser health response and reports deployed commit/mode. It fails if a 200 health response is inaccessible to the browser.

## Required action on the existing Render service

1. Open the service whose URL is `samudra-1.onrender.com`. Set `CORS_ORIGINS` to `https://orca-qxx1.vercel.app` (an exact origin, no `/api/v1` suffix). Save and redeploy. This fixes the currently deployed allowlist without waiting for the new code.
2. For the new version, also set `FRONTEND_ORIGIN=https://orca-qxx1.vercel.app`. Check that the linked GitHub repository is the current ORCA repository, branch `main`, and deploy its latest commit. Existing manual Render services do not automatically inherit every `render.yaml` value.
3. On Vercel, retain `VITE_API_BASE_URL=https://samudra-1.onrender.com/api/v1` for the Vite client and redeploy the latest frontend to include the header/style fixes. Do not point it at a different service accidentally.
4. Verify from the repository:

```powershell
python backend/scripts/check_browser_access.py --api https://samudra-1.onrender.com/api/v1
```

All checks must say PASS, then refresh the browser. Check both desktop and narrow views. Render/Cloudflare gateway errors can omit CORS headers even with a correct app allowlist; the script's status and deployed commit help distinguish these from a rejected origin.

## Verification

- `DEBUG=false python -m pytest tests/api/test_browser_access.py tests/api/test_production_resilience.py -q`: **11 passed**. Covers stale local allowlist, JSON/CSV configuration, unknown origin rejection, GET/POST preflights, validation errors and existing safe server-error responses.
- Frontend verification is recorded in `docs/PROGRESS.md`.
- Live repair remains pending the Render environment change/redeploy; no account credentials or deployment connection are available in this session.
