# Dependency and media notices

This inventory is a review aid, not a replacement for upstream license texts.
Project source and documentation use the [MIT license](LICENSE). Bundled media
has separate [permission and provenance notices](MEDIA_NOTICE.md).

## JavaScript runtime packages

Declared licenses from the pinned package metadata:

| Package                      | Declared license |
| ---------------------------- | ---------------- |
| `fastify`, `@fastify/static` | MIT              |
| `react`, `react-dom`         | MIT              |
| `i18next`, `react-i18next`   | MIT              |
| `zod`                        | MIT              |
| `lucide-react`               | ISC              |

Exact direct/transitive versions are in `package-lock.json`; retain applicable
notices from installed packages when redistributing them. Development tools have
their own upstream licenses as well.

## Audio and model dependencies

The audio image installs Debian's FFmpeg plus the pinned Python
packages in `audio-service/requirements.lock`. Model repository/revision are
explicit in `audio-service/app.py`; weights are downloaded to a persistent cache.

- [FFmpeg licensing](https://ffmpeg.org/legal.html) depends on the enabled components;
  inspect the actual packaged build and corresponding notices before distribution.
- [The pinned model repository](https://huggingface.co/Systran/faster-whisper-tiny)
  supplies its model/license information; do not infer weight rights solely from
  a Python library's license.

System-package notices are available under `/usr/share/doc` in the image. Review
them for the exact distributed image, rather than assuming every FFmpeg build has
the same obligations.

## Included media

The conversation scripts were written for this example. Included original
performances came from HeyGen; dubbed audio and delivered captions came from
Ollang. Short provider fixtures and compressed browser fixtures derive only from
those originals. Portuguese/Chinese interface catalogs came from Ollang's document
workflow. [Fixture provenance](fixtures/README.md) and
[the conversation manifest](public/samples/conversations/manifest.json) record
sources, hashes and which material is prerecorded provider output.

Ollang has approved public distribution of the bundled sample media and branding
with this reference application; see [the media notice](MEDIA_NOTICE.md) for scope.
Do not copy private user recordings, keys, databases or provider receipts into
the repository. Provider service terms apply to new work requested with your account.
