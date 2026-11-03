import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { fixture } from './helpers.ts';

/** A controlled HTTP boundary, never a replacement for the application API or SQLite. */
export async function fakeProvider() {
  const state = {
    uploads: 0,
    confirmationRequired: false,
    detectorUnavailable: false,
    uploadLanguages: [] as string[],
    detectionDelay: 0,
    creates: 0,
    reads: 0,
    ready: false,
    lostCreate: false,
    lostUpload: false,
    invalidParent: false,
    missingCaptions: false,
    noDubCaptions: false,
    dubDuration: 3,
    source: 'en',
    targets: [] as string[],
    failReads: 0,
    authError: false,
    assetKeyLeak: false,
    audioReads: 0,
    normalizations: 0,
    missingTargetCaptions: false,
    malformedTargetCaptions: false,
    invalidNormalizedAudio: false,
  };
  let origin = '';
  const project = 'project-fixture';
  function order(id: string) {
    const type = id === 'cc-fixture' ? 'cc' : id.startsWith('sub-') ? 'subtitle' : 'aiDubbing';
    const target = id.split('-').at(-1)!;
    return {
      id,
      projectId: state.invalidParent ? 'wrong-project' : project,
      type,
      sourceLanguage: state.source,
      targetLanguage: type === 'cc' ? state.source : target,
      status: state.ready ? 'completed' : 'ongoing',
      vttUrl:
        state.missingCaptions ||
        (type === 'subtitle' && state.missingTargetCaptions) ||
        (type === 'aiDubbing' && (state.noDubCaptions || state.missingTargetCaptions))
          ? ''
          : `${origin}/asset/${type === 'cc' ? 'en' : target}.vtt`,
      orderDocs:
        type === 'aiDubbing'
          ? [{ type: 'created_ai_dub_audio', url: `${origin}/asset/audio.wav` }]
          : [],
    };
  }
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const url = new URL(req.url!, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    const send = (data: unknown) => res.end(JSON.stringify(data));
    if (url.pathname === '/health') return send({ status: 'ready' });
    if (url.pathname === '/analyze') {
      if (state.detectorUnavailable) {
        res.statusCode = 503;
        return send({});
      }
      if (state.detectionDelay)
        await new Promise((resolve) => setTimeout(resolve, state.detectionDelay));
      return send({
        language: state.source,
        confidence: 0.98,
        duration: 3,
        confirmationRequired: state.confirmationRequired,
        reason: state.confirmationRequired ? 'low_confidence' : 'detected',
      });
    }
    if (url.pathname === '/normalize') {
      state.normalizations++;
      res.setHeader('Content-Type', 'audio/wav');
      res.end(state.invalidNormalizedAudio ? Buffer.from('invalid WAV') : body);
      return;
    }
    if (url.pathname.startsWith('/asset/')) {
      state.assetKeyLeak ||= Boolean(req.headers['x-api-key']);
      if (url.pathname.endsWith('.wav')) {
        state.audioReads++;
        res.setHeader('Content-Type', 'audio/wav');
        res.end(fixture(state.dubDuration));
        return;
      }
      res.setHeader('Content-Type', 'text/vtt');
      if (state.malformedTargetCaptions && !url.pathname.includes('en.vtt')) {
        res.end('WEBVTT\n\n00:02.000 --> 00:01.000\nInvalid cue\n');
        return;
      }
      res.end(
        `WEBVTT\n\n00:00.000 --> 00:02.800\n${url.pathname.includes('en.vtt') ? 'Hello from the fixture.' : url.pathname.includes('zh.vtt') ? '来自测试的问候。' : 'Olá do teste.'}\n`,
      );
      return;
    }
    if (!req.headers['x-api-key'] || state.authError) {
      res.statusCode = 401;
      send({ message: 'private diagnostic must not reach browser' });
      return;
    }
    if (req.method === 'GET') {
      state.reads++;
      if (state.failReads-- > 0) {
        res.statusCode = 429;
        send({});
        return;
      }
    }
    if (url.pathname === '/integration/upload/direct') {
      state.uploads++;
      const multipart = await new Request('http://fixture', {
        method: 'POST',
        body: new Uint8Array(body),
        headers: { 'content-type': req.headers['content-type']! },
      }).formData();
      assert.deepEqual([...multipart.keys()].sort(), ['file', 'name', 'sourceLanguage']);
      state.uploadLanguages.push(String(multipart.get('sourceLanguage')));
      if (state.lostUpload) {
        req.socket.destroy();
        return;
      }
      send({ projectId: project });
      return;
    }
    if (url.pathname === '/integration/orders/create') {
      state.creates++;
      const data = JSON.parse(body.toString());
      const target = data.targetLanguageConfigs[0].language as string;
      if (!state.targets.includes(target)) state.targets.push(target);
      if (state.lostCreate) {
        req.socket.destroy();
        return;
      }
      send({
        data: [
          { orderId: 'cc-fixture' },
          { orderId: `sub-${target}` },
          { orderId: `dub-${target}` },
        ],
      });
      return;
    }
    if (url.pathname === `/integration/project/${project}`) {
      send({ id: project, name: 'fixture' });
      return;
    }
    if (url.pathname === '/integration/orders') {
      send([
        order('cc-fixture'),
        ...state.targets.flatMap((target) => [order(`sub-${target}`), order(`dub-${target}`)]),
      ]);
      return;
    }
    if (url.pathname.startsWith('/integration/orders/')) {
      send(order(url.pathname.split('/').at(-1)!));
      return;
    }
    res.statusCode = 404;
    send({});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    state,
    origin,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
