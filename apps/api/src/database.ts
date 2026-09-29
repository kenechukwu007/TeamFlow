import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { required } from './config';

@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool: Pool;
  // Each async request keeps its own transaction connection. Unrelated requests
  // continue to use the pool, even while another request is inside a transaction.
  private readonly transactionClient = new AsyncLocalStorage<PoolClient>();

  constructor() {
    this.pool = new Pool({
      connectionString: required('DATABASE_URL'),
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
    });
    this.pool.on('error', (error) => console.error('PostgreSQL connection error:', error.message));
  }

  async all<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T[]> {
    const client = this.transactionClient.getStore() || this.pool;
    return (await client.query<T>(sql, params)).rows;
  }
  async get<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T | undefined> {
    return (await this.all<T>(sql, ...params))[0];
  }
  async run(sql: string, ...params: unknown[]) {
    const client = this.transactionClient.getStore() || this.pool;
    return client.query(sql, params);
  }
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionClient.getStore())
      throw new Error('Nested transactions are not supported.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.transactionClient.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async migrate() {
    await this.transaction(async () => {
      // Prevent simultaneous startup processes from applying the same migration.
      await this.run('SELECT pg_advisory_xact_lock(742019)');
      await this.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const directory = resolve(__dirname, '../migrations');
      for (const name of (await readdir(directory))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        const sql = await readFile(resolve(directory, name), 'utf8');
        const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
        const existing = await this.get(
          'SELECT checksum FROM schema_migrations WHERE name=$1',
          name,
        );
        if (existing) {
          if (existing.checksum !== checksum)
            throw new Error(
              `Migration ${name} was changed after application. Add a new migration instead.`,
            );
          continue;
        }
        await this.run(sql);
        await this.run(
          'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
          name,
          checksum,
        );
      }
    });
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
