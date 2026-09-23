# Smart Billing

Multi-tenant invoicing, quotation, and receipt platform, built for Aurae Software
Solutions LLP under SOW `TN_OS2_26-27-XX`.

This is a working scaffold, not a finished product — every feature named in
the proposal and SOW is implemented and testable end to end; UI polish,
payment-gateway integration, and production hardening are the next pass.

## What's built

| Proposal / SOW item | Where |
|---|---|
| Document generation — invoice/quotation/receipt, numbering, PDF export | `backend/app/api/v1/endpoints/{invoices,quotations,receipts}.py`, `backend/app/services/{numbering,pdf}.py` |
| Document status tracking (draft → sent → viewed/paid/cancelled, quote accept/decline) | `PATCH /invoices/{id}/status`, `PATCH /quotations/{id}/status`, buttons in `SuperAdminDashboard.tsx` |
| Quotation → invoice conversion | `POST /quotations/{id}/convert` |
| Multi-tenant roles (Supreme Admin / Super Admin / tenant user) | `backend/app/models/user.py`, enforced tenant-scoping in every endpoint via `api/deps.py` |
| Super Admin manages tenant's own staff | `backend/app/api/v1/endpoints/users.py`, `frontend/src/pages/Settings.tsx` |
| Device-bound authentication, Supreme-Admin-only device log, suspend (SOW 3.3) | `backend/app/services/device_binding.py`, `backend/app/api/v1/endpoints/{auth,admin,account}.py`, `frontend/src/pages/SupremeAdminDashboard.tsx` |
| Branding captured at subscription, editable afterward (SOW 3.4) | `backend/app/api/v1/endpoints/subscription.py` (`/{tenant_id}/branding` at signup, `/branding` for later edits), `frontend/src/pages/{Subscribe*,Settings}.tsx` |
| Offline document history (SOW 3.5) | `frontend/src/lib/offlineStore.ts`, `frontend/src/components/SyncStatusBadge.tsx` |
| PWA — installable, offline shell (SOW 3.6) | `frontend/vite.config.ts` (`vite-plugin-pwa`) |
| Admin dashboards — platform analytics for Aurae, tenant analytics per client | `backend/app/api/v1/endpoints/analytics.py`, "Overview" tab in both dashboards |

## Structure

```
smart-billing/
  backend/      FastAPI + PostgreSQL + Alembic
  frontend/     React + Vite + TypeScript, PWA
```

## Running locally

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit DATABASE_URL / SECRET_KEY for your machine
alembic upgrade head
python scripts/create_supreme_admin.py --email you@aurae.com --name "Aurae Admin" --password "change-me"
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

App: http://localhost:5173 — sign in with the Supreme Admin account created
above, or visit `/subscribe` to onboard a tenant (Super Admin) end to end.

## Known gaps to close before go-live

- Object storage for branding uploads (currently local disk — fine for a
  single Railway instance, not for horizontal scaling).
- Payment gateway integration (Razorpay/Billplz) beyond recording a receipt manually.
- Automated tests (the scaffold has been smoke-tested by hand: backend routes
  verified to import and mount, frontend type-checks and builds; no test suite yet).
- Editing a draft invoice/quotation after creation (currently create-once;
  status can change, line items cannot).
- A scheduled job to flip invoices to OVERDUE by due_date (the status model
  supports it — see `InvoiceStatus` — nothing sets it automatically yet).
- Document numbering *settings* UI (prefix/reset rules) — the engine in
  `services/numbering.py` supports per-tenant config, no screen edits it yet.
- Production-grade, designer-built PDF templates (current renderer is
  functional and on-brand-capable, not a polished layout).
- Push notifications (listed as optional/Phase 2 in the proposal — not built).

See `DEPLOYMENT.md` for pushing this to GitHub and deploying to Railway.
