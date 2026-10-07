import { NestFactory } from '@nestjs/core';
import { AppModule, configure } from './app';
import { Database } from './database';
import { seed } from './seed';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configure(app);
  try {
    const db = app.get(Database);
    await db.migrate();
    // Avoid filling PostgreSQL with demo records before an existing workspace is imported.
    if (
      process.env.NODE_ENV !== 'test' &&
      existsSync(resolve(__dirname, '../../../data/teamflow.sqlite')) &&
      process.env.SEED_DEMO !== 'false' &&
      !(await db.get('SELECT id FROM users LIMIT 1'))
    ) {
      throw new Error(
        'Existing SQLite workspace found. Run npm run db:import:sqlite before starting the app, or set SEED_DEMO=false to start with an empty PostgreSQL workspace.',
      );
    }
    await seed(db);
    app.enableShutdownHooks();
    await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
  } catch (error) {
    await app.close();
    throw error;
  }
}
bootstrap().catch((error) => {
  console.error('Startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
