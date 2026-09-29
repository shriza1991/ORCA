"""Comprehensive Test Suite for Real Groq/LLM Integration & Safety Architecture in ORCA.

Validates:
1. Groq provider initialization, API key handling, and configuration fallback.
2. Robust JSON structured generation parsing (raw JSON, markdown-fenced ```json, and malformed rejection).
3. Real user natural-language query reaching IntentExtraction and ResponseComposer nodes.
4. Deterministic tools and risk engine remaining the sole operational source of truth.
5. Inviolable safety status preservation (LLM cannot override or soften GO/CAUTION/NO_GO).
6. Evidence grounding and hallucinated citation redaction.
7. Graceful offline fallback on missing key, timeout, or provider exception.
8. Multilingual response generation and multi-turn context retention.
"""

import json
import pytest
from pydantic import BaseModel, Field

from backend.app.agents.graph import run_orca_graph
from backend.app.agents.intent import (
    ExtractedEntities,
    IntentCategory,
    IntentExtractionResult,
    LLMResponseDraft,
)
from backend.app.agents.llm import (
    FakeLLMProvider,
    GroqLLMProvider,
    LLMMessage,
    MessageRole,
    extract_and_parse_json,
    get_llm_provider,
)
from backend.app.agents.security import PromptInjectionGuard
from backend.app.contracts.chat import (
    ConfidenceLevel,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
)
from backend.app.core.config import settings


class SampleSchema(BaseModel):
    title: str = Field(..., description="Title field")
    score: float = Field(0.0, description="Numerical score")
    active: bool = Field(False, description="Status flag")


# =============================================================================
# 1. Provider Initialization & Configuration Tests
# =============================================================================

def test_groq_provider_initialization():
    """Verify GroqLLMProvider instantiates with expected defaults and properties."""
    provider = GroqLLMProvider(
        api_key="gsk_test_mock_key_12345",
        base_url="https://api.groq.com/openai/v1",
        timeout_seconds=20.0,
    )
    assert provider.provider_name == "groq"
    assert provider.model_name == "qwen/qwen3.8-27b"
    assert provider.api_key == "gsk_test_mock_key_12345"
    assert provider.default_timeout == 20.0


def test_get_llm_provider_groq_missing_key(monkeypatch):
    """Verify get_llm_provider returns None when Groq key is missing or placeholder."""
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_API_KEY", "")

    provider = get_llm_provider()
    assert provider is None, "Should cleanly return None without raising an exception"

    monkeypatch.setattr(settings, "GROQ_API_KEY", "your_groq_api_key_here")
    provider = get_llm_provider()
    assert provider is None, "Placeholder keys must trigger deterministic fallback"


def test_get_llm_provider_groq_configured(monkeypatch):
    """Verify get_llm_provider initializes GroqLLMProvider when key is supplied."""
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_actual_mock_key_abc123")
    monkeypatch.setattr(settings, "LLM_MODEL", "qwen/qwen3.8-27b")

    provider = get_llm_provider()
    assert provider is not None
    assert isinstance(provider, GroqLLMProvider)
    assert provider.provider_name == "groq"
    assert provider.model_name == "qwen/qwen3.8-27b"


def test_get_llm_provider_invalid_choice():
    """Verify unrecognized providers fall back to deterministic mode (None)."""
    assert get_llm_provider("unknown_vendor_xyz") is None
    assert get_llm_provider("deterministic") is None
    assert get_llm_provider("none") is None


# =============================================================================
# 2. Defensive JSON Extraction & Parsing Tests
# =============================================================================

def test_extract_and_parse_json_raw():
    """Verify clean raw JSON parses correctly."""
    raw = '{"title": "Test Title", "score": 9.5, "active": true}'
    result = extract_and_parse_json(raw, SampleSchema)
    assert result.title == "Test Title"
    assert result.score == 9.5
    assert result.active is True


def test_extract_and_parse_json_markdown_fenced():
    """Verify markdown-fenced JSON (```json ... ```) parses properly."""
    raw = """```json
{
  "title": "Fenced Title",
  "score": 4.2,
  "active": false
}
```"""
    result = extract_and_parse_json(raw, SampleSchema)
    assert result.title == "Fenced Title"
    assert result.score == 4.2
    assert result.active is False


def test_extract_and_parse_json_with_conversational_preamble():
    """Verify JSON with preamble and closing text is extracted from braces."""
    raw = """Here is your requested output:
{"title": "Preamble Title", "score": 7.1, "active": true}
Hope this helps!"""
    result = extract_and_parse_json(raw, SampleSchema)
    assert result.title == "Preamble Title"
    assert result.score == 7.1


def test_extract_and_parse_json_malformed_rejected():
    """Verify malformed or invalid schemas raise ValueError/ValidationError."""
    with pytest.raises(Exception):
        extract_and_parse_json("Not a JSON object at all", SampleSchema)

    with pytest.raises(Exception):
        extract_and_parse_json('{"score": "not-a-float-and-missing-title"}', SampleSchema)


# =============================================================================
# 3. User Query Reaches Intent & Response Nodes
# =============================================================================

def test_user_query_reaches_intent_and_response_llm():
    """Verify the mariner's natural language query is passed to both Intent and Response LLMs."""
    recorded_messages = []

    def mock_handler(messages):
        for m in messages:
            recorded_messages.append(m.content)
        # Check if intent schema or response draft schema is requested
        return {
            "intent": "SAFETY",
            "confidence": 0.95,
            "detected_language": "en",
            "entities": {"origin_harbor": "Ratnagiri", "craft_type": "motorized_boat"},
            "synthesized_text": "[CAUTION] Conditions at Ratnagiri require caution due to 2.1m waves.",
            "key_factors_cited": ["Wave height 2.1m"],
            "language": "en",
        }

    test_llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": mock_handler,
            "LLMResponseDraft": mock_handler,
        }
    )

    query = "Can my 8m motorized boat safely leave Ratnagiri tomorrow at 5 AM?"
    final_state = run_orca_graph(
        user_message=query,
        tool_mode="contract_mock",
        llm_provider=test_llm,
    )

    # 1. Verify user query reached intent prompt
    user_query_found_in_intent = any(query in content for content in recorded_messages)
    assert user_query_found_in_intent, "User query must reach the Intent LLM"

    # 2. Verify user query reached response composer inside <user_query>
    user_query_in_composer = any("<user_query>" in content and query in content for content in recorded_messages)
    assert user_query_in_composer, "User query must be present inside <user_query> in Response Composer"

    # 3. Verify response was generated with status preserved
    assert "[CAUTION]" in final_state["response"]


# =============================================================================
# 4. Deterministic Tools & Inviolable Safety Status Preservation
# =============================================================================

def test_deterministic_tools_remain_authoritative():
    """Verify that domain calculations are computed deterministically regardless of LLM."""
    query = "Check departure safety from Ratnagiri"
    final_state = run_orca_graph(
        user_message=query,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert "risk_assessment" in final_state
    rec = final_state["risk_assessment"]
    assert isinstance(rec, Recommendation)
    assert rec.status in (RecommendationStatus.GO, RecommendationStatus.CAUTION, RecommendationStatus.NO_GO)
    assert len(final_state["evidence"]) > 0
    assert len(final_state["map_layers"]) > 0


def test_llm_cannot_override_no_go_safety_status():
    """Verify that if an LLM tries to tamper with NO_GO into GO, it is blocked."""
    # Deterministic risk engine returns CAUTION or NO_GO for high waves
    tampering_llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": {
                "intent": "SAFETY",
                "confidence": 0.95,
                "detected_language": "en",
                "entities": {"origin_harbor": "Ratnagiri"},
            },
            "LLMResponseDraft": {
                # LLM attempts to claim GO and say it is completely safe despite NO_GO
                "synthesized_text": "[GO] Don't worry, the sea is completely calm and safe to depart!",
                "key_factors_cited": [],
                "language": "en",
            },
        }
    )

    final_state = run_orca_graph(
        user_message="Is it safe to go out in the storm?",
        tool_mode="contract_mock",
        llm_provider=tampering_llm,
    )

    # The deterministic status is CAUTION/NO_GO
    authoritative_status = final_state["risk_assessment"].status.value
    # Verification: response must NOT contain the fraudulent [GO] claim
    assert "[GO] Don't worry" not in final_state["response"]
    # Trace should record safety tampering detection
    actions = [t.action for t in final_state["trace"]]
    assert any("Safety tampering detected" in a or "falling back to deterministic" in a for a in actions)


# =============================================================================
# 5. Evidence Grounding & Citation Validation
# =============================================================================

def test_hallucinated_evidence_id_is_redacted():
    """Verify that citation tags not present in evidence registry ([EV-FAKE-999]) are redacted."""
    hallucinating_llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": {
                "intent": "SAFETY",
                "confidence": 0.9,
                "detected_language": "en",
                "entities": {"origin_harbor": "Ratnagiri"},
            },
            "LLMResponseDraft": {
                "synthesized_text": "[CAUTION] Wave height is elevated as shown in [EV-FAKE-999].",
                "key_factors_cited": [],
                "language": "en",
            },
        }
    )

    final_state = run_orca_graph(
        user_message="Safety check Ratnagiri",
        tool_mode="contract_mock",
        llm_provider=hallucinating_llm,
    )

    # [EV-FAKE-999] must NOT appear in the final response
    assert "[EV-FAKE-999]" not in final_state["response"]


# =============================================================================
# 6. Graceful Fallback Behavior (Timeout, Network Error, Missing Key)
# =============================================================================

def test_graceful_fallback_on_llm_timeout():
    """Verify that LLM timeout degrades gracefully to deterministic template with zero crash."""
    timeout_llm = FakeLLMProvider(simulate_timeout=True)

    final_state = run_orca_graph(
        user_message="Is it safe to sail from Ratnagiri?",
        tool_mode="contract_mock",
        llm_provider=timeout_llm,
    )

    assert final_state["response"] is not None
    assert len(final_state["response"]) > 20
    # Trace records degraded fallback
    actions = [t.action for t in final_state["trace"]]
    assert any("fallback triggered" in a for a in actions)


def test_graceful_fallback_on_llm_provider_exception():
    """Verify that an unexpected LLM network crash falls back cleanly."""
    failing_llm = FakeLLMProvider(simulate_failure=True)

    final_state = run_orca_graph(
        user_message="Find nearest PFZ from Ratnagiri",
        tool_mode="contract_mock",
        llm_provider=failing_llm,
    )

    assert final_state["response"] is not None
    assert "PFZ" in final_state["intent"] or final_state["intent"] == "PFZ"


# =============================================================================
# 7. Multilingual Support
# =============================================================================

def test_multilingual_hindi_understanding_and_response():
    """Verify query in Hindi triggers Hindi understanding and response synthesis."""
    hindi_llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": {
                "intent": "SAFETY",
                "confidence": 0.98,
                "detected_language": "hi",
                "entities": {"origin_harbor": "रत्नागिरी"},
            },
            "LLMResponseDraft": {
                "synthesized_text": "[CAUTION] रत्नागिरी से प्रस्थान करते समय सावधानी बरतें।",
                "key_factors_cited": ["लाटंची उंची"],
                "language": "hi",
            },
        }
    )

    final_state = run_orca_graph(
        user_message="क्या कल सुबह रत्नागिरी से निकलना सुरक्षित है?",
        tool_mode="contract_mock",
        llm_provider=hindi_llm,
    )

    assert final_state["language"] == "hi"
    assert "रत्नागिरी" in final_state["response"]


# =============================================================================
# 8. Analytical Explanation & Memory Seeding Fix Verification
# =============================================================================

def test_analytical_explanation_capability_routing_provider_mode():
    """Verify ANALYTICAL_EXPLANATION routes to real deterministic tools in provider mode."""
    llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": {
                "intent": "ANALYTICAL_EXPLANATION",
                "confidence": 0.95,
                "detected_language": "en",
                "entities": {"origin_harbor": "Ratnagiri"},
            },
            "LLMResponseDraft": {
                "synthesized_text": "Here is an explanation of the current situation in Ratnagiri: conditions are favorable.",
                "key_factors_cited": [],
                "language": "en",
            },
        }
    )

    final_state = run_orca_graph(
        user_message="Explain the current situation around Ratnagiri in simple language.",
        tool_mode="provider",
        llm_provider=llm,
    )

    # Must NOT fail with capability_error
    assert final_state.get("capability_error") is None, (
        f"ANALYTICAL_EXPLANATION should not fail with capability_error, got: {final_state.get('capability_error')}"
    )

    # Verify deterministic tools were scheduled and executed
    task_plan = final_state.get("task_plan", [])
    assert "marine_conditions" in task_plan
    assert "weather_conditions" in task_plan
    assert "risk_evaluation" in task_plan

    # Verify recommendation was computed and answer is populated
    rec = final_state.get("risk_assessment")
    assert rec is not None
    assert rec.status is not None
    assert final_state["response"] is not None
    assert "Ratnagiri" in final_state["response"] or "explanation" in final_state["response"].lower()


def test_run_repository_thread_context_initialization():
    """Verify RunRepository.create seeds valid ThreadContext without validation errors."""
    import uuid
    from backend.app.agents.memory import ThreadContext, memory_manager
    from backend.app.db.models import ConversationThread
    from backend.app.db.repositories import RunRepository
    from backend.app.db.session import SessionLocal

    test_thread_id = f"test-thread-{uuid.uuid4().hex[:8]}"

    try:
        from backend.app.db.session import engine
        with engine.connect():
            pass
    except Exception:
        pytest.skip("PostgreSQL/PostGIS server is unavailable. Skipping DB integration test.")

    with SessionLocal() as session:
        repo = RunRepository(session)
        run = repo.create(thread_id=test_thread_id)

        # Inspect ConversationThread in DB
        db_thread = session.query(ConversationThread).filter_by(thread_id=test_thread_id).first()
        assert db_thread is not None
        assert db_thread.context_json is not None
        assert db_thread.context_json.get("thread_id") == test_thread_id

    # Load context via memory manager to verify no validation error
    ctx = memory_manager.load_context(test_thread_id)
    assert isinstance(ctx, ThreadContext)
    assert ctx.thread_id == test_thread_id

