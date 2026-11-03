import { createHash } from 'node:crypto';
import { z } from 'zod';

const Identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const Order = z.object({
  id: Identifier,
  projectId: Identifier,
  type: z.string(),
  status: z.string(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  vttUrl: z.string().nullish(),
  orderDocs: z.array(z.object({ type: z.string(), url: z.string().nullish() })).nullish(),
});
export type ProviderOrder = z.infer<typeof Order>;
export class ProviderError extends Error {
  constructor(
    readonly code: string,
    readonly uncertain = false,
  ) {
    super(code);
  }
}
/** Small Ollang REST boundary, shared by audio jobs and UI catalog generation. */
export class Provider {
  readonly scope: string;
  constructor(
    readonly key: string,
    readonly base = 'https://api-integration.ollang.com',
  ) {
    const url = new URL(base);
    if (
      url.origin !== 'https://api-integration.ollang.com' &&
      !(url.hostname === '127.0.0.1' && url.protocol === 'http:')
    )
      throw new Error('Invalid provider origin');
    this.scope = createHash('sha256').update(`${base}\0${key}\0`).digest('hex');
  }
  async request(path: string, signal: AbortSignal, body?: FormData | object): Promise<unknown> {
    const write = body !== undefined;
    try {
      const response = await fetch(`${this.base}/${path}`, {
        method: write ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          'X-Api-Key': this.key,
          Accept: 'application/json',
          ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([signal, AbortSignal.timeout(write ? 120000 : 20000)]),
      });
      if (!response.ok) {
        const code =
          response.status === 401
            ? 'provider_auth'
            : response.status === 403
              ? 'provider_forbidden'
              : response.status === 402
                ? 'provider_credits'
                : response.status === 429
                  ? 'provider_rate_limit'
                  : 'provider_request';
        throw new ProviderError(code, write && response.status >= 500);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('empty');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('oversized');
        }
        chunks.push(value);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const result = JSON.parse(text) as unknown;
      return result && typeof result === 'object' && 'data' in result ? result.data : result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('provider_unavailable', write);
    }
  }
  async upload(bytes: Buffer, clipId: string, language: string, signal: AbortSignal) {
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), `${clipId}.wav`);
    body.append('name', `Audio demo ${clipId}`);
    body.append('sourceLanguage', language);
    const result = await this.request('integration/upload/direct', signal, body);
    const parsed = z.object({ projectId: Identifier }).safeParse(result);
    if (!parsed.success) throw new ProviderError('upload_uncertain', true);
    return parsed.data.projectId;
  }
  /** Returns receipts, not completed output. The worker verifies parent identity. */
  async create(projectId: string, source: string, target: string, signal: AbortSignal) {
    const result = await this.request('integration/orders/create', signal, {
      orderType: 'aiDubbing',
      level: 0,
      projectId,
      sourceLanguage: source,
      targetLanguageConfigs: [{ language: target, isRush: false }],
      dubbingStyle: 'lipsync',
    });
    const parsed = z
      .array(z.object({ orderId: Identifier }))
      .min(1)
      .safeParse(result);
    if (!parsed.success) throw new ProviderError('order_uncertain', true);
    return [...new Set(parsed.data.map((row) => row.orderId))];
  }
  async uploadStrings(strings: Record<string, string>, name: string, signal: AbortSignal) {
    const body = new FormData();
    body.append(
      'file',
      new Blob([JSON.stringify(strings)], { type: 'application/json' }),
      `${name}.json`,
    );
    body.append('name', name);
    body.append('sourceLanguage', 'en');
    const parsed = z
      .object({ projectId: Identifier })
      .safeParse(await this.request('integration/upload/direct', signal, body));
    if (!parsed.success) throw new ProviderError('upload_uncertain', true);
    return parsed.data.projectId;
  }
  async createDocument(projectId: string, target: string, signal: AbortSignal) {
    const parsed = z
      .array(z.object({ orderId: Identifier }))
      .length(1)
      .safeParse(
        await this.request('integration/orders/create', signal, {
          orderType: 'document',
          level: 0,
          projectId,
          targetLanguageConfigs: [{ language: target, isRush: false }],
        }),
      );
    if (!parsed.success) throw new ProviderError('order_uncertain', true);
    return parsed.data[0]!.orderId;
  }
  async exportStrings(orderId: string, target: string, signal: AbortSignal) {
    const query = new URLSearchParams({
      targetLanguage: target,
      'orderIds[]': Identifier.parse(orderId),
    });
    const parsed = z
      .record(z.string(), z.string())
      .safeParse(await this.request(`integration/content/export?${query}`, signal));
    if (!parsed.success) throw new ProviderError('provider_contract');
    return parsed.data;
  }
  async order(id: string, signal: AbortSignal) {
    const result = Order.safeParse(
      await this.request(`integration/orders/${Identifier.parse(id)}`, signal),
    );
    if (!result.success || result.data.id !== id) throw new ProviderError('provider_contract');
    return result.data;
  }
  async projectOrders(projectId: string, signal: AbortSignal): Promise<ProviderOrder[]> {
    const project = z
      .object({ id: Identifier, name: z.string() })
      .safeParse(await this.request(`integration/project/${Identifier.parse(projectId)}`, signal));
    if (!project.success || project.data.id !== projectId)
      throw new ProviderError('provider_contract');
    const result: ProviderOrder[] = [];
    for (let page = 1; page <= 20; page++) {
      const query = new URLSearchParams({
        'pageOptions[page]': String(page),
        'pageOptions[take]': '50',
        'pageOptions[search]': project.data.name,
        'pageOptions[orderBy]': 'createdAt',
        'pageOptions[orderDirection]': 'desc',
      });
      const rows = z
        .array(Order)
        .safeParse(await this.request(`integration/orders?${query}`, signal));
      if (!rows.success) throw new ProviderError('provider_contract');
      result.push(...rows.data.filter((row) => row.projectId === projectId));
      if (rows.data.length < 50) return result;
    }
    throw new ProviderError('provider_contract');
  }
}
