import os
from sarvamai import SarvamAI

audio_path = r"C:\Users\dyara\ORCA\test_audio.wav"

api_key = os.getenv("SARVAM_API_KEY")

if not api_key:
    raise RuntimeError("SARVAM_API_KEY is not set")

client = SarvamAI(
    api_subscription_key=api_key
)

print("Sending audio to Sarvam...")

with open(audio_path, "rb") as audio:
    response = client.speech_to_text.transcribe(
        file=audio,
        model="saaras:v4",
        language_code="unknown",
    )

print("\n--- SARVAM STT RESULT ---")
print("Language:", response.language_code)
print("Transcript:")
print(response.transcript)