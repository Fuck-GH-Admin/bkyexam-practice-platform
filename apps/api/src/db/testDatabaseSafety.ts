export function requireDedicatedTestDatabaseUrl(
  value: string | undefined,
  variableName = 'TEST_DATABASE_URL',
): string {
  if (!value) {
    throw new Error(`${variableName} is required.`);
  }

  const parsed = new URL(value);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`${variableName} must use postgres:// or postgresql://.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  const safeName = databaseName === 'test'
    || databaseName.startsWith('test_')
    || databaseName.startsWith('test-')
    || databaseName.endsWith('_test')
    || databaseName.endsWith('-test');
  if (!safeName) {
    throw new Error(`Refusing to reset non-test database "${databaseName}".`);
  }

  return value;
}
