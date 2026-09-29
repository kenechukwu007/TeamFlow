import { resolve } from 'node:path';
import { Database } from './database';

const tables = {
  users: ['id', 'name', 'email', 'password_hash'],
  projects: ['id', 'name', 'description', 'created_at'],
  tickets: [
    'id',
    'project_id',
    'title',
    'description',
    'status',
    'priority',
    'assignee_id',
    'created_at',
    'updated_at',
  ],
  comments: ['id', 'ticket_id', 'user_id', 'body', 'created_at'],
  activity: ['id', 'actor_id', 'message', 'created_at'],
} as const;

// SQLite is used only by this one-time importer. The application uses PostgreSQL exclusively.
export async function importSqlite(db: Database, filename: string) {
  const { DatabaseSync } = await import('node:sqlite');
  const source = new DatabaseSync(filename, { readOnly: true });
  try {
    const counts: Record<string, number> = {};
    await db.transaction(async () => {
      await db.run('SELECT pg_advisory_xact_lock(742020)');
      // Block app writes during the import and never merge or overwrite an existing workspace.
      await db.run(
        'LOCK TABLE users,projects,tickets,comments,activity,sessions IN ACCESS EXCLUSIVE MODE',
      );
      for (const table of [...Object.keys(tables), 'sessions']) {
        if (await db.get(`SELECT 1 FROM ${table} LIMIT 1`)) {
          throw new Error(
            `PostgreSQL table ${table} is not empty. Import cancelled; no existing data was changed.`,
          );
        }
      }
      source.exec('BEGIN');
      for (const [table, columns] of Object.entries(tables)) {
        // Table/column identifiers are from the fixed allowlist above, never user input.
        const rows = source
          .prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY rowid`)
          .all();
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(',');
        for (const row of rows) {
          await db.run(
            `INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders})`,
            ...columns.map((column) => row[column]),
          );
        }
        counts[table] = rows.length;
        const result = await db.get<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table}`,
        );
        if (result?.count !== rows.length)
          throw new Error(`Row count verification failed for ${table}.`);
      }
      source.exec('COMMIT');
    });
    return counts;
  } finally {
    source.close();
  }
}

async function main() {
  const db = new Database();
  try {
    await db.migrate();
    const file = process.argv[2]
      ? resolve(process.argv[2])
      : resolve(__dirname, '../../../data/teamflow.sqlite');
    const counts = await importSqlite(db, file);
    console.log('Workspace imported and row counts verified:', counts);
    console.log(
      'Your SQLite file was not modified. Sign in again using your existing email and password.',
    );
  } finally {
    await db.onModuleDestroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error('Import failed:', error.message);
    process.exitCode = 1;
  });
