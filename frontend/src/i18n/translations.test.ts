import { describe, it, expect } from "vitest";
import {
  TRANSLATIONS,
  translateText,
  translateChatMessage,
} from "./translations";
import type { SupportedLanguage } from "./translations";

describe("Multilingual i18n Dictionary", () => {
  const languages: SupportedLanguage[] = ["en", "hi", "mr"];

  it.each(languages)("provides complete translation keys for %s", (lang) => {
    const t = TRANSLATIONS[lang];
    expect(t).toBeDefined();
    expect(t.appTagline).toBeTruthy();
    expect(t.welcomeTitle).toBeTruthy();
    expect(t.welcomeSubtitle).toBeTruthy();
    expect(t.inputPlaceholder).toBeTruthy();
    expect(t.samplePromptsTitle).toBeTruthy();
    expect(t.decisiveFactorsTitle).toBeTruthy();
    expect(t.nextActionLabel).toBeTruthy();
    expect(t.back).toBeTruthy();
    expect(t.backToStart).toBeTruthy();
    expect(t.newChat).toBeTruthy();
    expect(t.chatTitle).toBeTruthy();
    expect(t.micBtnAria).toBeTruthy();
    expect(t.micRecordingAria).toBeTruthy();
    expect(t.micTranscribingAria).toBeTruthy();
    expect(t.recordingIndicator).toBeTruthy();
    expect(t.transcribingIndicator).toBeTruthy();

    // Check all standard recommendation statuses have localized labels
    const expectedStatuses = [
      "GO",
      "CAUTION",
      "NO_GO",
      "UNKNOWN",
      "INFORMATIONAL",
    ];
    for (const status of expectedStatuses) {
      expect(t.statusLabels[status]).toBeDefined();
      expect(t.statusLabels[status].length).toBeGreaterThan(0);
    }

    // Check canonical prompt queries exist in that specific script
    expect(t.prompts).toHaveLength(4);
    for (const p of t.prompts) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.query).toBeTruthy();
    }
  });

  it("Marathi prompts contain Devanagari characters", () => {
    const mr = TRANSLATIONS.mr;
    expect(/[\u0900-\u097F]/.test(mr.welcomeTitle)).toBe(true);
    expect(/[\u0900-\u097F]/.test(mr.prompts[0].query)).toBe(true);
    expect(mr.prompts.some((p) => p.query.includes("रत्नागिरी"))).toBe(true);
  });

  it("Hindi prompts contain Devanagari characters", () => {
    const hi = TRANSLATIONS.hi;
    expect(/[\u0900-\u097F]/.test(hi.welcomeTitle)).toBe(true);
    expect(/[\u0900-\u097F]/.test(hi.prompts[0].query)).toBe(true);
    expect(hi.prompts.some((p) => p.query.includes("रत्नागिरी"))).toBe(true);
  });

  it("translates chat message content across languages", () => {
    const enQuery =
      "Where is the nearest Potential Fishing Zone today from Ratnagiri?";
    const mrQuery = translateChatMessage(enQuery, "mr");
    const hiQuery = translateChatMessage(enQuery, "hi");

    expect(mrQuery).toContain("मत्स्य");
    expect(hiQuery).toContain("मत्स्य");

    const enAnswer =
      "Departure from Ratnagiri tomorrow at 06:00 is advised against (NO-GO).";
    expect(translateChatMessage(enAnswer, "mr")).toContain("रत्नागिरी");
    expect(translateChatMessage(enAnswer, "hi")).toContain("रत्नागिरी");
  });

  it("translates fisherman trip wizard strings in Hindi and Marathi", () => {
    expect(translateText("From which port?", "hi")).toContain("किस बंदरगाह से");
    expect(translateText("When will you depart?", "mr")).toContain(
      "तुम्ही कधी",
    );
    expect(translateText("Auto-select best PFZ (Recommended)", "hi")).toContain(
      "सर्वोत्तम",
    );
    expect(translateText("Traditional craft", "mr")).toContain("पारंपरिक");
    expect(translateText("Confirm & Run Safety Assessment", "hi")).toContain(
      "सुरक्षा मूल्यांकन",
    );
  });

  it("translates recommendation factors and next actions", () => {
    const decisive =
      "Significant wave height 3.4m exceeds craft safety ceiling (2.5m)";
    expect(translateText(decisive, "hi")).toContain("लहर ऊंचाई 3.4 मी");
    expect(translateText(decisive, "mr")).toContain("लाट उंची 3.4 मी");
  });

  it("translates dynamic operational assessment strings in Hindi and Marathi", () => {
    const summary =
      "Moderate wave state (1.6m) requires caution for motorized_boat.";
    expect(translateText(summary, "hi")).toContain("सावधानी");
    expect(translateText(summary, "mr")).toContain("सावधगिरी");

    expect(translateText("Significant wave height: 1.6m", "hi")).toContain(
      "1.6 मी",
    );
    expect(translateText("Significant wave height: 1.6m", "mr")).toContain(
      "1.6 मी",
    );

    expect(translateText("Sustained wind: 15.0 knots", "hi")).toContain(
      "15.0 नॉट्स",
    );
    expect(translateText("Sustained wind: 15.0 knots", "mr")).toContain(
      "15.0 नॉट्स",
    );

    expect(translateText("Vessel profile: motorized_boat", "hi")).toContain(
      "मोटराइज्ड नाव",
    );
    expect(translateText("Vessel profile: motorized_boat", "mr")).toContain(
      "मोटार बोट",
    );

    expect(
      translateText(
        "Operate within 5 nm of coastline (Simulation only).",
        "hi",
      ),
    ).toContain("सिमुलेशन");
    expect(
      translateText(
        "Operate within 5 nm of coastline (Simulation only).",
        "mr",
      ),
    ).toContain("सिम्युलेशन");

    expect(
      translateText("Evaluated against M2 mock threshold ceilings", "hi"),
    ).toContain("M2");
    expect(
      translateText(
        "M2 Contract Mock evaluation — not for real navigation.",
        "hi",
      ),
    ).toContain("वास्तविक नौवहन के लिए नहीं");
  });

  it("translates suggested followup questions", () => {
    expect(translateText("When will sea conditions improve?", "hi")).toBe(
      "समुद्र की स्थिति कब सुधरेगी?",
    );
    expect(translateText("When will sea conditions improve?", "mr")).toBe(
      "सागरी परिस्थिती कधी सुधारेल?",
    );

    expect(translateText("Alternative sheltered route options", "hi")).toBe(
      "तट के पास सुरक्षित वैकल्पिक मार्ग",
    );
    expect(translateText("Port authority emergency contacts", "hi")).toBe(
      "पत्तन प्राधिकरण आपातकालीन संपर्क",
    );
  });

  it("translates full structured multi-line operational advisory in chat message", () => {
    const rawAdvisory = [
      "[CAUTION] Operational Advisory for Ratnagiri:",
      "",
      "Moderate wave state (1.6m) requires caution for motorized_boat.",
      "",
      "Key Decisive Factors:",
      "- Significant wave height: 1.6m",
      "- Sustained wind: 15.0 knots",
      "- Vessel profile: motorized_boat",
      "",
      "Actionable Directive: Operate within 5 nm of coastline (Simulation only).",
    ].join("\n");

    const hiAdvisory = translateChatMessage(rawAdvisory, "hi");
    expect(hiAdvisory).toContain("रत्नागिरी के लिए समुद्री सुरक्षा सलाह:");
    expect(hiAdvisory).toContain("प्रमुख निर्णायक कारक:");
    expect(hiAdvisory).toContain("1.6 मी");
    expect(hiAdvisory).toContain("15.0 नॉट्स");
    expect(hiAdvisory).toContain("कार्रवाई निर्देश:");

    const mrAdvisory = translateChatMessage(rawAdvisory, "mr");
    expect(mrAdvisory).toContain("रत्नागिरी साठी सागरी सुरक्षा सल्ला:");
    expect(mrAdvisory).toContain("महत्त्वाचे निर्णायक घटक:");
    expect(mrAdvisory).toContain("कृती सल्ला:");
  });

  it("translates portal, what-if, authority deck, and map layer phrases", () => {
    // Portal & Fisher Deck
    expect(
      translateText("Select Your Operational Mission Portal", "hi"),
    ).toContain("पोर्टल");
    expect(translateText("Fisher Console", "mr")).toContain("कन्सोल");
    expect(translateText("Authority Command Deck", "hi")).toContain("डेक");
    expect(translateText("Voyage controls", "mr")).toContain(
      "प्रवास नियंत्रणे",
    );

    // What-If & Mission Twin
    expect(translateText("Mission Twin", "hi")).toBe("मिशन ट्विन");
    expect(translateText("Run What-If Simulation", "mr")).toContain(
      "सिम्युलेशन सुरू करा",
    );
    expect(translateText("Counterfactual Decision Impact", "hi")).toContain(
      "निर्णय प्रभाव विश्लेषण",
    );

    // Authority & Fleet Surveillance
    expect(
      translateText("Maritime Fleet Surveillance & Trajectory Replay", "mr"),
    ).toContain("पाळत");
    expect(translateText("Audit Terminal", "hi")).toBe("ऑडिट टर्मिनल");
    expect(translateText("Benchmark Runner", "mr")).toContain("बेंचमार्क");

    // Map & Layers
    expect(translateText("Map Layers", "hi")).toBe("मानचित्र परतें");
    expect(translateText("Safety Critical", "mr")).toBe(
      "सुरक्षिततेसाठी महत्त्वाचे",
    );
    expect(translateText("Safest Corridor", "hi")).toContain(
      "सुरक्षिततम गलियारा",
    );

    // Researcher Lab
    expect(translateText("Researcher Lab", "hi")).toBe("शोधकर्ता प्रयोगशाला");
    expect(translateText("Researcher Lab", "mr")).toBe("संशोधक प्रयोगशाळा");
    expect(translateText("Enter Researcher Lab", "hi")).toContain(
      "शोधकर्ता प्रयोगशाला",
    );
    expect(translateText("Enter Researcher Lab", "mr")).toContain(
      "संशोधक प्रयोगशाळेत",
    );
  });
});
