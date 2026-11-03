import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptAudioTake,
  commitPieces,
  gainAt,
  keepRange,
  pendingEditProject,
  projectDuration,
  projectWav,
  recordingAllowance,
  redoProject,
  removeRange,
  resolvePendingEdit,
  undoProject,
  volumeRange,
  type RecorderProject,
} from '../src/editor/project';

function take(id: string, seconds = 4, value = 0.5) {
  const data = new Float32Array(seconds * 48000).fill(value);
  return {
    id,
    file: {} as File,
    buffer: {
      duration: seconds,
      sampleRate: 48000,
      length: data.length,
      numberOfChannels: 1,
      getChannelData: () => data,
    } as unknown as AudioBuffer,
  };
}
function draft() {
  return acceptAudioTake(null, take('first'), 'microphone');
}
async function sample(project: RecorderProject, second: number) {
  return new DataView(await projectWav(project).arrayBuffer()).getInt16(
    44 + Math.round(second * 48000) * 2,
    true,
  );
}

test('trim, middle removal and history preserve original takes', () => {
  const original = draft();
  const trimmed = commitPieces(original, keepRange(original, 500, 3500));
  const cut = commitPieces(trimmed, removeRange(trimmed, 1000, 2000));
  assert.equal(projectDuration(cut), 2000);
  assert.deepEqual(
    cut.pieces.map((p) => [p.startMs, p.endMs]),
    [
      [500, 1500],
      [2500, 3500],
    ],
  );
  assert.deepEqual(undoProject(cut).pieces, trimmed.pieces);
  assert.deepEqual(redoProject(undoProject(cut)).pieces, cut.pieces);
  assert.equal(cut.takes[0], original.takes[0]);
});

test('pending cut and volume can be applied once or discarded without corrupting history', () => {
  const original = draft();
  const selection = {
    mode: 'cut' as const,
    operation: 'remove' as const,
    startMs: 1000,
    endMs: 2000,
  };
  const preview = pendingEditProject(original, selection, true, null);
  assert.equal(projectDuration(preview), 3000);
  assert.equal(resolvePendingEdit(original, preview, false), original);
  const applied = resolvePendingEdit(original, preview, true);
  assert.equal(applied.past.length, original.past.length + 1);
  assert.deepEqual(undoProject(applied).pieces, original.pieces);
  assert.equal(pendingEditProject(original, selection, false, null), original);
});

test('export applies steady volume, fades and clipping to the actual WAV samples', async () => {
  const original = draft();
  const half = { ...original, pieces: volumeRange(original, 0, 4000, 0.5, 0.5) };
  assert.equal(await sample(half, 1), 8192);
  const fade = { ...original, pieces: volumeRange(original, 0, 4000, 0, 1) };
  assert.equal(await sample(fade, 0), 0);
  assert.ok(Math.abs((await sample(fade, 2)) - 8192) <= 1);
  const reset = { ...fade, pieces: volumeRange(fade, 0, 4000, 1, 1) };
  assert.equal(await sample(reset, 1), await sample(original, 1));
  const loud = acceptAudioTake(null, take('loud', 4, 0.9), 'file');
  const boosted = { ...loud, pieces: volumeRange(loud, 0, 4000, 2, 2) };
  assert.equal(await sample(boosted, 1), 32767);
});

test('cuts preserve fades and appended takes export in order without silence', async () => {
  const original = draft();
  const fade = { ...original, pieces: volumeRange(original, 0, 4000, 0, 1) };
  const trimmed = commitPieces(fade, keepRange(fade, 1000, 3000));
  assert.equal(gainAt(trimmed.pieces[0]!.volume, 0), 0.25);
  const combined = acceptAudioTake(trimmed, take('second', 2, -0.5), 'microphone');
  assert.equal(projectDuration(combined), 4000);
  assert.equal(recordingAllowance(combined), 176000);
  assert.ok((await sample(combined, 1.999)) > 0);
  assert.equal(await sample(combined, 2), -16384);
  assert.equal((await projectWav(combined).arrayBuffer()).byteLength, 44 + 4 * 96000);
});

test('file replacement clears old audio and history; recording after undo clears redo', () => {
  const original = draft();
  const continued = acceptAudioTake(original, take('second'), 'microphone');
  assert.equal(continued.takes.length, 2);
  const undone = undoProject(continued);
  const newTake = acceptAudioTake(undone, take('third'), 'microphone');
  assert.equal(newTake.future.length, 0);
  const replacement = acceptAudioTake(newTake, take('file'), 'file');
  assert.equal(replacement.takes.length, 1);
  assert.equal(replacement.past.length, 0);
  assert.equal(replacement.future.length, 0);
  assert.equal(replacement.pieces[0]?.takeId, 'file');
});
