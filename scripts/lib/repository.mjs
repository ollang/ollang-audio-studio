/** Single source for the public package and its documentation checks. */
export const publicDocs = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'MEDIA_NOTICE.md',
  'docs/getting-started.md',
  'docs/usage.md',
  'docs/demo.md',
  'docs/integration.md',
  'docs/configuration.md',
  'docs/architecture.md',
  'docs/api.md',
  'docs/development.md',
  'docs/testing.md',
  'docs/troubleshooting.md',
  'docs/ollang.md',
  'docs/localization.md',
  'docs/provider-recovery.md',
  'docs/agent-runbook.md',
  'docs/maintainer-checklist.md',
  'docs/dependency-maintenance.md',
  'examples/README.md',
  'fixtures/README.md',
  'public/samples/conversations/README.md',
];
export const exportDirectories = [
  '.github',
  'src',
  'server',
  'shared',
  'migrations',
  'locales',
  'fixtures',
  'public',
  'audio-service',
  'scripts',
  'examples',
  'tests',
];
export const exportFiles = [
  // Recursive directories below already carry their nested Markdown files.
  ...publicDocs.filter(
    (file) => !exportDirectories.some((directory) => file.startsWith(`${directory}/`)),
  ),
  '.env.example',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.gitattributes',
  '.nvmrc',
  '.prettierrc.json',
  '.prettierignore',
  'Dockerfile',
  'compose.yaml',
  'compose.dev.yaml',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'eslint.config.mjs',
  'index.html',
  'docs/images/studio.jpg',
  'docs/images/studio-workflow-half-speed-960x820.gif',
];
const excluded = new Set([
  '.git',
  '.data',
  '.cache',
  '.venv',
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.DS_Store',
]);
/** @param {string} name */
export function isPrivateFile(name) {
  return (
    excluded.has(name) ||
    (name.startsWith('.env') && name !== '.env.example') ||
    /\.(?:sqlite|db)(?:-(?:wal|shm))?$|\.(?:pem|key|pyc|tmp)$/.test(name)
  );
}
