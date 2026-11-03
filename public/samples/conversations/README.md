# The Five-Minute Fix — bundled audio

A fictional engineering incident continued across languages. The default player
uses three chapters: English, Brazilian Portuguese, and Mandarin. A supplementary
German chapter stays in this collection. Original performances were generated
with HeyGen; translated audio and delivered caption text came from Ollang.
These are synthetic performances, not statements made by real engineers.

Playing this collection submits no API orders. English, Portuguese, and Chinese
are the translated listening/subtitle languages. German translated outputs are
not included; the German original remains as an additional source-language example.

| Folder          | Source               | Original duration | Included dub languages       |
| --------------- | -------------------- | ----------------- | ---------------------------- |
| `01-english`    | English              | 35.03 s           | Portuguese, Chinese          |
| `02-portuguese` | Brazilian Portuguese | 42.03 s           | English, Chinese             |
| `03-chinese`    | Mandarin             | 57.52 s           | English, Portuguese          |
| `04-german`     | German               | 45.27 s           | English, Portuguese, Chinese |

## Files and provenance

- `original.wav` is the selected source performance converted to 48 kHz, mono,
  signed 16-bit PCM WAV.
- `dub-<language>.wav` is an Ollang output for that original, converted to the
  same local format. This batch used `dubbingStyle: lipsync` and `autoQc: false`.
- `captions.<text-language>.for-<audio-language>.vtt` identifies both the caption
  text language and the audio timeline associated with its delivered timestamps.
- [manifest.json](manifest.json) records formats, durations, hashes, generation
  provenance, verification evidence and remaining review. Provider submission
  counts are historical generation totals, including superseded takes; they are
  not the number of files currently curated in this collection.

The current collection has four originals, nine dubs and twelve VTTs. The default
three-clip index uses three originals, six dubs and nine subtitle tracks.
Sources were generated October 22, 2026. No speed changes, effects, added noise,
artificial stutters or editorial trimming were applied to these conversation files.
Short/compressed test derivatives are documented separately in
[fixture provenance](../../../fixtures/README.md).

## Caption timing and review

These VTTs follow the original source timeline. Translated subtitle outputs retain
that association when their cue intervals preserve source CC timing, allowing
splits within a source cue and two milliseconds of provider rounding. They are
not relabeled as independently aligned dubbed timelines. Stored timestamps are
unchanged; playback can compute a duration-based fallback without rewriting files.

Automatic decoding/language/timing checks and selected source-performance
acceptance are recorded in the manifest. Independent review of translated meaning,
dubbed voice, complete endings and synchronization remains a separate human task.

## Rights

Scripts were authored for this example. Ollang Inc. has approved public
redistribution of the bundled sample assets with this reference application.
See [the media notice](../../../MEDIA_NOTICE.md) for scope and reuse contact.
Private originals, superseded outputs and provider receipts are not part of this
public collection. A code license alone does not grant rights to voices or marks.
