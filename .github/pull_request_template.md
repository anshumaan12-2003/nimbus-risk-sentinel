## What and why

<!-- What changes, and what problem it solves. Link an issue if there is one: "Closes #123". -->

## How it was checked

- [ ] Backend: `ruff check` and `pytest -q`
- [ ] Frontend: `npm run lint` and `npm test`
- [ ] Browser flows (`npx playwright test --project=flows --no-deps`) if pages or flows changed
- [ ] Visual baselines regenerated in CI if the UI changed on purpose
- [ ] Migration added (and downgrades) if the database changed

## Screenshots

<!-- For UI changes: before / after. -->
