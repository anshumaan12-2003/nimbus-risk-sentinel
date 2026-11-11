# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Run it locally (no AWS account needed)

```bash
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && python tests/dev_server_fake_aws.py   # API on :8000, fake AWS
```

```bash
cd frontend && npm ci && API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev   # UI on :3000
```

Sign in as `admin@breachpath.local` / `breachpath-demo-password`.

## Before opening a pull request

| What | Command |
|---|---|
| Backend lint + tests | `cd backend && ruff check app tests && pytest -q` |
| Frontend lint + unit tests | `cd frontend && npm run lint && npm test` |
| Browser flows + accessibility | `cd frontend && npx playwright test --project=flows --no-deps` |

CI runs all of these plus visual regression, migrations on Postgres and Docker builds.

**Changed the UI on purpose?** Screenshots must come from CI's Linux image (a Mac renders fonts
differently). Run the *Update visual baselines* workflow on your branch, download the
`visual-baselines` artifact into `frontend/e2e/__screenshots__/`, check the images and commit them.

## Style

- Small, focused pull requests with a description of *why*.
- New behaviour comes with a test. Bugs come with a test that fails before the fix.
- Database changes need an Alembic migration that also downgrades.
- Plain words in the UI: say what happened and what to do next.
