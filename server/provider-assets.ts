import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIPv4 } from 'node:net';
import type { CaptionCue } from '../shared/translations.ts';
import { ProviderError } from './provider.ts';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix);
export const publicAddress = (address: string) => isIPv4(address) && !blocked.check(address);
/** Resolve and pin a public address on each redirect. No API credentials go to asset hosts. */
export async function download(
  url: string,
  max: number,
  signal: AbortSignal,
  localTestOrigin?: string,
): Promise<Buffer> {
  for (let redirect = 0; redirect < 4; redirect++) {
    const parsed = new URL(url);
    if (localTestOrigin && parsed.origin === localTestOrigin && parsed.hostname === '127.0.0.1') {
      const response = await fetch(url, { signal, redirect: 'error' });
      if (!response.ok) throw new ProviderError('asset_unavailable');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > max) throw new ProviderError('asset_invalid');
      return bytes;
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== '443')
    )
      throw new ProviderError('asset_invalid');
    const addresses = await lookup(parsed.hostname, { all: true, family: 4 });
    if (!addresses.length || addresses.some((item) => !publicAddress(item.address)))
      throw new ProviderError('asset_invalid');
    const result = await new Promise<Buffer | string>((resolve, reject) => {
      const req = request(
        parsed,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
          family: 4,
          lookup: (_host, _options, callback) => callback(null, addresses[0]!.address, 4),
        },
        (response) => {
          if (
            [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
            response.headers.location
          ) {
            response.resume();
            resolve(new URL(response.headers.location, parsed).href);
            return;
          }
          if (response.statusCode !== 200) {
            response.resume();
            reject(new ProviderError('asset_unavailable'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > max) {
              req.destroy(new ProviderError('asset_invalid'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => resolve(Buffer.concat(chunks)));
        },
      );
      req.on('error', reject);
      req.end();
    });
    if (Buffer.isBuffer(result)) return result;
    url = result;
  }
  throw new ProviderError('asset_invalid');
}
export function parseCaptions(raw: string, duration: number): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const index = lines.findIndex((line) => line.includes('-->'));
    if (index < 0) continue;
    const timing = lines[index]!.match(
      /^\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/,
    );
    if (!timing) throw new ProviderError('captions_invalid');
    const stamp = (value: string) => {
      const parts = value.replace(',', '.').split(':').map(Number);
      if (parts.at(-1)! >= 60 || parts.at(-2)! >= 60) throw new ProviderError('captions_invalid');
      return parts.reduce((sum, n) => sum * 60 + n, 0);
    };
    const start = stamp(timing[1]!);
    const end = stamp(timing[2]!);
    const text = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (
      start < 0 ||
      end <= start ||
      end > duration + 1 ||
      !text.trim() ||
      (cues.length && start < cues.at(-1)!.start)
    )
      throw new ProviderError('captions_invalid');
    cues.push({ start, end, text });
  }
  if (!cues.length) throw new ProviderError('captions_pending');
  return cues;
}
