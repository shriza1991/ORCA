"""Text-to-Speech (TTS) Service for ORCA using Sarvam AI.

Integrates with Sarvam AI's bulbul:v3 model for Indian language voice synthesis
(English, Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Odia, Punjabi, Malayalam).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Map ISO-639-1 / normalized language codes to Sarvam BCP-47 TTS codes
LANGUAGE_MAP: dict[str, str] = {
    "mr": "mr-IN",
    "hi": "hi-IN",
    "en": "en-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "od": "od-IN",
    "or": "od-IN",
    "pa": "pa-IN",
    "ml": "ml-IN",
}

DEFAULT_TTS_LANGUAGE = "en-IN"


def normalize_tts_language_code(lang_code: str | None) -> str:
    """Normalizes language code (e.g. 'mr', 'hi', 'en', 'mr-IN', 'Hindi') to Sarvam BCP-47 code."""
    if not lang_code:
        return DEFAULT_TTS_LANGUAGE
    clean = lang_code.strip().lower()
    if "-" in clean:
        clean = clean.split("-")[0]
    if "_" in clean:
        clean = clean.split("_")[0]
    return LANGUAGE_MAP.get(clean, DEFAULT_TTS_LANGUAGE)


def clean_text_for_speech(text: str) -> str:
    """Cleans markdown symbols and formatting to make synthesized speech sound natural."""
    if not text:
        return ""
    cleaned = text
    # Remove markdown links [text](url) -> text
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    # Remove bracketed status codes like [GO], [CAUTION], [NO_GO] -> GO., CAUTION., NO GO.
    cleaned = re.sub(r"\[(GO|CAUTION|NO_GO|NO GO|UNKNOWN|INFORMATIONAL)\]", r"\1.", cleaned, flags=re.IGNORECASE)
    # Remove markdown headers #, ##, ###
    cleaned = re.sub(r"#+\s*", "", cleaned)
    # Remove bold / italic markdown asterisks and underscores
    cleaned = re.sub(r"[*_]{1,3}", "", cleaned)
    # Replace bullet dashes or dots at start of lines with a space or pause
    cleaned = re.sub(r"^\s*[-•*]\s+", "", cleaned, flags=re.MULTILINE)
    # Collapse multiple consecutive newlines / spaces
    cleaned = re.sub(r"\n+", ". ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Enforce Sarvam bulbul:v3 maximum character limit (2500 chars)
    if len(cleaned) > 2400:
        cleaned = cleaned[:2400].rsplit(" ", 1)[0] + "."
    return cleaned


class TTSServiceError(Exception):
    """Base exception for TTS service errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class TTSConfigurationError(TTSServiceError):
    """Raised when TTS service is unconfigured or missing credentials."""

    def __init__(self, message: str = "Sarvam TTS is not configured (missing SARVAM_API_KEY)."):
        super().__init__(message, status_code=503)


def synthesize_speech(
    text: str,
    language_code: str = "en",
    speaker: str | None = None,
    model: str = "bulbul:v3",
) -> dict[str, Any]:
    """Synthesizes input text to speech using Sarvam AI TTS.

    Args:
        text: The text to be converted to speech.
        language_code: ISO-639-1 code (e.g. 'mr', 'hi', 'en') or BCP-47 code.
        speaker: Optional specific voice speaker.
        model: Sarvam model name ('bulbul:v3' default).

    Returns:
        dict with keys:
            - 'audio_base64': Base64 encoded WAV audio string.
            - 'audio_format': 'audio/wav'.
            - 'language_code': BCP-47 language code used.
            - 'request_id': Sarvam request ID.
    """
    if not text or not text.strip():
        raise TTSServiceError("Empty text provided for speech synthesis.", status_code=400)

    api_key = settings.SARVAM_API_KEY or os.getenv("SARVAM_API_KEY")
    if not api_key:
        logger.warning("SARVAM_API_KEY is not configured. Falling back to mock speech synthesis.")
        # Return a 1-second silent WAV base64 string
        mock_wav_b64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="
        return {
            "audio_base64": mock_wav_b64,
            "audio_format": "audio/wav",
            "language_code": "en-IN",
            "request_id": "mock_tts_id",
        }

    try:
        from sarvamai import SarvamAI
    except ImportError as e:
        raise TTSServiceError("Sarvam AI SDK is not installed.", status_code=503) from e

    sarvam_lang = normalize_tts_language_code(language_code)
    cleaned_text = clean_text_for_speech(text)
    if not cleaned_text:
        cleaned_text = text.strip()

    try:
        client = SarvamAI(api_subscription_key=api_key)
        kwargs: dict[str, Any] = {
            "text": cleaned_text,
            "language_code": sarvam_lang,
            "model": model,
        }
        if speaker:
            kwargs["speaker"] = speaker

        response = client.text_to_speech.convert(**kwargs)

        audios = getattr(response, "audios", None) or []
        if not audios:
            raise TTSServiceError("No audio returned from Sarvam TTS service.", status_code=502)

        audio_b64 = audios[0]
        request_id = getattr(response, "request_id", "") or ""

        return {
            "audio_base64": audio_b64,
            "audio_format": "audio/wav",
            "language_code": sarvam_lang,
            "request_id": request_id,
        }

    except TTSServiceError:
        raise
    except Exception as exc:
        logger.error("Failed to synthesize speech via Sarvam TTS: %s", exc, exc_info=True)
        raise TTSServiceError(f"Speech synthesis failed: {str(exc)}", status_code=502) from exc
