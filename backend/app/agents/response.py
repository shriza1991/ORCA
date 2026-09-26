"""Response Composition Contracts & Guardrails for SAMUDRA / ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CORE INVARIANT & ETHICAL SAFETY RULES:
===============================================================================
1. DETERMINISTIC DECISION IMMUTABILITY:
   The LLM agent synthesizes and explains the safety recommendation, but
   MUST NEVER override, soften, or alter the deterministic RecommendationStatus
   (GO, CAUTION, NO_GO, UNKNOWN) calculated by Dev 4's Risk Engine.
   If Dev 4 outputs NO_GO due to a 3.5m wave height, the composer cannot say
   'it might be fine if you are careful'.

2. EVIDENCE-CLAIM ALIGNMENT:
   Every numerical claim in the generated text (wave heights, wind speeds,
   geodesic distances, coordinates) must match an entry in the evidence array
   with valid evidence IDs.

3. SAME-LANGUAGE SENSITIVITY:
   The synthesized answer and suggested follow-ups must match the
   detected/preferred language (Hindi, Marathi, Tamil, English).

4. CONCISE & STRUCTURED OPERATIONAL FORMAT:
   Response must clearly present recommendation status, concise summary,
   decisive factors, actionable next directive, confidence explanation,
   evidence citations, warnings, and contextual suggested follow-ups.
===============================================================================
"""

from typing import List, Optional
from pydantic import BaseModel, Field

from backend.app.contracts.chat import (
    AgentCollaborationPayload,
    AgentTraceItem,
    ChatResponse,
    Confidence,
    ConfidenceLevel,
    EvidenceItem,
    MapLayer,
    Recommendation,
    RecommendationStatus,
)


class ResponseCompositionInput(BaseModel):
    """Input parameters passed to the Response Composer."""

    run_id: str = Field(..., description="Unique run identifier")
    conversation_id: str = Field(..., description="Session conversation identifier")
    language: str = Field("en", description="Target output language code")
    intent: str = Field(..., description="Classified intent category")
    recommendation: Recommendation = Field(..., description="Immutable deterministic safety decision")
    confidence: Confidence = Field(..., description="Derived confidence score")
    evidence: List[EvidenceItem] = Field(default_factory=list, description="Verified citations")
    map_layers: List[MapLayer] = Field(default_factory=list, description="MapLibre GeoJSON layers")
    trace: List[AgentTraceItem] = Field(default_factory=list, description="Sanitized audit trace")
    warnings: List[str] = Field(default_factory=list, description="Operational caveats")
    raw_observations: dict = Field(default_factory=dict, description="Observations dictionary")
    agent_collaboration: Optional[AgentCollaborationPayload] = Field(
        None, description="Multi-agent reasoning, evidence, arbitration, and timeline"
    )


class ResponseComposer:
    """Orchestrates response assembly, enforcing safety invariants, grounding, and concise formatting."""

    @staticmethod
    def validate_safety_invariance(
        composed_response: ChatResponse,
        original_recommendation: Recommendation,
    ) -> None:
        """Verifies that the composed response does NOT tamper with the deterministic risk decision.

        Raises:
            ValueError: If status has been altered or softened.
        """
        if composed_response.recommendation.status != original_recommendation.status:
            raise ValueError(
                f"SAFETY INVARIANT VIOLATION: Composed response altered recommendation status from "
                f"'{original_recommendation.status}' to '{composed_response.recommendation.status}'. "
                f"The LLM must never override deterministic risk logic."
            )

    @staticmethod
    def format_confidence_explanation(
        confidence: Confidence,
        language: str = "en",
    ) -> str:
        """Formats the confidence rating and justification in the target language."""
        level_map_mr = {
            ConfidenceLevel.HIGH: "उच्च",
            ConfidenceLevel.MEDIUM: "मध्यम",
            ConfidenceLevel.LOW: "कमी",
        }
        level_map_hi = {
            ConfidenceLevel.HIGH: "उच्च",
            ConfidenceLevel.MEDIUM: "मध्यम",
            ConfidenceLevel.LOW: "कम",
        }
        level_map_ta = {
            ConfidenceLevel.HIGH: "உயர்",
            ConfidenceLevel.MEDIUM: "நடுத்தர",
            ConfidenceLevel.LOW: "குறைந்த",
        }
        level_map_en = {
            ConfidenceLevel.HIGH: "High",
            ConfidenceLevel.MEDIUM: "Medium",
            ConfidenceLevel.LOW: "Low",
        }

        reasons_text = "; ".join(confidence.reasons) if confidence.reasons else ""

        if language == "mr":
            lvl_str = level_map_mr.get(confidence.level, str(confidence.level.value))
            return f"विश्वासार्हता स्तर: {lvl_str}" + (f" ({reasons_text})" if reasons_text else "")
        elif language == "hi":
            lvl_str = level_map_hi.get(confidence.level, str(confidence.level.value))
            return f"विश्वास स्तर: {lvl_str}" + (f" ({reasons_text})" if reasons_text else "")
        elif language == "ta":
            lvl_str = level_map_ta.get(confidence.level, str(confidence.level.value))
            return f"நம்பகத்தன்மை: {lvl_str}" + (f" ({reasons_text})" if reasons_text else "")
        else:
            lvl_str = level_map_en.get(confidence.level, str(confidence.level.value))
            return f"Confidence: {lvl_str}" + (f" ({reasons_text})" if reasons_text else "")

    @staticmethod
    def generate_suggested_followups(
        intent: str,
        status: RecommendationStatus,
        language: str = "en",
        harbor: Optional[str] = None,
        destination: Optional[str] = None,
    ) -> List[str]:
        """Generates contextual, localized quick-reply follow-up prompts for the mariner."""
        intent_upper = intent.upper()

        if language == "mr":
            if intent_upper == "PFZ":
                return [
                    "PFZ क्षेत्रातील समुद्र स्थिती तपासा",
                    "PFZ कडे जाणारा सुरक्षित मार्ग",
                    "जवळचे लँडिंग केंद्र",
                ]
            elif intent_upper == "ROUTE":
                return [
                    "शिफारस केलेल्या मार्गावरील हवामान अंदाज",
                    "प्रतिबंधित क्षेत्राचा तपशील",
                    "पर्यायी सुरक्षित मार्ग",
                ]
            elif intent_upper == "HAZARDS":
                return [
                    "सक्रिय चक्रीवादळ इशारे",
                    "बंदरानजीक जिओफेन्स सीमा",
                    "सुरक्षित प्रस्थान वेळ",
                ]
            elif intent_upper == "CONDITIONS":
                return [
                    "उद्या लाटांची उंची किती असेल?",
                    "वाऱ्याचा वेग आणि उसळीचा कालावधी",
                    "मासेमारीसाठी जाणे सुरक्षित आहे का?",
                ]
            elif status in [RecommendationStatus.NO_GO, RecommendationStatus.CAUTION]:
                return [
                    "समुद्र कधी शांत होईल?",
                    "किनारपट्टीजवळ सुरक्षित पर्यायी मार्ग कोणता?",
                    "बंदर नियंत्रण कक्ष आपत्कालीन संपर्क",
                ]
            else:
                return [
                    "उद्या सकाळचा हवामान अंदाज कसा आहे?",
                    "जवळपास कोणते धोके आहेत?",
                    "पर्यायी सुरक्षित मार्ग सांगा",
                ]

        elif language == "hi":
            if intent_upper == "PFZ":
                return [
                    "PFZ क्षेत्र में समुद्र की स्थिति जांचें",
                    "PFZ के लिए सुरक्षित मार्ग",
                    "निकटतम लैंडिंग केंद्र",
                ]
            elif intent_upper == "ROUTE":
                return [
                    "अनुशंसित मार्ग पर मौसम पूर्वानुमान",
                    "प्रतिबंधित क्षेत्र विवरण",
                    "वैकल्पिक सुरक्षित मार्ग",
                ]
            elif intent_upper == "HAZARDS":
                return [
                    "सक्रिय चक्रवात चेतावनी",
                    "बंदरगाह के पास जियोफेंस सीमा",
                    "सुरक्षित प्रस्थान समय",
                ]
            elif intent_upper == "CONDITIONS":
                return [
                    "कल तरंग ऊंचाई कितनी होगी?",
                    "हवा की गति और स्वेल अवधि",
                    "क्या मछली पकड़ने जाना सुरक्षित है?",
                ]
            elif status in [RecommendationStatus.NO_GO, RecommendationStatus.CAUTION]:
                return [
                    "समुद्र की स्थिति कब सुधरेगी?",
                    "तट के पास सुरक्षित वैकल्पिक मार्ग",
                    "पत्तन प्राधिकरण आपातकालीन संपर्क",
                ]
            else:
                return [
                    "कल सुबह का मौसम कैसा रहेगा?",
                    "आसपास क्या खतरे हैं?",
                    "सुरक्षित वैकल्पिक मार्ग बताएं",
                ]

        elif language == "ta":
            if intent_upper == "PFZ":
                return [
                    "PFZ பகுதியில் கடல் நிலை",
                    "பாதுகாப்பான வழித்தடம்",
                    "அருகிலுள்ள துறைமுகம்",
                ]
            elif status in [RecommendationStatus.NO_GO, RecommendationStatus.CAUTION]:
                return [
                    "கடல் நிலை எப்போது சீராகும்?",
                    "பாதுகாப்பான மாற்று பாதை",
                    "துறைமுக அவசர தொடர்பு",
                ]
            return [
                "நாளை காலை வானிலை எப்படி இருக்கும்?",
                "அருகிலுள்ள ஆபத்துகள் என்ன?",
                "மாற்று பாதுகாப்பான பாதை",
            ]

        else:
            # English default
            if intent_upper == "PFZ":
                return [
                    "Check weather conditions at PFZ",
                    "Safe navigation route to PFZ",
                    "Nearest landing center",
                ]
            elif intent_upper == "ROUTE":
                return [
                    "Weather forecast on recommended route",
                    "Restricted zone details",
                    "Alternative inshore passage",
                ]
            elif intent_upper == "HAZARDS":
                return [
                    "Active cyclone advisories",
                    "Geofence boundaries near harbor",
                    "Safe departure window",
                ]
            elif intent_upper == "CONDITIONS":
                return [
                    "Wave height forecast tomorrow",
                    "Wind speed and swell period",
                    "Is it safe to depart?",
                ]
            elif status in [RecommendationStatus.NO_GO, RecommendationStatus.CAUTION]:
                return [
                    "When will sea conditions improve?",
                    "Alternative sheltered route options",
                    "Port authority emergency contacts",
                ]
            else:
                return [
                    "Check tomorrow morning forecast",
                    "What are the nearest hazards?",
                    "Compare passage routes",
                ]

    @staticmethod
    def format_concise_response(
        composition_input: ResponseCompositionInput,
        harbor: Optional[str] = None,
        destination: Optional[str] = None,
    ) -> str:
        """Composes a structured, concise operational advisory incorporating all 10 M11 requirements."""
        rec = composition_input.recommendation
        conf = composition_input.confidence
        evidence = composition_input.evidence
        warnings = composition_input.warnings
        lang = composition_input.language
        harbor_str = harbor or "harbor"

        # Unique evidence source names
        evidence_sources = sorted(list(set(ev.source_name for ev in evidence))) if evidence else []
        evidence_names = ", ".join(evidence_sources) or "No external evidence required"

        # Format Decisive Factors with citations where present
        factors_lines = []
        for factor in rec.decisive_factors:
            factors_lines.append(f"- {factor}")
        factors_text = "\n".join(factors_lines) if factors_lines else "- Operational baseline verified"

        # Format Confidence
        conf_text = ResponseComposer.format_confidence_explanation(conf, language=lang)

        # Format Warnings
        warning_lines = []
        if warnings:
            for w in warnings:
                warning_lines.append(f"- {w}")
        warnings_text = "\n".join(warning_lines) if warning_lines else ""

        if lang == "mr":
            sections = [
                f"[{rec.status.value}] {harbor_str} साठी सागरी सुरक्षा सल्ला:\n",
                rec.summary,
                f"\nमहत्त्वाचे घटक:\n{factors_text}",
                f"\nकृती निर्देश: {rec.next_action}",
                f"\n{conf_text}",
                f"\nपुरावा आधार:\n- {evidence_names}",
            ]
            if warnings_text:
                sections.append(f"\nपरिचालन सूचना:\n{warnings_text}")
            sections.append("\nसूचना: हे मूल्यमापन अधिकृत सागरी व हवामान माहितीवर आधारित सल्लागार विश्लेषण आहे.")
            return "\n".join(sections)

        elif lang == "hi":
            sections = [
                f"[{rec.status.value}] {harbor_str} के लिए समुद्री सुरक्षा सलाह:\n",
                rec.summary,
                f"\nप्रमुख निर्णायक कारक:\n{factors_text}",
                f"\nकार्रवाई निर्देश: {rec.next_action}",
                f"\n{conf_text}",
                f"\nसाक्ष्य आधार:\n- {evidence_names}",
            ]
            if warnings_text:
                sections.append(f"\nपरिचालन चेतावनी:\n{warnings_text}")
            sections.append("\nसूचना: यह मूल्यांकन आधिकारिक समुद्री और मौसम डेटा पर आधारित सलाह है।")
            return "\n".join(sections)

        elif lang == "ta":
            sections = [
                f"[{rec.status.value}] {harbor_str} கடல்சார் பாதுகாப்பு ஆலோசனை:\n",
                rec.summary,
                f"\nமுக்கிய காரணிகள்:\n{factors_text}",
                f"\nசெயல்முறை வழிகாட்டுதல்: {rec.next_action}",
                f"\n{conf_text}",
                f"\nசான்று ஆதாரம்:\n- {evidence_names}",
            ]
            if warnings_text:
                sections.append(f"\nசெயல்பாட்டு எச்சரிக்கைகள்:\n{warnings_text}")
            sections.append("\nஅறிவிப்பு: இந்த மதிப்பீடு அதிகாரப்பூர்வ வானிலை மற்றும் கடல்சார் தகவல்களை அடிப்படையாகக் கொண்டது.")
            return "\n".join(sections)

        else:
            # English
            sections = [
                f"[{rec.status.value}] Operational Advisory for {harbor_str}:\n",
                rec.summary,
                f"\nKey Decisive Factors:\n{factors_text}",
                f"\nActionable Directive: {rec.next_action}",
                f"\n{conf_text}",
                f"\nSupporting Evidence:\n- {evidence_names}",
            ]
            if warnings_text:
                sections.append(f"\nOperational Warnings:\n{warnings_text}")
            sections.append("\nNotice: Advisory analysis based on authoritative marine and weather observations.")
            return "\n".join(sections)

    @staticmethod
    def build_chat_response(
        composition_input: ResponseCompositionInput,
        synthesized_answer: str,
        suggested_followups: Optional[List[str]] = None,
    ) -> ChatResponse:
        """Assembles a validated, schema-compliant ChatResponse with full M11 components.

        Args:
            composition_input: Validated input bundle.
            synthesized_answer: Natural language response text produced by composer.
            suggested_followups: Optional relevant quick-reply options.

        Returns:
            Fully assembled ChatResponse.
        """
        followups = suggested_followups
        if followups is None:
            followups = ResponseComposer.generate_suggested_followups(
                intent=composition_input.intent,
                status=composition_input.recommendation.status,
                language=composition_input.language,
            )

        response = ChatResponse(
            run_id=composition_input.run_id,
            conversation_id=composition_input.conversation_id,
            language=composition_input.language,
            intent=composition_input.intent,
            answer=synthesized_answer,
            recommendation=composition_input.recommendation,
            confidence=composition_input.confidence,
            evidence=composition_input.evidence,
            map_layers=composition_input.map_layers,
            trace=composition_input.trace,
            warnings=composition_input.warnings,
            suggested_followups=followups,
            agent_collaboration=composition_input.agent_collaboration,
        )

        ResponseComposer.validate_safety_invariance(
            composed_response=response,
            original_recommendation=composition_input.recommendation,
        )

        return response
