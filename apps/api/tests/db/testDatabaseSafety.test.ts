import { describe, expect, it } from 'vitest';
import { requireDedicatedTestDatabaseUrl } from '../../src/db/testDatabaseSafety.js';

describe('requireDedicatedTestDatabaseUrl', () => {
  it('requires an explicit database URL', () => {
    expect(() => requireDedicatedTestDatabaseUrl(undefined)).toThrow('TEST_DATABASE_URL is required');
  });

  it('accepts only PostgreSQL URL protocols', () => {
    expect(() => requireDedicatedTestDatabaseUrl('mysql://user:pass@localhost/test_db'))
      .toThrow('must use postgres:// or postgresql://');
  });

  it('accepts database names that clearly start or end with test', () => {
    for (const databaseName of ['test', 'test_bkyexam', 'test-bkyexam', 'bkyexam_test', 'bkyexam-test']) {
      const url = `postgres://user:pass@127.0.0.1:5432/${databaseName}`;
      expect(requireDedicatedTestDatabaseUrl(url)).toBe(url);
    }
  });

  it('rejects development-like names even when test appears in the middle', () => {
    for (const databaseName of ['bkyexam_practice', 'prod_test_backup', 'contest', 'latest']) {
      expect(() => requireDedicatedTestDatabaseUrl(
        `postgres://user:pass@127.0.0.1:5432/${databaseName}`,
      )).toThrow('Refusing to reset non-test database');
    }
  });
});
