"""Speech-to-Text (STT) Service for SAMUDRA using Sarvam AI.

Integrates with Sarvam AI's saaras:v4 STT model for Indian language
voice recognition (English, Hindi, Marathi, etc.).
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Any

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def normalize_stt_language_code(lang_code: str | None) -> str:
    """Normalizes STT language codes like 'mr-IN', 'hi-IN', 'en-IN' to ISO-639-1 ('mr', 'hi', 'en')."""
    if not lang_code:
        return "en"
    clean = lang_code.strip().lower()
    if "-" in clean:
        clean = clean.split("-")[0]
    if "_" in clean:
        clean = clean.split("_")[0]
    if clean in ("mr", "marathi"):
        return "mr"
    if clean in ("hi", "hindi"):
        return "hi"
    if clean in ("en", "english"):
        return "en"
    if clean in ("ta", "tamil"):
        return "ta"
    if clean in ("te", "telugu"):
        return "te"
    if clean in ("kn", "kannada"):
        return "kn"
    if clean in ("bn", "bengali", "bangla"):
        return "bn"
    if clean in ("gu", "gujarati"):
        return "gu"
    if clean in ("or", "odia", "oriya"):
        return "or"
    return clean


class STTServiceError(Exception):
    """Base exception for STT errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class STTConfigurationError(STTServiceError):
    """Raised when STT service is unconfigured or missing credentials."""

    def __init__(self, message: str = "Sarvam STT is not configured (missing SARVAM_API_KEY)."):
        super().__init__(message, status_code=503)


def transcribe_audio_bytes(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    content_type: str | None = None,
) -> dict[str, str]:
    """Transcribes raw audio bytes using Sarvam AI saaras:v4 model.

    Returns:
        dict with keys 'transcript', 'language', 'normalized_language'.
    """
    if not audio_bytes or len(audio_bytes) == 0:
        raise STTServiceError("Empty audio file provided.", status_code=400)

    api_key = settings.SARVAM_API_KEY or os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise STTConfigurationError("SARVAM_API_KEY is not configured on the server.")

    try:
        from sarvamai import SarvamAI
    except ImportError as e:
        raise STTServiceError("Sarvam AI SDK is not installed.", status_code=503) from e

    suffix = os.path.splitext(filename)[1] if "." in filename else ".wav"
    if not suffix:
        suffix = ".wav"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        client = SarvamAI(api_subscription_key=api_key)
        with open(tmp_path, "rb") as f:
            response = client.speech_to_text.transcribe(
                file=f,
                model="saaras:v4",
                language_code="unknown",
            )

        raw_lang = getattr(response, "language_code", "unknown") or "unknown"
        transcript = getattr(response, "transcript", "") or ""
        transcript = transcript.strip()
        normalized_lang = normalize_stt_language_code(raw_lang)

        return {
            "transcript": transcript,
            "language": raw_lang,
            "normalized_language": normalized_lang,
        }

    except STTServiceError:
        raise
    except Exception as exc:
        logger.error("Failed to transcribe audio via Sarvam STT: %s", exc, exc_info=True)
        raise STTServiceError(f"Transcription failed: {str(exc)}", status_code=502) from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
