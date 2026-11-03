import io
import wave

import numpy as np
import pytest

import app


def wav(seconds: float = 2, rate: int = 48000, value: int = 0) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(np.full(int(seconds * rate), value, dtype="<i2").tobytes())
    return buffer.getvalue()


def test_silence_needs_confirmation() -> None:
    result = app.analyze_audio(wav())
    assert result["reason"] == "no_speech"
    assert result["confirmationRequired"] is True
    assert result["language"] == ""


@pytest.mark.parametrize("data", [b"bad", wav(0.5), wav(121), wav(rate=44100), wav()[:-100]])
def test_invalid_audio(data: bytes) -> None:
    with pytest.raises(ValueError):
        app.decode_wav(data)


def test_low_confidence_is_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    class Model:
        def detect_language(self, **_kwargs: object) -> tuple[str, float, list[object]]:
            return "es", 0.4, []

    monkeypatch.setitem(app.state, "model", Model())
    result = app.analyze_audio(wav(value=4000))
    assert result["reason"] == "low_confidence"
    assert result["language"] == "es"
    assert result["confirmationRequired"] is True


def test_normalize_audio_is_canonical_and_bounded() -> None:
    normalized = app.normalize_audio(wav(value=4000))
    samples, duration = app.decode_wav(normalized)
    assert duration == 2
    assert len(samples) == 32000
    assert normalized[:4] == b"RIFF"


@pytest.mark.parametrize("data", [b"bad", wav(0.5), wav(121)])
def test_normalize_rejects_invalid_media(data: bytes) -> None:
    with pytest.raises(ValueError):
        app.normalize_audio(data)
