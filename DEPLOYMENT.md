# Deployment guide — Git & Railway

This repo has two deployable services: `backend/` (FastAPI + Postgres) and
`frontend/` (static React build). Deploy them as two separate Railway
services in one Railway project, both pointed at this one GitHub repo with
different root directories.

## 1. Push to GitHub (OneStopSolution2025 org)

From inside `smart-billing/` (already a git repo with an initial commit):

```bash
# Create the repo under the org first (web UI: github.com/organizations/OneStopSolution2025/repositories/new)
# or with the GitHub CLI:
gh repo create OneStopSolution2025/smart-billing --private --source=. --remote=origin

# If you created it on the web instead, just add the remote:
git remote add origin git@github.com:OneStopSolution2025/smart-billing.git

git branch -M main
git push -u origin main
```

From here on, every `git push` to `main` is what Railway redeploys from
(once the services are connected — step 2).

## 2. Railway project setup

Create one Railway project for Smart Billing, then add three services inside it:

### a. PostgreSQL

Railway dashboard → **New** → **Database** → **PostgreSQL**. Railway sets
`DATABASE_URL` on that plugin automatically; you'll reference it from the
backend service in step (b).

### b. Backend service (`backend/`)

Railway dashboard → **New** → **GitHub Repo** → select `smart-billing` →
after it's created, open the service **Settings**:

- **Root Directory**: `backend`
- **Build**: Nixpacks (default) — `railway.json` in `backend/` already sets
  the start command (`alembic upgrade head && uvicorn app.main:app …`), so
  migrations run automatically on every deploy.

**Variables** (service → Variables tab):

| Key | Value |
|---|---|
| `DATABASE_URL` | Reference the Postgres plugin's `DATABASE_URL` (Railway lets you pick "Add reference" to the Postgres service — do that rather than pasting the value, so it stays in sync) |
| `SECRET_KEY` | Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` — do this once, keep it stable (rotating it logs everyone out) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` |
| `ALGORITHM` | `HS256` |
| `CORS_ORIGINS` | The frontend's Railway URL once you have it, e.g. `https://smart-billing-frontend.up.railway.app` (comma-separate if you add a custom domain later) |
| `UPLOAD_DIR` | `/data/uploads` (see the volume note below) |

**Volume for uploads**: branding images and any local file storage need to
survive redeploys. Add a Railway **Volume** to this service, mounted at
`/data`, and keep `UPLOAD_DIR=/data/uploads`. Without a volume, uploaded
logos/headers/footers are lost on every redeploy — fine for testing, not for
production. (Longer-term, per the README's known gaps, swap this for S3-
compatible object storage instead of a volume.)

Once deployed, create the first Supreme Admin account from the service's
shell (Railway dashboard → service → **⋮** → **Run a command**, or
`railway run` from the CLI in `backend/`):

```bash
python scripts/create_supreme_admin.py --email you@aurae.com --name "Aurae Admin" --password "set-a-real-password"
```

### c. Frontend service (`frontend/`)

Railway dashboard → **New** → **GitHub Repo** → same repo again → **Settings**:

- **Root Directory**: `frontend`
- **Build**: Nixpacks — `railway.json` in `frontend/` sets the build
  (`npm install && npm run build`) and start command (`npm run start`, which
  serves the built `dist/` with `serve -s`).

**Variables**:

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | The backend service's public URL + `/api/v1`, e.g. `https://smart-billing-api.up.railway.app/api/v1` |

Redeploy the frontend after setting this (Vite bakes env vars in at build
time, so it must be set before the build runs, not just at runtime).

Then go back to the **backend** service's `CORS_ORIGINS` variable and set it
to this frontend's actual Railway URL, and redeploy the backend once more.

## 3. Custom domain (optional)

Railway → service → **Settings** → **Networking** → **Custom Domain**, for
both services, once Aurae has a domain/subdomain ready (e.g.
`billing.aurae.example` for the frontend, `api.billing.aurae.example` for the
backend). Update `CORS_ORIGINS` and `VITE_API_BASE_URL` to match, redeploy both.

## 4. Ongoing deploys

With both services connected to the GitHub repo, every `git push origin main`
triggers Railway to rebuild and redeploy automatically — the backend reruns
`alembic upgrade head` on each deploy, so new migrations ship themselves.

For a feature branch you don't want auto-deployed, push to a branch other
than `main` and open a PR; Railway only tracks the branch you configured
per-service (default `main`) unless you turn on PR environments.
