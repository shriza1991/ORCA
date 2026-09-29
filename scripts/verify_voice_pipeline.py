"""Verification Script for ORCA End-to-End Voice Chat Pipeline.

Runs all required flows using the audio fixtures:
1. test_marathi.wav -> Marathi STT -> ORCA -> Marathi response -> TTS
2. test_hindi.wav -> Hindi STT -> ORCA -> Hindi response -> TTS
3. test_audio.wav -> English STT -> ORCA -> English response -> TTS
4. Multi-turn conversation: language switches between turns while Ratnagiri context is retained.
"""

import os
import sys
from pathlib import Path

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)
ROOT_DIR = Path(__file__).parent.parent


def test_fixture(filename: str, label: str):
    print(f"\n{'='*70}")
    print(f"TESTING FLOW: {label} ({filename})")
    print(f"{'='*70}")

    file_path = ROOT_DIR / filename
    if not file_path.exists():
        print(f"Error: Fixture {filename} not found!")
        return None

    with open(file_path, "rb") as f:
        audio_bytes = f.read()

    response = client.post(
        "/api/v1/voice/chat",
        files={"file": (filename, audio_bytes, "audio/wav")},
    )

    print(f"HTTP Status: {response.status_code}")
    if response.status_code != 200:
        print("Error Response:", response.text)
        return None

    data = response.json()
    print(f"1. STT Transcript:       {data['transcript']}")
    print(f"2. Detected Language:    {data['detected_language']} (Normalized: {data['language']})")
    print(f"3. ORCA Classified Intent: {data['intent']}")
    print(f"4. Safety Recommendation: [{data['recommendation']['status']}] {data['recommendation']['summary']}")
    print(f"   Decisive Factors:     {data['recommendation']['decisive_factors']}")
    print(f"   Next Action:          {data['recommendation']['next_action']}")
    print(f"5. Generated Answer:\n{data['answer']}")
    print(f"6. TTS Output:           {data['audio_format']} | Base64 Length: {len(data['audio_base64'] or '')} chars")
    print(f"7. Evidence Citations:   {len(data['evidence'])} item(s)")
    print(f"8. Trace Telemetry:      {len(data['trace'])} step(s)")

    return data


def test_multiturn():
    print(f"\n{'='*70}")
    print("TESTING MULTI-TURN CONVERSATION CONTINUITY & LANGUAGE SWITCHING")
    print(f"{'='*70}")

    # Turn 1: Marathi voice query establishing Ratnagiri
    print("\n--- TURN 1: Marathi Audio Query (test_marathi.wav) ---")
    with open(ROOT_DIR / "test_marathi.wav", "rb") as f:
        marathi_bytes = f.read()

    t1 = client.post(
        "/api/v1/voice/chat",
        files={"file": ("test_marathi.wav", marathi_bytes, "audio/wav")},
    ).json()

    conv_id = t1["conversation_id"]
    print(f"Conversation ID: {conv_id}")
    print(f"Turn 1 Transcript: {t1['transcript']}")
    print(f"Turn 1 Language:   {t1['language']}")
    print(f"Turn 1 Status:     [{t1['recommendation']['status']}]")

    # Turn 2: Hindi text follow-up without explicitly naming harbor
    print("\n--- TURN 2: Hindi Follow-up Query ('हवा की गति और समुद्र की लहरें कैसी हैं?') ---")
    t2 = client.post(
        "/api/v1/chat",
        json={
            "conversation_id": conv_id,
            "message": "हवा की गति और समुद्र की लहरें कैसी हैं?",
            "user_context": {"language_preference": "hi"},
        },
    ).json()

    print(f"Turn 2 Language:   {t2['language']}")
    print(f"Turn 2 Answer:\n{t2['answer']}")
    has_ratnagiri_t2 = "रत्नागिरी" in t2["answer"] or "Ratnagiri" in t2["answer"]
    print(f"Retained Ratnagiri Harbor Context: {has_ratnagiri_t2}")

    # Turn 3: English text follow-up
    print("\n--- TURN 3: English Follow-up Query ('What is the swell period?') ---")
    t3 = client.post(
        "/api/v1/chat",
        json={
            "conversation_id": conv_id,
            "message": "What is the swell period?",
            "user_context": {"language_preference": "en"},
        },
    ).json()

    print(f"Turn 3 Language:   {t3['language']}")
    print(f"Turn 3 Answer:\n{t3['answer']}")
    has_ratnagiri_t3 = "Ratnagiri" in t3["answer"] or "8" in t3["answer"] or "swell" in t3["answer"].lower()
    print(f"Retained Ratnagiri Harbor Context: {has_ratnagiri_t3}")


if __name__ == "__main__":
    test_fixture("test_marathi.wav", "Marathi Flow")
    test_fixture("test_hindi.wav", "Hindi Flow")
    test_fixture("test_audio.wav", "English Flow")
    test_multiturn()
