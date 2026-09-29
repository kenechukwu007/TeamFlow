import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const cluster = join(root, 'data', 'postgres');
export const adminFile = join(root, 'data', 'postgres-admin.json');
dotenv.config({ path: join(root, '.env'), quiet: true });
export const exec = promisify(execFile);

export async function binaries() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const native = await import(`@embedded-postgres/${platform}-${process.arch}`);
  return {
    ...native,
    pgCtl: join(dirname(native.postgres), process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
  };
}
export function localSettings() {
  if (!process.env.DATABASE_URL) throw new Error('Run npm run db:setup first.');
  const url = new URL(process.env.DATABASE_URL);
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/teamflow' ||
    decodeURIComponent(url.username) !== 'teamflow'
  ) {
    throw new Error(
      'The local launcher requires DATABASE_URL for teamflow@127.0.0.1/teamflow. For an external server, start PostgreSQL using its own tools.',
    );
  }
  if (url.search)
    throw new Error('The local launcher does not accept connection URL query parameters.');
  const port = Number(url.port || 5432);
  if (!url.password || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid local DATABASE_URL.');
  return { port, password: decodeURIComponent(url.password) };
}
export async function readAdmin() {
  const admin = JSON.parse(await readFile(adminFile, 'utf8'));
  if (!admin.password)
    throw new Error('Missing local database administrator password. Run npm run db:setup.');
  return admin;
}
export async function stopLocal() {
  const { pgCtl } = await binaries();
  try {
    await exec(pgCtl, ['-D', cluster, 'status'], { windowsHide: true, timeout: 10000 });
  } catch (error) {
    if (error.code === 3) return;
    throw error;
  }
  await exec(pgCtl, ['-D', cluster, '-m', 'fast', '-w', 'stop'], {
    windowsHide: true,
    timeout: 30000,
  });
}
