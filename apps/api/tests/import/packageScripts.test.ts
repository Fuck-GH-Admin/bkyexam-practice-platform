import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('import package scripts', () => {
  it('runs the summary importer without a hardcoded source corpus path', async () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['import:summary']).toBe('tsx src/import/loadQuestionBank.ts');
  });
});
