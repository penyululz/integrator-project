# Demo Assets (Screenshots and Walkthroughs)

This folder is reserved for launch/demo assets used in README pages, release notes, and community posts.

Primary documentation hub:

- [`README.md`](../../../README.md)

## Suggested Structure

- `screenshots/`
  - `01-login.png`
  - `02-onboarding.png`
  - `03-integrations.png`
  - `04-workflow-template.png`
  - `05-workflow-builder.png`
  - `06-runs.png`
  - `07-dashboard.png`
  - `08-alert-settings.png`
  - `09-audit-logs.png`
- `walkthrough/`
  - optional short GIF/MP4 clips for first-success flow

## Capture Guidance

- Use local demo seed account:
  - `admin@example.com`
  - `dev-password`
  - org `demo-org`, workspace `default`
- Keep browser width consistent (for example 1440px) for comparable screenshots.
- Capture after at least one run is created so dashboard/runs/audit data are visible.
- Never include secrets, real tokens, or private endpoint URLs in captures.

## Suggested Capture Order

1. Login
2. Onboarding checklist
3. Integrations connection state
4. Template selection in Workflows
5. Workflow builder/validation success
6. Runs detail (timeline/retry/delay)
7. Dashboard metrics
8. Alert settings + test delivery log
9. Audit logs filter + detail

## README Embedding Snippet

```md
## Product Screenshots
![Onboarding](./demo-assets/screenshots/02-onboarding.png)
![Workflow Builder](./demo-assets/screenshots/05-workflow-builder.png)
![Runs](./demo-assets/screenshots/06-runs.png)
```
