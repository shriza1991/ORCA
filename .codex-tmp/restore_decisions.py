import subprocess
from pathlib import Path

path = Path("docs/DECISIONS.md")
baseline = subprocess.run(
    ["git", "show", "HEAD:docs/DECISIONS.md"], check=True, capture_output=True
).stdout
additions = """## D055 - Intent-Bounded Tool Planning and Conversation Assessment Reuse
Status: ACCEPTED
Decision: Safety plans always require marine conditions, weather conditions, hazard search, and deterministic risk evaluation. Any structured planner proposal must be both registered/available and a member of the intent's required capability set. Short analytical follow-ups restore the prior serialized canonical Recommendation and its provenance from conversation metadata.
Reason: Contract tools do not necessarily populate optional `supported_intents`, and the deterministic planner could propose a registered but unrelated capability. Both conditions could silently leave safety without observations. Follow-up intent classification also retained conversation continuity without retaining the evaluated decision, causing a legacy demo answer to replace the prior decision context.
Alternatives: Trust the structured planner based on registry membership alone (rejected because registry membership does not establish relevance to current intent); generate a new safety assessment for "Why?" without the previous observations (rejected because it would no longer explain the decision already presented).
Impact: Safety graph execution is deterministic when optional metadata is absent, structured proposals cannot cross intent boundaries, and explanations reference the decision/provenance already saved for the thread. Unknown remains the output whenever the saved assessment itself is unavailable.
Owner: ORCA engineering
Date: 2026-09-28

## D056 - Degraded Connector Fallback and Forecast Window Honesty
Status: ACCEPTED
Decision: In HYBRID mode, fall back to the configured snapshot when all live providers fail, including authentication/provider errors, and include the failure category in the source label. Snapshot OSF selection never substitutes a nearest observation that is after the requested departure or older than the configured freshness window. Fixture-dependent tests use the generator's REFERENCE_TIME.
Reason: Demo/offline UI behavior must remain available during live-provider failures while preserving the actual failure type. Separately, nearest-neighbor reuse presented stale or future observations as if they covered a trip window. The regenerated synthetic fixtures moved the source horizon, while several assertions still named the previous date.
Alternatives: Raise authentication failures without fallback (rejected for demo-first continuity requirements; the fallback remains clearly marked); label every fallback "Transient Error" (rejected because auth/configuration failures are not transient); serve nearest fixture data beyond coverage (rejected because it can create a false safety assessment).
Impact: HYBRID fallback remains available and its provenance distinguishes authentication and provider errors. Missing forecast coverage returns structured unavailable evidence. Synthetic acceptance tests remain coupled to the generator's canonical reference date.
Owner: ORCA engineering
Date: 2026-09-28"""
path.write_bytes(baseline.rstrip(b"\r\n") + b"\n\n" + additions.encode("utf-8") + b"\n")
