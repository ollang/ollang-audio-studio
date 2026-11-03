import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/** Exercise the real API/queue with local provider outputs; never use a live key. */
export async function translatedStory(page: Page, request: APIRequestContext) {
  await request.post('/__test/provider', {
    data: {
      ready: true,
      lostCreate: false,
      noDubCaptions: false,
      missingCaptions: false,
      confirmationRequired: false,
      detectionDelay: 0,
      dubDuration: 3,
    },
  });
  const id = randomUUID();
  const response = await request.post('/api/clips', {
    headers: {
      'Content-Type': 'audio/wav',
      'X-Submission-Id': id,
      'X-Clip-Title': `Playback ${id}`,
      'X-Auto-Translate': 'true',
    },
    data: await readFile('fixtures/short/en.wav'),
  });
  expect(response.status()).toBe(201);
  await expect
    .poll(async () => {
      const clips = await (await request.get('/api/clips')).json();
      const jobs = clips.find((clip: { id: string }) => clip.id === id)?.translations;
      return jobs?.length === 2 && jobs.every((job: { state: string }) => job.state === 'ready');
    })
    .toBe(true);
  await page.addInitScript((series) => localStorage.setItem('ollang.series', series), id);
  await page.goto('/');
  return id;
}
