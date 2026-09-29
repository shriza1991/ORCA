"""Comprehensive Test Suite for ORCA Voice Chat Pipeline (STT -> ORCA -> TTS).

Tests:
1. Marathi voice query: test_marathi.wav -> Marathi STT -> ORCA -> Marathi response -> TTS
2. Hindi voice query: test_hindi.wav -> Hindi STT -> ORCA -> Hindi response -> TTS
3. English voice query: test_audio.wav -> English STT -> ORCA -> English response -> TTS
4. Multi-turn conversation continuity with dynamic language switching (Ratnagiri context retained)
5. Error handling: empty audio, STT unconfigured, TTS errors
6. In-memory marine dataset verification
"""

import os
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.domain.marine_dataset import (
    IN_MEMORY_MARINE_DATASET,
    get_hazard_record,
    get_marine_record,
    get_weather_record,
)
from backend.app.main import app
from backend.app.services.stt_service import normalize_stt_language_code
from backend.app.services.tts_service import (
    TTSConfigurationError,
    clean_text_for_speech,
    normalize_tts_language_code,
    synthesize_speech,
)

client = TestClient(app)

AUDIO_ROOT = Path(__file__).parent.parent
HAS_SARVAM_KEY = bool(settings.SARVAM_API_KEY or os.getenv("SARVAM_API_KEY"))


def test_in_memory_marine_dataset():
    """Verify in-memory dataset contains key coastal harbors with required fields."""
    assert "ratnagiri" in IN_MEMORY_MARINE_DATASET
    assert "mumbai" in IN_MEMORY_MARINE_DATASET
    assert "goa" in IN_MEMORY_MARINE_DATASET

    ratna = get_marine_record("Ratnagiri")
    assert ratna["harbor"] == "Ratnagiri"
    assert ratna["significant_wave_height_m"] == 1.2
    assert ratna["swell_period_sec"] == 8.0
    assert ratna["sea_condition"] == "Calm to Moderate"

    weather = get_weather_record("Ratnagiri")
    assert weather["wind_speed_knots"] == 12.0

    hazard = get_hazard_record("Ratnagiri")
    assert hazard["cyclone_warning_active"] is False


def test_tts_utilities():
    """Test text cleaning and language code normalization for TTS."""
    assert normalize_tts_language_code("mr") == "mr-IN"
    assert normalize_tts_language_code("hi") == "hi-IN"
    assert normalize_tts_language_code("en") == "en-IN"
    assert normalize_tts_language_code("unknown") == "en-IN"

    raw_text = "[GO] Operational Advisory for Ratnagiri:\n- Significant wave: 1.2m\n- Wind speed: 12kn"
    cleaned = clean_text_for_speech(raw_text)
    assert "[GO]" not in cleaned
    assert "GO." in cleaned or "GO" in cleaned
    assert "-" not in cleaned


def test_voice_chat_empty_audio():
    """Verify endpoint rejects empty audio file with 400 Bad Request."""
    response = client.post(
        "/api/v1/voice/chat",
        files={"file": ("empty.wav", b"", "audio/wav")},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "INVALID_AUDIO"


def test_voice_chat_stt_unconfigured():
    """Verify endpoint returns 503 when SARVAM_API_KEY is missing."""
    with patch("backend.app.services.stt_service.settings.SARVAM_API_KEY", ""):
        with patch.dict(os.environ, {"SARVAM_API_KEY": ""}):
            response = client.post(
                "/api/v1/voice/chat",
                files={"file": ("test.wav", b"fake-audio-bytes", "audio/wav")},
            )
            assert response.status_code == 503
            assert response.json()["error"] == "STT_UNCONFIGURED"


@pytest.mark.skipif(not HAS_SARVAM_KEY, reason="Requires SARVAM_API_KEY in environment or settings")
def test_voice_chat_marathi_flow():
    """Test Marathi audio fixture -> Marathi STT -> ORCA -> Marathi response -> TTS audio."""
    marathi_audio_path = AUDIO_ROOT / "test_marathi.wav"
    assert marathi_audio_path.exists(), f"Missing fixture: {marathi_audio_path}"

    with open(marathi_audio_path, "rb") as f:
        audio_bytes = f.read()

    response = client.post(
        "/api/v1/voice/chat",
        files={"file": ("test_marathi.wav", audio_bytes, "audio/wav")},
    )

    assert response.status_code == 200
    data = response.json()

    assert "रत्नागिरी" in data["transcript"]
    assert data["language"] == "mr"
    assert data["detected_language"] in ("mr-IN", "mr")
    assert data["recommendation"]["status"] in ("GO", "CAUTION", "NO_GO", "INFORMATIONAL")
    assert "रत्नागिरी" in data["answer"] or "सागरी" in data["answer"] or "सुरक्षा" in data["answer"]
    assert data["audio_base64"] is not None
    assert len(data["audio_base64"]) > 1000
    assert data["audio_format"] == "audio/wav"
    assert data["conversation_id"] is not None


@pytest.mark.skipif(not HAS_SARVAM_KEY, reason="Requires SARVAM_API_KEY in environment or settings")
def test_voice_chat_hindi_flow():
    """Test Hindi audio fixture -> Hindi STT -> ORCA -> Hindi response -> TTS audio."""
    hindi_audio_path = AUDIO_ROOT / "test_hindi.wav"
    assert hindi_audio_path.exists(), f"Missing fixture: {hindi_audio_path}"

    with open(hindi_audio_path, "rb") as f:
        audio_bytes = f.read()

    response = client.post(
        "/api/v1/voice/chat",
        files={"file": ("test_hindi.wav", audio_bytes, "audio/wav")},
    )

    assert response.status_code == 200
    data = response.json()

    assert "रत्नागिरी" in data["transcript"] or "मछली" in data["transcript"]
    assert data["language"] == "hi"
    assert data["recommendation"]["status"] in ("GO", "CAUTION", "NO_GO", "INFORMATIONAL")
    assert data["audio_base64"] is not None
    assert len(data["audio_base64"]) > 1000


@pytest.mark.skipif(not HAS_SARVAM_KEY, reason="Requires SARVAM_API_KEY in environment or settings")
def test_voice_chat_english_flow():
    """Test English audio fixture -> English STT -> ORCA -> English response -> TTS audio."""
    audio_path = AUDIO_ROOT / "test_audio.wav"
    assert audio_path.exists(), f"Missing fixture: {audio_path}"

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    response = client.post(
        "/api/v1/voice/chat",
        files={"file": ("test_audio.wav", audio_bytes, "audio/wav")},
    )

    assert response.status_code == 200
    data = response.json()

    assert "safe" in data["transcript"].lower() or "ratnagiri" in data["transcript"].lower()
    assert data["language"] == "en"
    assert data["recommendation"]["status"] in ("GO", "CAUTION", "NO_GO", "INFORMATIONAL")
    assert data["audio_base64"] is not None
    assert len(data["audio_base64"]) > 1000


@pytest.mark.skipif(not HAS_SARVAM_KEY, reason="Requires SARVAM_API_KEY in environment or settings")
def test_multi_turn_conversation_continuity_and_language_switching():
    """Test multi-turn conversation where language changes between turns but Ratnagiri context is retained.

    Turn 1 (Marathi voice audio): Sets up harbor='Ratnagiri' in Marathi
    Turn 2 (Hindi text query via chat or follow-up): Asks follow up in Hindi without naming harbor
    Turn 3 (English text query): Asks follow up in English
    """
    marathi_audio_path = AUDIO_ROOT / "test_marathi.wav"
    with open(marathi_audio_path, "rb") as f:
        audio_bytes = f.read()

    # Turn 1: Voice in Marathi
    t1_resp = client.post(
        "/api/v1/voice/chat",
        files={"file": ("test_marathi.wav", audio_bytes, "audio/wav")},
    )
    assert t1_resp.status_code == 200
    t1_data = t1_resp.json()
    conv_id = t1_data["conversation_id"]
    assert t1_data["language"] == "mr"

    # Turn 2: Follow-up query in Hindi on same conversation_id
    t2_resp = client.post(
        "/api/v1/chat",
        json={
            "conversation_id": conv_id,
            "message": "हवा की गति और समुद्र की लहरें कैसी हैं?",
            "user_context": {"language_preference": "hi"},
        },
    )
    assert t2_resp.status_code == 200
    t2_data = t2_resp.json()
    assert t2_data["conversation_id"] == conv_id
    assert t2_data["language"] == "hi"
    # Should retain Ratnagiri context from Turn 1
    assert "रत्नागिरी" in t2_data["answer"] or "Ratnagiri" in t2_data["answer"]

    # Turn 3: Follow-up query in English on same conversation_id
    t3_resp = client.post(
        "/api/v1/chat",
        json={
            "conversation_id": conv_id,
            "message": "What about the swell period?",
            "user_context": {"language_preference": "en"},
        },
    )
    assert t3_resp.status_code == 200
    t3_data = t3_resp.json()
    assert t3_data["conversation_id"] == conv_id
    assert t3_data["language"] == "en"
    assert "Ratnagiri" in t3_data["answer"] or "8" in t3_data["answer"] or "swell" in t3_data["answer"].lower()
