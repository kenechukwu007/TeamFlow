import { access, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { root, cluster, localSettings, readAdmin, binaries, exec, stopLocal } from './local-db.mjs';

let running = false,
  stopping = false,
  keepAlive;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(keepAlive);
  if (running) {
    try {
      await stopLocal();
      console.log('PostgreSQL stopped. Your data is saved.');
    } catch {
      console.error('Could not stop PostgreSQL. Run npm run db:stop.');
      process.exitCode = 1;
    }
    running = false;
  }
}
async function main() {
  const { port, password } = localSettings();
  const admin = await readAdmin();
  const { initdb, pgCtl } = await binaries();
  // Never attach this launcher to, or stop, an unrelated PostgreSQL instance.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(
        new Error(
          `Port ${port} is already in use. If this is TeamFlow's database, keep it running; otherwise use a different port in both database URLs.`,
        ),
      ),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  await mkdir(join(root, 'data'), { recursive: true });
  const initialized = await access(join(cluster, 'PG_VERSION')).then(
    () => true,
    () => false,
  );
  if (!initialized) {
    const passwordFile = join(root, 'data', 'postgres-init-password');
    await writeFile(passwordFile, admin.password + '\n', { mode: 0o600, flag: 'wx' });
    try {
      console.log('Initializing PostgreSQL (first run only)…');
      await exec(
        initdb,
        [
          '-D',
          cluster,
          '-U',
          'postgres',
          '--auth=scram-sha-256',
          `--pwfile=${passwordFile}`,
          '--encoding=UTF8',
          '--locale=C',
        ],
        { windowsHide: true, timeout: 60000 },
      );
    } finally {
      await unlink(passwordFile);
    }
  }
  const startArguments = [
    '-D',
    cluster,
    '-l',
    join(root, 'data', 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    'start',
  ];
  // PostgreSQL outlives pg_ctl. Do not give the server inherited output pipes:
  // on Windows those can keep execFile waiting even after pg_ctl has exited.
  await new Promise((resolve, reject) => {
    const child = spawn(pgCtl, startArguments, { windowsHide: true, stdio: 'ignore' });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('PostgreSQL startup timed out. Check data/postgres.log.'));
    }, 60000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error('PostgreSQL could not start. Check data/postgres.log.'));
    });
  });
  running = true;
  const client = new pg.Client({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: admin.password,
    database: 'postgres',
  });
  try {
    await client.connect();
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='teamflow'")).rowCount) {
      await client.query(
        `CREATE ROLE teamflow LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${client.escapeLiteral(password)}`,
      );
    }
    for (const name of ['teamflow', 'teamflow_test']) {
      if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount) {
        await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)} OWNER teamflow`);
      }
    }
    console.log(
      `PostgreSQL ${(await client.query('SHOW server_version')).rows[0].server_version} is ready on 127.0.0.1:${port}.`,
    );
    console.log('Databases: teamflow and teamflow_test. App role: teamflow (not a superuser).');
    console.log(
      'Keep this terminal open. Press Ctrl+C to stop. Start the app in another terminal.',
    );
  } finally {
    await client.end();
  }
  keepAlive = setInterval(() => {}, 60000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
main().catch(async (error) => {
  console.error('PostgreSQL startup failed:', error.message);
  await shutdown();
  process.exitCode = 1;
});
