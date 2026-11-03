import { resolve } from 'node:path';
import { z } from 'zod';

const Port = z.coerce.number().int().min(1).max(65535);
const HttpUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  });

/** Resolve process configuration once. Keys stay on the Node side of the API. */
export function configuration(environment: NodeJS.ProcessEnv, projectRoot: string) {
  const parsed = z
    .object({
      PORT: Port.default(4310),
      HOST: z.string().min(1).default('127.0.0.1'),
      DATA_DIR: z.string().min(1).default('.data'),
      DETECTOR_URL: HttpUrl.default('http://127.0.0.1:4312'),
      OLLANG_API_KEY: z.string().optional(),
    })
    .safeParse(environment);
  if (!parsed.success) {
    // Zod diagnostics can include input values. Report names, never env contents.
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ');
    throw new Error(`Invalid configuration: ${names}. See docs/configuration.md.`);
  }
  const values = parsed.data;
  return {
    port: values.PORT,
    host: values.HOST,
    app: {
      dataDir: resolve(projectRoot, values.DATA_DIR),
      staticDir: resolve(projectRoot, 'dist'),
      detectorUrl: values.DETECTOR_URL.replace(/\/$/, ''),
      apiKey: values.OLLANG_API_KEY,
    },
  };
}
