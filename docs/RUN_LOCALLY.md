# Run TeamFlow locally

Use Git Bash. Your existing database and demo account are ready; you do not need to reinstall or reimport anything.

## 1. Start PostgreSQL in terminal 1

```bash
cd /c/Users/udemy/Desktop/Devops/TeamFlow
npm run db:start
```

Wait for the database-ready message and leave this terminal open.

## 2. Start TeamFlow in terminal 2

```bash
cd /c/Users/udemy/Desktop/Devops/TeamFlow
npm run dev
```

Wait for the backend and Vite startup messages. Leave this terminal open.

## 3. Open the browser and sign in

Open [TeamFlow](http://127.0.0.1:5173), or run this in another Git Bash terminal:

```bash
start http://127.0.0.1:5173
```

- Email: `alex@teamflow.local`
- Password: `TeamFlow-local-2026!`

These are the restored local demo credentials. Your projects and tickets have been retained. Newly registered accounts use their own credentials.

## 4. Optional terminal checks

From another terminal in the project root:

```bash
npm run db:check
curl -I http://127.0.0.1:5173/
curl -i http://127.0.0.1:3000/api/auth/me
```

The website should return HTTP 200. The API returns HTTP 401 because curl is not signed in; this is expected.

| Port | Purpose                                                             |
| ---- | ------------------------------------------------------------------- |
| 5173 | TeamFlow website                                                    |
| 3000 | Node.js backend API                                                 |
| 5432 | PostgreSQL database, accessible through pgAdmin or database clients |

`127.0.0.1` means your own computer. PostgreSQL is not an HTTP website.

## 5. Stop

Press Ctrl+C in terminal 2, then Ctrl+C in terminal 1. If the database terminal was closed unexpectedly, run `npm run db:stop`.

## First-time setup only

Install Node.js 24, then run these commands from a fresh checkout before starting the database:

```bash
npm ci
npm run db:setup
```

The setup writes database connection details into `.env` and the administrator password into `data/postgres-admin.json`. Both are excluded from Git. The application automatically creates its tables and sample workspace on first startup. Do not rerun the SQLite import on an already migrated workspace.

On Linux, use your actual checkout path and open the website manually or with `xdg-open http://127.0.0.1:5173`. The npm commands are the same; do not reuse a Windows PostgreSQL cluster directory on Linux.

## Troubleshooting

- **Cannot connect:** start PostgreSQL first, then the app.
- **Port already in use:** check your open terminals for a running copy before starting another.
- **npm ci / esbuild permission error:** stop the app and database before installing dependencies. Installation is not required for normal startup.
- **Database password:** read `DATABASE_URL` in your local `.env` for pgAdmin. This is separate from the website password.
- **Sign-in fails:** use the demo details above; the randomly generated password from the secret-management version has been replaced.

This is a local learning setup with public demo credentials. Change those credentials and introduce proper secret management before deploying it publicly. Commit `.env.example`, not `.env` or `data/`.
