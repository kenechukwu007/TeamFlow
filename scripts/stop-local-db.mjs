import { stopLocal } from './local-db.mjs';
stopLocal()
  .then(() => console.log('TeamFlow PostgreSQL stopped.'))
  .catch(() => {
    console.error(
      'PostgreSQL could not be stopped. It may already be stopped. Check data/postgres.log if needed.',
    );
    process.exitCode = 1;
  });
