import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.git',
  'artifacts',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const allowedEnvOnlyKeys = new Set([
  'ADMIN_BOOTSTRAP_DISPLAY_NAME',
  'ADMIN_BOOTSTRAP_LOGIN_NAME',
  'ADMIN_BOOTSTRAP_PASSWORD',
  'STUDENT_MIGRATION_TEMP_PASSWORD',
]);

const failures = [];
const checks = [];

await checkMarkdownLinks();
await checkRuntimeEnvironmentTemplate();
await checkApiRouteDocumentation();
await checkMigrationDocumentation();

if (failures.length > 0) {
  console.error(`Documentation consistency audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Documentation consistency audit passed.');
}

for (const check of checks) {
  console.log(`- ${check}`);
}

async function checkMarkdownLinks() {
  const markdownFiles = await walkMarkdownFiles(root);
  let localLinkCount = 0;

  for (const filePath of markdownFiles) {
    const markdown = await readFile(filePath, 'utf8');
    const linkPattern = /(?<!!)\[[^\]]*]\(([^)]+)\)/g;

    for (const match of markdown.matchAll(linkPattern)) {
      let target = match[1].trim();
      if (target.startsWith('<') && target.endsWith('>')) {
        target = target.slice(1, -1);
      }
      target = target.split(/\s+/u, 1)[0];

      if (
        target.length === 0
        || target.startsWith('#')
        || target.startsWith('http://')
        || target.startsWith('https://')
        || target.startsWith('mailto:')
      ) {
        continue;
      }

      localLinkCount += 1;
      const decodedTarget = decodeURIComponent(target.split('#', 1)[0]);
      const resolvedTarget = resolve(dirname(filePath), decodedTarget);
      if (!(await exists(resolvedTarget))) {
        failures.push(`${displayPath(filePath)} links to missing local target ${target}`);
      }
    }
  }

  checks.push(`${markdownFiles.length} Markdown files scanned; ${localLinkCount} local links resolved`);
}

async function checkRuntimeEnvironmentTemplate() {
  const configSource = await readFile(resolve(root, 'apps/api/src/config.ts'), 'utf8');
  const envExample = await readFile(resolve(root, '.env.example'), 'utf8');
  const runtimeKeys = [];
  let inSchema = false;

  for (const line of configSource.split(/\r?\n/u)) {
    if (line.includes('const configSchema = z.object({')) {
      inSchema = true;
      continue;
    }
    if (inSchema && line.startsWith('});')) {
      break;
    }
    const match = line.match(/^\s{2}([A-Z][A-Z0-9_]+):/u);
    if (inSchema && match) {
      runtimeKeys.push(match[1]);
    }
  }

  const exampleKeys = envExample
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=', 1)[0]);

  for (const key of runtimeKeys) {
    if (!exampleKeys.includes(key)) {
      failures.push(`.env.example is missing runtime config key ${key}`);
    }
  }

  for (const key of exampleKeys) {
    if (!runtimeKeys.includes(key) && !allowedEnvOnlyKeys.has(key)) {
      failures.push(`.env.example contains unexplained non-runtime key ${key}`);
    }
  }

  checks.push(`${runtimeKeys.length} runtime config keys represented in .env.example`);
}

async function checkApiRouteDocumentation() {
  const routeDirectory = resolve(root, 'apps/api/src/routes');
  const routeFiles = (await readdir(routeDirectory))
    .filter((fileName) => fileName.endsWith('.ts'));
  const apiDocumentation = await readFile(resolve(root, 'docs/api.md'), 'utf8');
  const routes = [];

  for (const fileName of routeFiles) {
    const source = await readFile(resolve(routeDirectory, fileName), 'utf8');
    const routePattern = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(routePattern)) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
      });
    }
  }

  for (const route of routes) {
    const heading = `### \`${route.method} ${route.path}\``;
    if (!apiDocumentation.includes(heading)) {
      failures.push(`docs/api.md is missing route heading ${route.method} ${route.path}`);
    }
  }

  checks.push(`${routes.length} Fastify routes have exact method/path headings in docs/api.md`);
}

async function checkMigrationDocumentation() {
  const migrationDirectory = resolve(root, 'apps/api/src/db/migrations');
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
  const databaseDocumentation = await readFile(resolve(root, 'docs/database.md'), 'utf8');

  for (const fileName of migrationFiles) {
    if (!databaseDocumentation.includes(fileName)) {
      failures.push(`docs/database.md does not mention migration ${fileName}`);
    }
  }

  checks.push(`${migrationFiles.length} SQL migrations represented in docs/database.md`);
}

async function walkMarkdownFiles(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        results.push(...await walkMarkdownFiles(resolve(directory, entry.name)));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(resolve(directory, entry.name));
    }
  }
  return results;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function displayPath(path) {
  return relative(root, path).replaceAll('\\', '/');
}
