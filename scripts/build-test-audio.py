"""Build bounded test excerpts from the approved conversation audio, without TTS or provider calls."""

import hashlib
import json
import subprocess
import wave
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / "fixtures" / "short"
output.mkdir(parents=True, exist_ok=True)
rows = []
for language, chapter, speech_seconds, seconds in [
    ("en", "01-english", 2.6, 3.4),
    ("pt", "02-portuguese", 2.6, 5.0),
    ("de", "04-german", 5.0, 5.0),
]:
    source_path = root / "public" / "samples" / "conversations" / chapter / "original.wav"
    destination = output / f"{language}.wav"
    with wave.open(str(source_path), "rb") as source:
        assert (source.getnchannels(), source.getsampwidth(), source.getframerate()) == (
            1,
            2,
            48000,
        )
        frames = source.readframes(round(speech_seconds * source.getframerate()))
    # Padding preserves the complete opening EN/PT sentences and the stable test
    # duration, instead of including the beginning of the next sentence.
    frames += bytes(round(seconds * 48000) * 2 - len(frames))
    with wave.open(str(destination), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(48000)
        target.writeframes(frames)
    rows.append(
        {
            "file": destination.relative_to(root).as_posix(),
            "language": language,
            "seconds": seconds,
            "speechSeconds": speech_seconds,
            "source": source_path.relative_to(root).as_posix(),
            "sourceSha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        }
    )
(output / "manifest.json").write_text(json.dumps(rows, indent=2) + "\n")
media = root / "fixtures" / "media"
media.mkdir(parents=True, exist_ok=True)
for extension, codec in [
    ("mp3", "libmp3lame"),
    ("m4a", "aac"),
    ("ogg", "libvorbis"),
    ("webm", "libopus"),
]:
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(output / "en.wav"),
            "-t",
            "3",
            "-map_metadata",
            "-1",
            "-c:a",
            codec,
            str(media / f"sample.{extension}"),
        ],
        check=True,
    )
print(
    f"Built {len(rows)} natural-voice WAV fixtures (at most five seconds) and four decoder fixtures."
)
