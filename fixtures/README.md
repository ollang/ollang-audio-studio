# Audio fixture provenance

The player uses `showcase.json`: three chapters from the approved
English/Portuguese/Mandarin conversation, with actual Ollang dubs and delivered
captions. Sources, hashes and rights status are recorded in
[the conversation manifest](../public/samples/conversations/manifest.json).
The English, Portuguese, Mandarin and German originals are HeyGen performances.
The application never generates speech when loading the player.

Generate or verify the playback index with
`node --import tsx scripts/build-showcase.ts [--check]`. This validates the
selected media/caption hashes, preserves original caption timelines and never
calls a provider.

## Short tests and compressed decoder files

`short/en.wav`, `short/pt.wav` and `short/de.wav` derive only from the approved
conversation originals. Every file is at most five seconds. The English and
Portuguese excerpts retain a complete opening sentence and pad to their stable
test durations; the German excerpt is the opening five seconds.
`short/manifest.json` records source paths, source/output hashes, speech length
and exact duration. These files are local fixtures, not new translation results.

`media/` contains three-second FFmpeg conversions of the English excerpt to MP3,
AAC/M4A, Vorbis/OGG and Opus/WebM for browser decoder tests. The fake microphone
uses the same English excerpt. No older synthesized preview audio is retained.

To regenerate with the complete codec set provided by the audio image:

```sh
docker compose build audio
docker compose run --rm -v "$PWD:/work" audio python /work/scripts/build-test-audio.py
```

The script trims/re-encodes existing files; it makes no synthesis or translation
calls. Preserve source recordings and the fixture manifest when reviewing a
change. Provider smoke work requires a separately approved scope, even with
short fixtures. Bundled derivative media is covered by the
[media notice](../MEDIA_NOTICE.md).

## Interface translations

`locales/en.json` is the authored English UI source. Portuguese/Chinese catalogs were
generated through Ollang's document API and validated against source hashes and
placeholders. They are independent of recording/caption languages. No fixture is
assigned to a user's recording, and page visits never submit provider work.
