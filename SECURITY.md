# Security policy

Breachpath Cloud Recon reads AWS accounts and can change them after a second person approves, so
security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it,
and what an attacker could do with it.

You'll get a reply within 7 days. Fixes go out as a patch release, and you're credited unless you'd
rather not be.

## Supported versions

Only the latest release on `master` gets security fixes.

## Scope

In scope: the API (`backend/`), the web app (`frontend/`), the CLI (`cli/`) and the deploy config
(`render.yaml`, `infra/`).

Out of scope:
- `infrastructure/terraform/` is **deliberately vulnerable** sample Terraform for the IaC scanner to find.
- The hosted demo runs on a fake AWS account with a published password. Its data is fake and resets;
  report a bug only if it lets you reach something beyond the demo (other services, real AWS, secrets).

## How the project keeps itself honest

Secret scanning with push protection, Dependabot security updates, CodeQL, `pip-audit` and `npm audit`
run on this repository. Design notes are in the README's Security section.
