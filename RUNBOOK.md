# Breachpath Cloud Recon — Runbook & Completion Roadmap

Version 1.3.0 · Sign-in with roles, four-eyes remediation, live scan progress, phone layout, browser tests
(builds on 1.2.0 frontend release and 1.1.0 real-data release)

---

## Upgrading from 1.2 (do these in order)

1. **Generate a signing key.** The API will not start without one (unless `DEBUG=true`).
   ```bash
   openssl rand -hex 32        # paste into backend/.env as SECRET_KEY=...
   ```
   Also copy the new "Sign-in" block from `backend/.env.example` into your `.env`.
2. **Migrate the database** (adds users, sessions, approval requests, scan progress; safe on your existing `nimbus.db`):
   ```bash
   cd backend && source .venv/bin/activate
   pip install -r requirements-dev.txt      # adds PyJWT + pwdlib[argon2]
   alembic upgrade head
   pytest -q                                # 24 tests
   ```
3. **Point the UI at the proxy.** In `frontend/.env` set `VITE_API_URL=` (empty). The Vite dev server now forwards
   `/api` and `/ws` to the backend, so the browser sees one origin. Then `npm ci`.
4. **Create the first admin** — either open http://localhost:3000 and fill in the setup screen (shown only while
   there are zero users), or from the command line:
   ```bash
   python -m app.cli create-user --email you@example.com --name "Anshumaan" --role admin
   ```
5. **Solo personal account?** With one person you cannot satisfy the two-person rule. Either create a second
   account (e.g. an `approver` login for yourself, used deliberately), or set `REMEDIATION_TWO_PERSON_RULE=false`
   — self-approved changes are then labelled as such in the audit trail.

Scans from 1.2 have no progress record; Scan History shows "ran before per-service progress was recorded" for them.

---

## What's new in 1.3

### Sign-in with roles

| Role | Can |
|---|---|
| viewer | read everything, watch running scans, use the Copilot |
| engineer | + run scans, triage findings, preview fixes, **request** fixes, scan IaC |
| approver | + **approve** or reject fixes (approving is what changes AWS) |
| admin | + add people, change roles, reset passwords, deactivate accounts |

Every `/api/v1` route and the WebSocket require a session. The UI never hides what you can't do; it disables the
control and says why ("Needs the engineer role — you are viewer").

**How sessions work, and why (interview-ready):**

- **Passwords: Argon2id** (`pwdlib`). Memory-hard, OWASP's first choice; `passlib` is unmaintained. Unknown emails
  still run a hash, so response time doesn't reveal which accounts exist.
- **Access token: 15-minute JWT held only in memory.** Never in `localStorage`, so a script injected into the page
  cannot copy a long-lived credential out of storage.
- **Refresh token: random 256-bit value in an httpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`.** Page
  scripts can't read it. Only its SHA-256 is stored, so a database leak doesn't hand out sessions.
- **Rotation + reuse detection.** Every refresh issues a new token. If an old one comes back later than 30 seconds
  after rotation, someone copied it: the whole login's session family is revoked. Two tabs refreshing at the same
  moment within 30 seconds is treated as normal.
- **Instant revocation.** Each request re-reads the user. Role change, password change or deactivation bumps
  `token_version`, so old tokens stop working on the next click, not in 15 minutes.
- **Lockout.** 5 failed sign-ins for an email+IP in 15 minutes locks it for the rest of the window. Identical error
  text for wrong email and wrong password.
- **Guard rails.** Admins can't demote or deactivate themselves; the last active admin can't be removed.
- **Same origin.** The UI calls `/api` on its own origin through the Vite proxy: no CORS configuration, and the
  strict cookie works. WebSockets authenticate with `?token=` (browsers can't set headers on them); the server
  closes with code 4401 on a bad token and the UI refreshes and reconnects.

Known limits (roadmap): the login limiter and Copilot limiter are per-process (move to Redis for multiple API
replicas); no SSO/OIDC yet; no email delivery, so admins hand out one-time passwords.

### Four-eyes remediation

The one-click `/remediation/apply` endpoint is gone.

1. An engineer opens a finding → **Request approval**. Breachpath reads the live resource, freezes the before/after
   preview into the request, and records the engineer's reason.
2. The request appears on **Approvals** (`/approvals`, `g p`), with a count in the sidebar.
3. A **different** approver reads the same preview and clicks **Approve and apply**. Only now does Breachpath change
   AWS, re-read the resource to verify, and store the rollback.
4. The audit trail records both names — `requested_by` and `executed_by` — taken from their sessions, never from
   a string the browser sends. Rejecting requires a note; requesters can withdraw.

Why: a single compromised or careless account should not be able to change production. This is the control
auditors look for (SOC 2 CC8.1 change management).

### Live scan progress, per service and per region

A scan is split into units — rule checks and inventory for each service in each region, plus IAM and S3 once —
that run in parallel (about 19 units for 2 regions). Each unit reports waiting / scanning / done / partly denied /
failed, its duration and finding count.

- The scan window shows the grid filling in, the real percentage, elapsed time and how long the last scan took,
  and lists any permission gaps as they happen.
- The header button shows the live percentage; anyone can click it to watch a running scan.
- Progress is saved on the scan (`GET /scans/{id}/progress`) *and* pushed over the WebSocket. The socket makes it
  instant; the saved copy means a reload, a second tab or a Celery worker in another process all agree.
- Scan History shows the same grid for every past scan as a coverage record.

### Phone layout

Below 900px the sidebar becomes a slide-out drawer (menu button, backdrop, Esc or navigation closes it, 44px tap
targets). Below 640px the header keeps only menu, search, alerts, scan and account. Dialogs and drawers go full
screen; toasts and the bulk-action bar fit the width. A test checks that no main page scrolls sideways at 390px.

### Tests

| Suite | What it proves | Run |
|---|---|---|
| Backend (pytest, 24) | pipeline on a fake AWS account, auth, RBAC, rotation/reuse, lockout, four-eyes, progress grid | `cd backend && pytest -q` |
| Route smoke (Vitest, 14) | every page renders real data without crashing, signed in | API running, then `cd frontend && npm test` |
| Browser flows (Playwright, 7) | sign-in, reload keeps session, sign-out, viewer can't act, live scan grid, four-eyes approval, self-approval blocked, phone drawer + no sideways scroll | `npm run test:e2e` |
| Visual regression (Playwright, 12 × 2 sizes) | sign-in, approvals, settings (both themes), findings, navigation — desktop and Pixel 7 | `npm run test:e2e` |

Playwright starts the fake-AWS API and the UI itself. Point it at your venv's Python:
```bash
cd frontend
NIMBUS_PYTHON=../backend/.venv/bin/python npx playwright test
npx playwright show-report          # diffs for any failed screenshot
```

**Screenshot baselines are OS-specific** (font rendering differs between Linux, macOS and Windows). The committed
baselines are Linux Chromium, matching CI. On your own machine, the first run will report differences: run
`npm run test:visual:update` once to create local baselines, or rely on CI. After an intended UI change, update the
baselines and review the image diffs in the pull request — that review *is* the visual regression check.

Volatile content (random fake-AWS ids, timestamps, live counters, charts) is masked in screenshots so tests only
fail on real layout changes. Fonts are now bundled with the app instead of loaded from Google Fonts, which is what
makes pixel comparison reliable (and removes a third-party request from a security tool).

`.github/workflows/ci.yml` runs all four suites on every push, inside the official Playwright image.

### Also fixed

- **Migration gap:** 1.1 added the `audit_logs` model without a migration. SQLite dev databases got it from
  `create_all()`; Postgres under Docker Compose never had the table. Migration 003 creates it.
- **SSRF:** the Slack webhook test accepted any URL, letting the server call internal addresses (e.g. the EC2
  metadata service). It now only accepts `https://hooks.slack.com/…` and is admin-only.
- IaC "scan a server folder" is admin-only (it reads the API host's filesystem).
- The IaC page and the audit drawer bypassed the shared API client (hard-coded `localhost:8000`, a second
  unauthenticated socket).
- The header user chip, dashboard greeting and "Autonomous Audit · Active" sidebar text were hard-coded. They now
  come from the signed-in user and the real scan schedule.
- The remediation board uses real users as owners instead of made-up team names.
- The Copilot launcher is a real button (keyboard-reachable).

### New files

```
backend/app/auth/security.py, deps.py      hashing, tokens, role dependencies
backend/app/api/routes/auth.py, users.py   sign-in, sessions, user admin
backend/app/models/user.py                 User, RefreshSession
backend/app/models/remediation_request.py  four-eyes requests
backend/app/tasks/progress.py              per service x region progress tracker
backend/app/utils/ratelimit.py             login + Copilot limits
backend/app/cli.py                         create-user / list-users / set-role
backend/alembic/versions/003_*.py          migration (idempotent, SQLite-safe)
backend/tests/test_auth.py                 auth + RBAC tests
frontend/src/auth/                         AuthGate (sign-in/setup screens), store, permissions
frontend/src/pages/Approvals.jsx
frontend/src/components/ScanProgressGrid.jsx, UserMenu.jsx, TeamSettings.jsx
frontend/src/styles/features.css, mobile.css
frontend/e2e/                              Playwright flows + visual specs + baselines
frontend/playwright.config.js
.github/workflows/ci.yml
```

---


## What's new in 1.2 (frontend)

| Feature | Where | Why it matters |
|---|---|---|
| **Assets inventory** | `/assets` | Every discovered resource (EC2, S3, RDS, Lambda, DynamoDB, Secrets, IAM) ranked by exposure, with crown-jewel flags, open findings per asset, detail drawer, CSV export, filters kept in the URL |
| **Real Scan History** | `/scans` | Was hard-coded sample rows. Now real scans, success rate, mean duration, risk trend chart, and a "blind spots" drawer listing every AWS call that was denied |
| **Settings** | `/settings` | AWS connection + per-API permission checks with re-check, scan/remediation/AI/Slack config (read-only by design), data-mode + theme, shortcut list |
| **Notification center** | header bell | Unread count, last 20 real events, click-through to the relevant page, read state persisted |
| **Grounded Copilot chat** | ⌘J drawer, `POST /copilot/chat` | Multi-turn chat answered only from the latest scan's findings; honest factual summary when AI is offline (was a canned reply mentioning a fixed account id) |
| **Real compliance controls** | `/compliance` | Control table from `/compliance/controls` across CIS / SOC 2 / PCI / HIPAA, PASS / FAIL / NOT EVALUATED, link to the failing findings |
| **Shareable deep links** | `/findings/:id`, `/assets?type=s3&exposed=1` | Paste a link to a teammate and they land on the same finding / filtered view |
| **Command palette search** | ⌘K or `/` | Searches live findings and assets by name, ARN or rule id, plus navigation |
| **Keyboard shortcuts** | `g d`, `g f`, `g a`, … `?` | Fast navigation; `?` shows the list |
| **Getting-started checklist** | Dashboard | Connect → grant read access → first scan → AI key; ticks itself off from real backend state |
| **Real identity everywhere** | header, dashboard, dossier, scan modal | Removed every hard-coded account number / region; header pill shows connection health |
| **Data layer** | TanStack Query | Cached, deduped requests; pages refresh themselves when the backend emits `scan.completed` / `remediation.applied` |
| **Performance** | route code-splitting + vendor chunks | App code chunk ~104 KB (was ~985 KB single bundle); charts load only on pages that use them |
| **Resilience & a11y** | everywhere | Uniform loading skeletons / empty / error-with-retry states, 404 page, per-page titles, skip-to-content link, keyboard-operable rows, Esc closes drawers, reduced-motion respected |

### Frontend tests

The smoke suite renders the real `App` on every route against a real API running on a fake AWS account:

```bash
# terminal 1 — API on a moto-backed vulnerable account (no real AWS)
cd backend && python tests/dev_server_fake_aws.py
# terminal 2
cd frontend && npm test          # 13 tests
```

`dev_server_fake_aws.py` is also the easiest way to demo or develop the UI without touching your AWS account.

---

## 0. Do this first: credential hygiene

The original project archive contained `backend/.env` with a live IAM access key, a Gemini API key and a Slack webhook. This release ships **no** `.env`, only `.env.example`.

1. AWS Console → IAM → Users → the user that owns the old key → Security credentials → **Deactivate**, then **Delete** the access key.
2. Google AI Studio → regenerate the Gemini key.
3. Slack → your app → Incoming Webhooks → revoke and recreate the webhook.
4. If the project was ever pushed to GitHub, the keys are in git history. Deleting the file is not enough; rotating the keys is what makes them useless.

---

## 1. What changed and why

### Backend

| Area | Before | After | Why it matters |
|---|---|---|---|
| Findings / stats | Returned every historical scan (21 rows for 2 real issues) | Default `scope=latest` — current posture only; `scope=all` for history | Dashboard numbers now equal reality |
| IAM / S3 scanning | Run once per region → duplicates | Global scanners run once; regions run in parallel | No duplicate findings, faster scans |
| `resource_id` in API | Internal DB UUID | AWS id (ARN / sg-id / instance id); `resource_pk` holds the DB id | Remediation and Copilot receive the real resource |
| Drift | Fingerprint used per-scan UUID → everything "new" every scan | Fingerprint uses stable AWS id | Drift shows actual change |
| Topology / attack graph | Hard-coded sample enterprise | Built from a real inventory snapshot of your account | The core feature is now real |
| Compliance | Hard-coded 82/89/74/86 | Computed per control from the latest scan; controls the scanner could not see are `NOT_EVALUATED` | Scores are defensible |
| Remediation | Reported success even when AWS rejected the call; IAM/RDS never called AWS | Reads live state → mutates → re-reads to verify → stores exact rollback. Writes gated by `REMEDIATION_ENABLED` | A security tool must never claim a fix it did not make |
| Audit trail | In-memory list seeded with a fake entry | `audit_logs` table | Survives restarts; auditable |
| Scan lifecycle | Double-clicks stacked scans; stuck PENDING forever | One scan at a time (409 otherwise); zombies expire after 30 min | Stable scheduling |
| Errors | AccessDenied swallowed → silent empty dashboard | Per-API warnings stored on the scan + `/account/preflight` | You can see what Breachpath is blind to |
| Events | WebSocket path mismatch; `asyncio.run` from a thread never reached clients | Thread-safe bus on `/ws/events`, optional Redis fan-in for Celery | Live feed is real |
| Celery beat | Scheduled a task name that did not exist | `run_full_scan_task` registered; interval schedule | Scheduled scans actually run |
| Credentials | New STS AssumeRole per client | Cached session, auto-refreshing role creds, SSO profile support, ExternalId, adaptive retries | Fewer STS calls, no expiry mid-scan, no throttling failures |
| Slack | Alert on every critical every scan | Alert only on **new** criticals | No alert fatigue |
| New rule | — | EC2-005: instance with a role that still allows IMDSv1 | Common real-world credential-theft path |

### Frontend

- `VITE_DATA_MODE=live|demo`. Live mode **never** substitutes mock data; it shows empty states and an explanation instead.
- Attack Simulator reads `/topology/environment` (your real graph) in live mode.
- Topology page: starting points and blast radius come from the real graph.
- Scan modal tracks the real scan id for up to 10 minutes, attaches to a running scan on 409, uses backend-configured regions.
- Remediation / Copilot / bulk actions show the real error and never celebrate a failed fix.
- Account health banner: backend down, AWS not connected, or which permissions are missing.

### New files

```
backend/app/scanner/inventory.py           full account inventory (one pass)
backend/app/intelligence/graph_builder.py  attack-path construction + pruning
backend/app/intelligence/compliance_map.py rule → control → framework mapping
backend/app/models/inventory.py            InventorySnapshot table
backend/app/utils/events.py                real-time event bus
backend/app/api/routes/account.py          /account/preflight
backend/app/api/deps.py                    "latest completed scan" helper
backend/alembic/versions/002_*.py          migration (idempotent)
backend/tests/test_e2e_moto.py             end-to-end test on a fake AWS account
frontend/src/components/AccountHealthBanner.jsx
frontend/src/data/empty.js
infra/aws/*.json                           trust + remediator IAM policies
docker-compose.yml
```

---

## 2. Local setup (step by step)

### 2.1 Create a read-only scanner identity

**Why:** the scanner should never be able to change anything. Least privilege also means a leaked scanner credential cannot damage the account.

Option A — IAM Identity Center / SSO (recommended):

1. IAM Identity Center → Permission sets → Create → attach AWS managed policies **SecurityAudit** and **ViewOnlyAccess**. Name it `NimbusScanner`.
2. Assign it to your user for your account.
3. On your machine:
   ```bash
   aws configure sso            # profile name: nimbus-scanner
   aws sso login --profile nimbus-scanner
   aws sts get-caller-identity --profile nimbus-scanner
   ```
4. In `backend/.env`: `AWS_PROFILE=nimbus-scanner`

Option B — IAM user with keys (acceptable for a personal account):

1. Create user `nimbus-scanner`, attach **SecurityAudit** + **ViewOnlyAccess**, create one access key.
2. Put the key in `~/.aws/credentials` under `[nimbus-scanner]` (not in `.env`), and set `AWS_PROFILE=nimbus-scanner`.

### 2.2 Backend

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env               # edit AWS_PROFILE, AWS_REGIONS, AI_API_KEY
alembic upgrade head               # creates/updates schema (safe on your old nimbus.db)
pytest -q                          # 24 tests, fake AWS, ~20s
uvicorn app.main:app --reload --port 8000
```

### 2.3 Verify AWS access before scanning

```bash
curl -s localhost:8000/api/v1/account/preflight | python -m json.tool
```

Expect `"connected": true` and `"ready": true`. Any `"ok": false` names the exact API call being denied.

### 2.4 Frontend

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev                         # http://localhost:3000
```

### 2.5 First real scan

Dashboard → **Run scan**. When it completes, check:

```bash
curl -s localhost:8000/api/v1/scans/latest
curl -s localhost:8000/api/v1/scans/<scan_id>/warnings      # what could not be read
curl -s localhost:8000/api/v1/topology/environment | head -c 800
```

Old scans (before this release) have no inventory, so Topology and the Simulator stay empty until the first new scan finishes. Old scans also contain the duplicated IAM rows; the next scan is clean. For a fresh start, delete `nimbus.db` and run `alembic upgrade head`.

### 2.6 Enabling real remediation (optional, deliberate)

1. Keep the scanner read-only. Create a **separate** role `NimbusRemediatorRole` with `infra/aws/remediator-policy.json`.
2. Set `AWS_REMEDIATION_ROLE_ARN` and `REMEDIATION_ENABLED=true`.
3. Always read the dry-run diff first. Every apply stores the rollback in `audit_logs.rollback_command`.

**Why two identities:** if the dashboard or its credentials are compromised, a read-only scanner leaks posture data but cannot change infrastructure. Write power is isolated to seven specific API actions.

### 2.7 Full stack with Docker Compose

```bash
docker compose up --build
```

Runs Postgres, Redis, API (migrates on start), Celery worker, Celery beat, frontend. Your `~/.aws` is mounted read-only so SSO profiles work inside containers.

---

## 3. How the attack graph works (interview-ready explanation)

1. **Inventory** — one pass collects EC2 (public IP, SGs, instance profile, IMDS mode), security groups (world-open ports), RDS, S3 (AWS-evaluated `IsPublic`), Lambda (role, public function URL), DynamoDB, Secrets Manager, and every IAM user/role with all inline + managed policy documents via `GetAccountAuthorizationDetails`.
2. **Edges** — only exploitable relationships:
   - internet → EC2 (public IP + SG open to 0.0.0.0/0), public RDS, public S3, public Lambda URL, IAM user without MFA
   - EC2 → role (instance profile; IMDSv1 makes it trivial), Lambda → execution role
   - principal → data store when its policy allows data actions on that ARN (wildcard-aware)
   - principal → role when `sts:AssumeRole` is allowed **and** the target trust policy trusts it
   - secret → RDS when the secret is the RDS-managed master credential
3. **Crown jewels** — RDS and DynamoDB always; S3 when tagged (`data-classification`, …) or named like `prod/finance/customer/…` (configurable).
4. **Finding linkage** — each edge carries the id of the finding whose fix severs it, so the Simulator's greedy fix plan maps to real remediation.
5. **Pruning** — only nodes on a path from the internet or toward a crown jewel are shown (max 10 per layer), so a 500-resource account stays readable.

**Known limits (v1, deliberate):** Deny statements, conditions, SCPs, permission boundaries and most resource policies are ignored. Paths are therefore an upper bound ("could reach"). For prioritisation, over-reporting is the safer error.

---

## 4. Completion roadmap

### Phase 1 — Real data (done in this release)

Everything in section 1.

### Phase 2 — Production backbone (2–3 weeks)

| Task | Why |
|---|---|
| ~~JWT + roles viewer / engineer / approver / admin~~ **done in 1.3** | Remediation has a real, attributable actor |
| ~~Approver role + second person for apply~~ **done in 1.3** | Four-eyes principle for production changes |
| OIDC / SSO (Cognito, Auth0, Google Workspace) on top of the 1.3 session model | Companies won't manage separate passwords |
| Move rate limits to Redis | Limits hold across several API replicas |
| Persist the remediation board (column, owner) server-side | Today it lives in each browser |
| Change scan counters from `String` to `Integer` (migration 003) | Correct sorting and aggregation in SQL |
| Store a `fingerprint` column on findings + unique index `(scan_id, fingerprint)` | Faster drift, carry-over and dedupe queries |
| Rate-limit `/scans/trigger` (Copilot is limited since 1.3) | AWS API quotas |
| ~~GitHub Actions: pytest, build, Vitest, Playwright~~ **done in 1.3**; add `ruff` + Docker build | Every push proves the pipeline still works |
| Structured JSON logging + request ids | Debuggable in production |

### Phase 3 — Detection depth (3–4 weeks)

| Task | Why |
|---|---|
| CloudTrail enabled / multi-region / log validation; CloudWatch metric filters (CIS section 3–4) | Largest missing CIS section today |
| KMS key rotation, EBS encryption-by-default, VPC flow logs, default SG restricted | Common CIS failures, cheap checks |
| Ingest GuardDuty + Security Hub + IAM Access Analyzer findings | Leverage AWS-native detection instead of re-implementing it |
| Graph: evaluate Deny, conditions, permission boundaries, SCPs | Fewer false paths |
| Multi-account via AWS Organizations (assume `NimbusScannerRole` in each account) | How CSPMs are used in real companies |
| Load-test on a 1,000+ resource account; paginate inventory per service | Proves scale claims |

### Phase 4 — Event-driven + polish (2–3 weeks)

| Task | Why |
|---|---|
| EventBridge rule on CloudTrail write events → SQS → targeted rescan of the changed resource | Near-real-time drift instead of polling every N minutes |
| OpenTelemetry traces across API → Celery → AWS calls | Observability story for interviews |
| PDF/CSV executive report from real data | Stakeholder deliverable |
| Deploy: ECS Fargate + RDS Postgres + ElastiCache via Terraform; Breachpath scans its own account | End-to-end cloud ownership |
| GCP (Security Command Center API, Cloud Asset Inventory) | Only after AWS is solid |

---

## 5. Verification checklist

- [ ] Old AWS key deleted; new creds are SSO/profile-based
- [ ] `/account/preflight` → `ready: true`
- [ ] Scan completes; `/scans/{id}/warnings` empty or understood
- [ ] Dashboard total equals `/findings/stats` total (no duplicates)
- [ ] Simulator shows your real resources, or "No exposed paths found"
- [ ] Second scan with no changes → Drift `new_count: 0`
- [ ] Remediation button disabled with a clear reason while `REMEDIATION_ENABLED=false`
- [ ] `SECRET_KEY` generated; API starts with `DEBUG=false`
- [ ] First admin created; a viewer account sees a disabled **Run Scan** with a reason
- [ ] Engineer requests a fix → a different approver approves it → audit trail shows both emails
- [ ] Scan window fills in per service and region; Scan History shows the grid afterwards
- [ ] App usable on a phone (menu button opens the drawer)
- [ ] `pytest -q` 24 passed · `npm test` 14 passed · `npx playwright test` 19 passed
