"""Intent Taxonomy and Cognitive Extraction Schemas for SAMUDRA / ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Defines the controlled intent taxonomy, extraction models, and semantic mappings
for user marine queries.
"""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class IntentCategory(str, Enum):
    """Controlled intent categories supported by SAMUDRA.

    Strictly partitions marine queries into specialist processing domains.
    """

    PFZ = "PFZ"
    """Queries regarding Potential Fishing Zones, chlorophyll-a fronts,
    sea surface temperature boundaries, and fish school aggregation areas.
    Example: 'Where is the nearest potential fishing zone from Ratnagiri?'
    """

    SAFETY = "SAFETY"
    """Queries evaluating voyage safety, departure go/no-go decisions, and
    sea-state advisories against vessel craft limits.
    Example: 'Is it safe to leave tomorrow morning at 6 AM?'
    """

    CONDITIONS = "CONDITIONS"
    """Direct inquiries regarding oceanographic & atmospheric parameters:
    wave height, swell period, wind speed/direction, ocean surface currents.
    Example: 'What are the wave conditions tomorrow around Mumbai High?'
    """

    HAZARDS = "HAZARDS"
    """Warnings regarding severe events (cyclones, depressions, squalls, lightning)
    or geospatial hazards (naval firing zones, Marine Protected Areas, IMBL boundaries).
    Example: 'Are there any cyclone or lightning warnings along the Konkan coast?'
    """

    ROUTE = "ROUTE"
    """Safe maritime passage planning, comparative route evaluation, waypoint risk
    analysis, and alternative channel suggestions.
    Example: 'Which route is safer from Veraval to the outer banks?'
    """

    ANALYTICAL_EXPLANATION = "ANALYTICAL_EXPLANATION"
    """Deep-dive explanatory queries asking *why* a particular recommendation,
    threshold violation, or risk status was triggered.
    Example: 'Why is Route B flagged as CAUTION despite lower wind?'
    """

    WHY = "ANALYTICAL_EXPLANATION"
    """Canonical alias for explanatory 'Why?' queries grounded in deterministic causal evidence."""

    WHAT_IF = "WHAT_IF"
    """Counterfactual scenario simulation (e.g. 'What if I leave at 11?', 'What if craft is mechanized trawler?')."""

    WHAT_CHANGED = "WHAT_CHANGED"
    """Decision delta queries comparing simulated or alternative plan against baseline."""

    ALTERNATIVE = "ALTERNATIVE"
    """Queries requesting safe alternative departure times, return deadlines, or navigation corridors."""

    ALERT_IMPACT = "ALERT_IMPACT"
    """Queries asking how active bulletins or newly issued hazard alerts impact an ongoing/planned trip."""

    UNSUPPORTED = "UNSUPPORTED"
    """Out-of-domain, non-marine, or irrelevant queries outside SAMUDRA's purview.
    Example: 'What is the stock price of Tata Motors?' or 'Write a poem about fish.'
    """


# Mapping canonical aliases from earlier workflow drafts to IntentCategory
INTENT_ALIAS_MAP: Dict[str, IntentCategory] = {
    "NEAREST_PFZ": IntentCategory.PFZ,
    "PFZ": IntentCategory.PFZ,
    "GO_NO_GO_SAFETY": IntentCategory.SAFETY,
    "SAFETY": IntentCategory.SAFETY,
    "CONDITIONS": IntentCategory.CONDITIONS,
    "MARINE_CONDITIONS": IntentCategory.CONDITIONS,
    "HAZARDS": IntentCategory.HAZARDS,
    "HAZARD_BOUNDARY": IntentCategory.HAZARDS,
    "ROUTE": IntentCategory.ROUTE,
    "SAFER_ROUTE": IntentCategory.ROUTE,
    "ANALYTICAL_EXPLANATION": IntentCategory.ANALYTICAL_EXPLANATION,
    "EXPLANATION": IntentCategory.ANALYTICAL_EXPLANATION,
    "WHY": IntentCategory.ANALYTICAL_EXPLANATION,
    "WHAT_IF": IntentCategory.WHAT_IF,
    "SIMULATION": IntentCategory.WHAT_IF,
    "WHAT_CHANGED": IntentCategory.WHAT_CHANGED,
    "DECISION_DELTA": IntentCategory.WHAT_CHANGED,
    "ALTERNATIVE": IntentCategory.ALTERNATIVE,
    "SAFER_ALTERNATIVE": IntentCategory.ALTERNATIVE,
    "ALERT_IMPACT": IntentCategory.ALERT_IMPACT,
    "GENERAL_INFORMATIONAL": IntentCategory.CONDITIONS,
    "INFORMATIONAL": IntentCategory.CONDITIONS,
    "UNSUPPORTED": IntentCategory.UNSUPPORTED,
}


def normalize_intent(intent_str: str) -> IntentCategory:
    """Normalizes an intent string or legacy alias into a canonical IntentCategory."""
    cleaned = intent_str.strip().upper()
    return INTENT_ALIAS_MAP.get(cleaned, IntentCategory.UNSUPPORTED)


class ExtractedEntities(BaseModel):
    """Structured operational entities extracted from the natural language query."""

    origin_harbor: Optional[str] = Field(
        None, description="Extracted coastal departure harbor or landing center"
    )
    coordinates: Optional[List[float]] = Field(
        None, description="Extracted [longitude, latitude] pair if specified"
    )
    departure_time: Optional[str] = Field(
        None, description="Temporal departure reference (ISO-8601 or relative offset)"
    )
    duration_hours: Optional[float] = Field(
        None, description="Expected voyage duration in hours"
    )
    craft_type: Optional[str] = Field(
        None,
        description="Craft class: traditional_non_motorized | motorized_boat | mechanized_trawler",
    )
    target_destination: Optional[str] = Field(
        None, description="Target destination, waypoint, or fishing ground"
    )


class IntentExtractionResult(BaseModel):
    """Normalized output contract of the Intent / Locale cognitive node."""

    intent: IntentCategory = Field(
        ..., description="Classified canonical intent category"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence score of classification (0.0 - 1.0)"
    )
    detected_language: str = Field(
        "en", description="Detected query language code (e.g., 'en', 'hi', 'mr', 'ta')"
    )
    entities: ExtractedEntities = Field(
        default_factory=ExtractedEntities,
        description="Extracted spatio-temporal and vessel entities",
    )
    missing_critical_fields: List[str] = Field(
        default_factory=list,
        description="List of fields required for the intent that could not be resolved",
    )
    clarification_needed: bool = Field(
        False, description="True if critical fields are absent and clarification is required"
    )
    clarification_prompt: Optional[str] = Field(
        None, description="Proposed localized prompt to ask mariner for missing information"
    )


# =============================================================================
# M3 Structured Cognitive Schemas (Strictly No Chain-of-Thought)
# =============================================================================

class LLMTaskPlanProposal(BaseModel):
    """Structured proposal generated by LLM for the Supervisor / Planner node.

    Strictly forbids internal chain-of-thought or private scratchpads.
    """

    requested_capabilities: List[str] = Field(
        default_factory=list,
        description="List of capability names proposed by LLM (e.g. ['marine_conditions', 'risk_evaluation'])",
    )
    planning_rationale: Optional[str] = Field(
        None,
        description="Concise 1-sentence selection rationale for audit trace (NO chain-of-thought, NO scratchpad)",
    )


class LLMClarificationProposal(BaseModel):
    """Structured proposal generated by LLM for conversational parameter clarification."""

    clarification_prompt: str = Field(
        ...,
        description="Polite, concise localized question in user's language requesting missing parameters",
    )
    missing_fields: List[str] = Field(
        default_factory=list,
        description="Identified missing required fields (e.g. ['origin_harbor'])",
    )
    suggested_chips: List[str] = Field(
        default_factory=list,
        description="Optional clickable quick-reply chips for mariner UI",
    )


class LLMResponseDraft(BaseModel):
    """Structured response draft synthesized by LLM Response Composer."""

    synthesized_text: str = Field(
        ...,
        description="Localized natural-language answer grounded in verified evidence",
    )
    key_factors_cited: List[str] = Field(
        default_factory=list,
        description="Summary of decisive factors incorporated in the answer",
    )
    language: str = Field(
        "en",
        description="Language code used for the response",
    )
