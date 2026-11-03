import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    clip: { type: 'string' },
    target: { type: 'string', multiple: true },
    port: { type: 'string', default: '4310' },
    'list-clips': { type: 'boolean' },
    submit: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    [
      'Local Audio Studio client (Node 22.17+; no Ollang key is read by this script).',
      '',
      'List saved clips without submitting work:',
      '  node examples/translate-clip.mjs --list-clips [--port 4310]',
      '',
      'Request translation through the running local app (uses Ollang credits):',
      '  node examples/translate-clip.mjs --clip UUID --target pt [--target zh] [--port 4310] --submit',
    ].join('\n'),
  );
} else {
  try {
    const port = Number(values.port);
    const targets = [...new Set(values.target ?? [])];
    const listing = values['list-clips'] === true;
    if (listing && (values.clip !== undefined || values.target !== undefined || values.submit))
      throw new Error('--list-clips cannot be combined with --clip, --target or --submit.');
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Provide a valid local app port between 1 and 65535.');
    if (
      !listing &&
      (!values.submit ||
        !values.clip ||
        !targets.length ||
        targets.some((target) => !['en', 'pt', 'zh'].includes(target)))
    )
      throw new Error(
        'Provide a clip, target languages, valid port and explicit --submit. See --help.',
      );
    const base = `http://127.0.0.1:${port}`;
    const clipsResponse = await fetch(`${base}/api/clips`, { signal: AbortSignal.timeout(10000) });
    if (!clipsResponse.ok) throw new Error('Could not read clips from the local app.');
    let clips;
    try {
      clips = await clipsResponse.json();
    } catch {
      throw new Error('The local app returned invalid clip data. Check the app port.');
    }
    if (
      !Array.isArray(clips) ||
      clips.some(
        (clip) =>
          !clip ||
          typeof clip.id !== 'string' ||
          typeof clip.title !== 'string' ||
          typeof clip.status !== 'string' ||
          typeof clip.sourceLanguage !== 'string' ||
          typeof clip.detectedLanguage !== 'string' ||
          typeof clip.confirmationRequired !== 'boolean' ||
          !Number.isFinite(clip.duration) ||
          clip.duration <= 0,
      )
    )
      throw new Error('The local app returned invalid clip data. Check the app port.');
    if (listing) {
      // Project/order receipts and media URLs are not needed to choose a local clip.
      console.log(
        JSON.stringify(
          clips.map((clip) => ({
            id: clip.id,
            title: clip.title,
            language: clip.sourceLanguage || clip.detectedLanguage || null,
            durationSeconds: clip.duration,
            status: clip.status,
            confirmationRequired: clip.confirmationRequired,
          })),
          null,
          2,
        ),
      );
    } else {
      const clip = clips.find((item) => item.id === values.clip);
      if (!clip || clip.status !== 'ready' || !clip.sourceLanguage || clip.confirmationRequired)
        throw new Error('Save the clip and confirm its source language first.');
      const response = await fetch(
        `${base}/api/clips/${encodeURIComponent(clip.id)}/translations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Local app rejected translation (HTTP ${response.status}); inspect the web app's configuration and job status.`,
        );
      const jobs = await response.json();
      console.log(
        JSON.stringify(
          jobs.map((job) => ({ target: job.target, state: job.state })),
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
