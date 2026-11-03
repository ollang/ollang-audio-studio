# Hear the multilingual example

**The Five-Minute Fix** follows three fictional engineers discovering why one
button click creates many background jobs. Alex starts in English, Marina
continues in Brazilian Portuguese, and Chen explains the cause in Mandarin.
Each contributes the next part of one story.

[Run the app](getting-started.md), then press Play. No account or key is required:
the original performances and Ollang-translated versions are already bundled.

## A quick walkthrough

1. Choose **English** under **Listen in**. Play the three clips in sequence: all
   three speakers can be heard in English.
2. Choose **Original audio**. The same story switches between the contributors'
   original languages. Choosing another version while playing starts it
   automatically; choosing while paused prepares it for your next Play.
3. Choose **Portuguese** or **Chinese** to hear the entire example in that language.
4. Change **Subtitles in** independently, or turn them off. Change the site
   language to compare the localized interface too.

This demonstrates the application idea: contributors do not need to record in
one shared language for listeners to follow their conversation. The same Ollang
provider boundary also localizes the app's stable-key interface catalogs during
development. Playback and language selection themselves create no provider work.

## Listen to individual files

| Chapter                        | Original recording                                                                 | English listening version                                                    | English subtitle text                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Alex: one click, nine jobs     | [English](../public/samples/conversations/01-english/original.wav)                 | Same English original                                                        | [VTT](../public/samples/conversations/01-english/captions.en.for-en.vtt)    |
| Marina: the work never stopped | [Brazilian Portuguese](../public/samples/conversations/02-portuguese/original.wav) | [English dub](../public/samples/conversations/02-portuguese/dub-english.wav) | [VTT](../public/samples/conversations/02-portuguese/captions.en.for-pt.vtt) |
| Chen: why the jobs multiply    | [Mandarin](../public/samples/conversations/03-chinese/original.wav)                | [English dub](../public/samples/conversations/03-chinese/dub-english.wav)    | [VTT](../public/samples/conversations/03-chinese/captions.en.for-zh.vtt)    |

For a fast comparison, listen to Marina's opening sentence in Portuguese, then
its English dub. The [manifest](../public/samples/conversations/manifest.json)
lists every bundled rendition, subtitle file, duration, language and hash.
GitHub may download an audio file rather than provide an inline player. The app
serves the same files locally with its full player/subtitle interface.

A supplementary fourth chapter, Thomas recognizing his old code, is available
in the asset collection: [German original](../public/samples/conversations/04-german/original.wav),
[English dub](../public/samples/conversations/04-german/dub-english.wav), and
[English VTT](../public/samples/conversations/04-german/captions.en.for-de.vtt).
It is not part of the default three-clip player.

## What is prerecorded

The source performances are synthetic HeyGen voices, not recorded conversations
between real engineers. Translated voices and caption outputs came from Ollang.
Whisper detects languages locally for new uploads; it is not generating these
bundled translated voices. UI catalogs are bundled i18next resources generated
through Ollang's document workflow.

Bundled VTTs retain each original recording's timeline, including translated
subtitle text. They are not asserted to align word-for-word with every dub.
The player can apply a duration-based timing fallback. Media redistribution is approved; independent listening remains a separate
review. See the
[asset notes](../public/samples/conversations/README.md).

## Add your own voice

Create a [free developer account and configure your key](ollang.md), then choose
**Add a clip to continue the series**. Record/upload a short clip, edit if needed,
and **Save**. Whisper detects its language, asks for confirmation only when needed,
and the app starts the other supported translations automatically. This uses
Ollang credits. Watch **Behind the translation**, then compare the delivered
versions with your original.

To adapt the idea, start with [the integration walkthrough](integration.md).
The [usage guide](usage.md) explains the editor and player; [app localization](localization.md)
explains the separate interface-string workflow.
