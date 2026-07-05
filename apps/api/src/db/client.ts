import { Pool } from 'pg';

export interface QueryClient {
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
}

export interface PgPool {
  connect(): Promise<QueryClient & { release(): void }>;
  end(): Promise<void>;
}

export function createPgPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}
