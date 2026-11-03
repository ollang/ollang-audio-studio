import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseCaptions } from '../server/provider-assets.ts';
import { format } from 'prettier';
import { targetLanguages } from '../shared/translations.ts';

type Asset = { filename: string; sha256: string };
type ManifestClip = {
  source_language: string;
  original: Asset & { duration_seconds: number };
  captions: (Asset & { text_language: string; associated_audio_language: string })[];
  translations: (Asset & { target_language: string; duration_seconds: number })[];
};

// Curate three source languages while retaining the delivered captions' timeline.
const root = resolve(import.meta.dirname, '..');
const base = resolve(root, 'public/samples/conversations');
const manifest = JSON.parse(readFileSync(resolve(base, 'manifest.json'), 'utf8')) as {
  title: string;
  clips: ManifestClip[];
};
const titles = [
  'Alex: One click, nine jobs',
  'Marina: The work never stopped',
  'Chen: Why the jobs multiply',
];
function verifiedFile(file: { filename: string; sha256: string }) {
  const path = resolve(base, file.filename);
  if (!path.startsWith(base + '/')) throw new Error('Sample path leaves its directory.');
  const bytes = readFileSync(path);
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    throw new Error(`Sample checksum changed: ${file.filename}`);
  return bytes;
}
const clips = manifest.clips
  .slice(0, 3)
  .map((clip: (typeof manifest.clips)[number], index: number) => {
    verifiedFile(clip.original);
    return {
      id: `showcase-${clip.source_language}`,
      title: titles[index],
      language: clip.source_language,
      url: `/samples/conversations/${clip.original.filename}`,
      duration: clip.original.duration_seconds,
      captions: clip.captions
        .filter((caption) => targetLanguages.some((language) => language === caption.text_language))
        .map((caption: (typeof clip.captions)[number]) => ({
          language: caption.text_language,
          audioLanguage: caption.associated_audio_language,
          cues: parseCaptions(
            verifiedFile(caption).toString('utf8'),
            clip.original.duration_seconds,
          ),
        })),
      renditions: clip.translations
        .filter((translation) =>
          targetLanguages.some((language) => language === translation.target_language),
        )
        .map((translation: (typeof clip.translations)[number]) => {
          verifiedFile(translation);
          return {
            language: translation.target_language,
            url: `/samples/conversations/${translation.filename}`,
            duration: translation.duration_seconds,
          };
        }),
    };
  });
const output = await format(JSON.stringify({ title: manifest.title, clips }), { parser: 'json' });
const destination = resolve(root, 'fixtures/showcase.json');
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output)
    throw new Error('Regenerate fixtures/showcase.json.');
} else writeFileSync(destination, output);
console.log(
  `Verified ${clips.length} originals, ${clips.reduce((n, clip) => n + clip.renditions.length, 0)} dubs and ${clips.reduce((n, clip) => n + clip.captions.length, 0)} caption files.`,
);
