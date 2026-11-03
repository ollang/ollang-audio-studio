"""Probe the running, real local detector. Run inside its container network."""

import io
import json
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parent.parent


def wav(raw: bytes) -> bytes:
    stream = io.BytesIO()
    with wave.open(stream, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(48000)
        target.writeframes(raw)
    return stream.getvalue()


def pcm(language: str) -> bytes:
    with wave.open(str(root / "fixtures" / "short" / f"{language}.wav"), "rb") as source:
        return source.readframes(source.getnframes())


cases = {
    language: (root / "fixtures" / "short" / f"{language}.wav").read_bytes()
    for language in ["en", "pt", "de"]
}
cases["silence"] = wav(bytes(48000 * 2 * 3))
cases["noise"] = wav(
    np.random.default_rng(7).integers(-3000, 3000, 48000 * 3, dtype="<i2").tobytes()
)
cases["short_en"] = wav(pcm("en")[: 48000 * 2 * 2])
cases["mixed_en_pt"] = wav(pcm("en")[: 48000 * 2 * 2] + pcm("pt")[: 48000 * 2 * 2])
times = np.arange(48000 * 5) / 48000
melody = (np.sin(2 * np.pi * 440 * times) + 0.5 * np.sin(2 * np.pi * 660 * times)) * 0.15
cases["instrumental_tones"] = wav((melody * 32767).astype("<i2").tobytes())
cases["late_en"] = wav(bytes(48000 * 2) + pcm("en"))
results = []
for name, payload in cases.items():
    started = time.monotonic()
    request = urllib.request.Request(
        "http://audio:4312/analyze", data=payload, headers={"Content-Type": "audio/wav"}
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.load(response)
    results.append({"case": name, "elapsedSeconds": round(time.monotonic() - started, 3), **result})
print(json.dumps(results, indent=2))
assert all(result["language"] == result["case"] for result in results[:3])
assert results[3]["confirmationRequired"] and results[4]["confirmationRequired"]
assert results[-2]["confirmationRequired"]
assert results[-1]["language"] == "en"
