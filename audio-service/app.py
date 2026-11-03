"""Private, bounded CPU audio service. It has no provider key or database access."""

import asyncio
import io
import logging
import os
import subprocess
import tempfile
from pathlib import Path
import threading
import time
import wave
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool

MAX_BYTES = 12 * 1024 * 1024
MODEL_REPO = "Systran/faster-whisper-tiny"
MODEL_REVISION = "d90ca5fe260221311c53c58e660288d3deb8d356"
state: dict[str, Any] = {"status": "loading", "model": None, "loaded_seconds": None}
inference_lock = threading.Lock()


def load_model() -> None:
    from faster_whisper import WhisperModel
    from huggingface_hub import snapshot_download

    start = time.monotonic()
    try:
        path = snapshot_download(
            MODEL_REPO,
            revision=MODEL_REVISION,
            allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.*"],
        )
        state["model"] = WhisperModel(
            path, device="cpu", compute_type="int8", cpu_threads=1, num_workers=1
        )
        state["loaded_seconds"] = round(time.monotonic() - start, 2)
        state["status"] = "ready"
        logging.info("Whisper ready after %.2fs", state["loaded_seconds"])
    except Exception:
        state["status"] = "unavailable"
        logging.exception("Model initialization failed; check download/cache access")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if os.environ.get("SKIP_MODEL_LOAD") != "1":
        threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def decode_wav(data: bytes) -> tuple[np.ndarray[Any, Any], float]:
    if len(data) > MAX_BYTES:
        raise ValueError("too_large")
    try:
        with wave.open(io.BytesIO(data), "rb") as source:
            if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (
                1,
                2,
                48000,
            ):
                raise ValueError("invalid_audio")
            frames = source.getnframes()
            duration = frames / 48000
            if not 1 <= duration <= 120:
                raise ValueError("invalid_duration")
            raw = source.readframes(frames)
            if len(raw) != frames * 2:
                raise ValueError("invalid_audio")
    except (wave.Error, EOFError) as error:
        raise ValueError("invalid_audio") from error
    # The canonical browser export is 48 kHz; average groups rather than aliasing
    # a single sample during 16 kHz speech-detection downsampling.
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
    usable = len(samples) - len(samples) % 3
    return samples[:usable].reshape(-1, 3).mean(axis=1), duration


def analyze_audio(data: bytes) -> dict[str, Any]:
    audio, duration = decode_wav(data)
    if float(np.sqrt(np.mean(audio * audio))) < 0.0005:
        return {
            "duration": duration,
            "language": "",
            "confidence": 0,
            "confirmationRequired": True,
            "reason": "no_speech",
        }
    model = state["model"]
    if model is None:
        raise RuntimeError("model_not_ready")
    try:
        language, confidence, _ = model.detect_language(audio=audio, vad_filter=True)
    except ValueError:
        return {
            "duration": duration,
            "language": "",
            "confidence": 0,
            "confirmationRequired": True,
            "reason": "no_speech",
        }
    uncertain = float(confidence) < 0.75
    return {
        "duration": duration,
        "language": language,
        "confidence": float(confidence),
        "confirmationRequired": uncertain,
        "reason": "low_confidence" if uncertain else "detected",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": state["status"],
        "model": MODEL_REPO,
        "revision": MODEL_REVISION,
        "loadedSeconds": state["loaded_seconds"],
    }


@app.post("/analyze")
async def analyze(request: Request) -> dict[str, Any]:
    if state["status"] != "ready":
        raise HTTPException(503, "model_not_ready")
    if not inference_lock.acquire(blocking=False):
        raise HTTPException(429, "busy")
    try:
        data = bytearray()
        async with asyncio.timeout(15):
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise HTTPException(413, "too_large")
        return await run_in_threadpool(analyze_audio, bytes(data))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except TimeoutError as error:
        raise HTTPException(408, "upload_timeout") from error
    finally:
        inference_lock.release()


def normalize_audio(data: bytes) -> bytes:
    """Decode a bounded provider asset without allowing media to open network URLs."""
    if len(data) > 24 * 1024 * 1024:
        raise ValueError("too_large")
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "input"
        source.write_bytes(data)
        try:
            result = subprocess.run(
                ["ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
                 "-format_whitelist", "wav,mp3,mov,matroska,webm,ogg,flac,aac",
                 "-i", str(source), "-t", "120.01", "-map", "0:a:0", "-vn",
                 "-ac", "1", "-ar", "48000", "-f", "s16le", "-threads", "1", "pipe:1"],
                capture_output=True, timeout=60, check=True,
            )
        except (subprocess.SubprocessError, OSError) as error:
            raise ValueError("invalid_audio") from error
        pcm = result.stdout
        if not 96000 <= len(pcm) <= 120 * 96000:
            raise ValueError("invalid_duration")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(48000)
            target.writeframes(pcm)
        return buffer.getvalue()


@app.post("/normalize")
async def normalize(request: Request) -> Response:
    if not inference_lock.acquire(blocking=False):
        raise HTTPException(429, "busy")
    try:
        data = bytearray()
        async with asyncio.timeout(15):
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data) > 24 * 1024 * 1024:
                    raise HTTPException(413, "too_large")
        result = await run_in_threadpool(normalize_audio, bytes(data))
        return Response(content=result, media_type="audio/wav")
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except TimeoutError as error:
        raise HTTPException(408, "upload_timeout") from error
    finally:
        inference_lock.release()
