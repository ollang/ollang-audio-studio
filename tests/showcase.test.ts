import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { showcase } from '../src/showcase.ts';
import { rendition, deliveredCaptions } from '../src/playback.ts';

test('showcase index matches verified media and preserves all delivered caption timelines', () => {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-showcase.ts', '--check']);
  assert.deepEqual(
    showcase.tracks.map((track) => track.language),
    ['en', 'pt', 'zh'],
  );
  for (const track of showcase.tracks) {
    assert.ok(track.translations!.every((job) => ['en', 'pt', 'zh'].includes(job.target)));
    assert.ok(
      track.translations!.every((job) =>
        job.captions.every((caption) => ['en', 'pt', 'zh'].includes(caption.language)),
      ),
    );
    assert.equal(rendition(track, 'original').url, track.url);
    for (const language of ['en']) {
      const audio = rendition(track, language);
      assert.equal(audio.language, language);
      assert.ok(audio.duration > 0);
      const captions = deliveredCaptions(track, language, 'en');
      assert.ok(captions?.cues.length);
      assert.equal(captions.language, 'en');
      assert.equal(captions.sourceAudioLanguage, track.language);
      assert.equal(captions.timing, language === track.language ? 'exact' : 'adjusted');
    }
  }
});
