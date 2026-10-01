# ORCA Demo Video Script

## Demo Objective

Show one fisherman’s mission from a plain-language question to an evidence-backed operating decision. The demo makes the central distinction clear: ORCA connects marine information to a mission, applies vessel and safety context, explains the decision, and lets the user test a changed plan. This recording uses the prototype’s controlled deterministic demo snapshot, labelled in the interface as DEMO DATA.

## Full Voiceover + Screen Direction

### [00:00–00:25]

**SCREEN:** Open the ORCA Fisher view. The landing screen shows the Plan and Assistant controls and the fisherman mission setup entry point.

**VOICEOVER:** “A fisherman does not make a decision from one chart or one forecast. The useful answer depends on the boat, the departure time, the fishing area, waves, wind, visibility, tides, hazards, and the route between them. That information is usually fragmented. ORCA turns it into one mission decision.”

### [00:25–00:55]

**SCREEN:** Select **Plan my trip**. Set the origin to Ratnagiri, choose **Traditional craft**, choose departure on September 29 at 06:00, set the 12-hour mission window, and continue to target selection.

**VOICEOVER:** “I’ll use the field scenario already supported by the prototype. The origin is Ratnagiri. The craft is a traditional fishing craft, so the safety context is different from a larger vessel. I’m asking ORCA to evaluate a twelve-hour trip beginning tomorrow morning.”

### [00:55–01:20]

**SCREEN:** In the target step, choose **Auto-select best PFZ** and confirm the assessment. Keep the request and mission summary visible as the assessment loads.

**VOICEOVER:** “For the destination, I’m asking ORCA to select the best available potential fishing zone. This is the important interaction: I provide a mission in ordinary terms, and ORCA carries the context forward instead of treating every question as a separate chat message.”

### [01:20–01:55]

**SCREEN:** Show the completed assessment: the **CAUTION** trip decision, the three evaluated routes, and the route comparison. Scroll just enough to show the selected route and the route alternatives.

**VOICEOVER:** “The result is CAUTION. ORCA has evaluated three routes and identifies a recommended route, while keeping the alternatives visible. This is not a list of raw readings. The route, timing, and craft profile are part of the same evaluation.”

### [01:55–02:35]

**SCREEN:** Scroll to **Mission Brief & Why Panel**. Show **Recommended Action: Hold departure. Verify with port authorities before navigating**, the positive factors, negative and risk factors, confidence, and recommendation stability.

**VOICEOVER:** “The recommendation is to hold departure and verify with port authorities before navigating. The positive factors are visible: the selected snapshot shows a significant wave height of about 0.86 metres, sustained wind of about 1.7 knots, and gusts of about 5.2 knots. But ORCA does not convert favourable numbers into an automatic go decision. The evidence is marked degraded or incomplete, and the sensor validity window is expired. That uncertainty lowers confidence and keeps the decision at caution. This is the reasoning layer: evidence, validity, vessel context, and uncertainty are evaluated together.”

### [02:35–03:05]

**SCREEN:** Show the condition cards for waves, wind, visibility, and tide, then the degraded-data panel. Point to **DEMO DATA**, visibility around 10.0 km, tide around 1.2 m with phase EBB, and the warning to proceed with caution.

**VOICEOVER:** “The supporting context is consistent across the mission surface: visibility is about ten kilometres, the tide is about 1.2 metres and ebbing, and the interface explicitly labels this as demo data. These are controlled snapshot values for a reproducible demonstration, not a claim of live official telemetry. ORCA makes that provenance visible instead of hiding it.”

### [03:05–03:35]

**SCREEN:** Open **Inspect Evidence & Data Feeds**. Show the threshold matrix with observed values, thresholds, margins, impact labels, and the expired data-validity row.

**VOICEOVER:** “Now inspect the evidence. The threshold matrix puts the observed value beside the operating threshold and shows the margin and impact. The data-validity row is expired, while the wave and wind comparisons remain within their displayed thresholds. A judge can see both what supports the trip and what prevents ORCA from overstating certainty.”

### [03:35–04:15]

**SCREEN:** Open **Mission Twin / What-If Simulation**. Change the departure delay to a later option, or change the craft profile, run the simulation, and show the decision-delta card comparing the baseline and simulated decision. Do not apply the simulation unless demonstrating the action.

**VOICEOVER:** “The mission can now adapt. I’ll test a changed departure window in the Mission Twin. ORCA recomputes the scenario and presents a decision delta: the baseline, the simulated status, and the factors that changed. The user is not asking a new chatbot question and starting over. The same mission is being re-evaluated under a new assumption.”

### [04:15–04:40]

**SCREEN:** Return to the main decision surface and show the map with the route, PFZ candidates, and marine condition layers. Finish on the recommendation and the **Hear the update** control.

**VOICEOVER:** “This is why ORCA is more than a dashboard. A dashboard exposes layers. ORCA binds those layers to a mission, reasons across time, location, vessel limits, route options, and evidence quality, then explains the operational consequence. The map helps me see where the decision applies; the brief tells me what to do.”

### [04:40–05:00]

**SCREEN:** Hold on the final CAUTION card, the explanation, and the demo-data provenance label. Optionally activate **Hear the update** for the closing frame.

**VOICEOVER:** “For the SIH problem, the value is an agentic marine mission-intelligence layer above existing information systems. A field user can ask naturally, receive a traceable decision, understand why it was reached, and test what changes it. ORCA connects data to reasoning, reasoning to action, and action to safer adaptation.”
