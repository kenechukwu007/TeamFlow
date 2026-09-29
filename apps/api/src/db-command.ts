import { Database } from './database';

async function main() {
  const db = new Database();
  try {
    if (process.argv[2] === 'migrate') {
      await db.migrate();
      console.log('PostgreSQL migrations are up to date.');
    } else {
      const result = await db.get(
        'SELECT current_database() AS database, current_user AS username, version() AS version',
      );
      console.log('PostgreSQL connection successful:', result);
    }
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch((error) => {
  console.error('Database command failed:', error.message);
  process.exitCode = 1;
});
