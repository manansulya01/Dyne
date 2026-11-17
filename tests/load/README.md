# Dyne load testing

Use this k6 scenario against a **staging deployment with synthetic test accounts and non-production data**. Do not run the 3,300-VU profile against the live school deployment without an agreed test window and provider capacity review.

## Prerequisites

- Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
- Deploy the candidate branch to a staging/preview environment.
- Create synthetic test accounts and sign in to obtain their `dyne_session` cookie values.
- For the smoke profile, one dedicated test session can be supplied with `DYNE_SESSION_COOKIE`.
- For the 3,300-VU profile, create a local JSON file containing at least 3,300 distinct session-cookie strings (one per synthetic account), and set `DYNE_SESSION_COOKIES_FILE` to that file. The script refuses the full profile with a single shared session.
- Confirm that the test database contains no real student data and that R2 uses a test bucket.

## Smoke profile

macOS/Linux:

```bash
DYNE_BASE_URL=https://your-staging-host.example DYNE_SESSION_COOKIE='test-session-value' k6 run tests/load/dyne.js
```

PowerShell:

```powershell
$env:DYNE_BASE_URL = "https://your-staging-host.example"
$env:DYNE_SESSION_COOKIE = "test-session-value"
k6 run tests/load/dyne.js
```

The default profile ramps to 100 virtual users. Each simulated user repeatedly reads one of the posts, study-materials, announcements, or notifications APIs. It first checks the database health endpoint.

## Full capacity profile

Only after the smoke profile passes and the staging providers have enough capacity:

```bash
DYNE_BASE_URL=https://your-staging-host.example DYNE_SESSION_COOKIES_FILE=/secure/path/dyne-sessions.json DYNE_FULL_STRESS=1 k6 run tests/load/dyne.js
```

The full profile ramps through 100, 300, 1,000, 2,000 and 3,300 virtual users, holds at 3,300, then ramps down. It is intentionally opt-in because it can consume significant Vercel function, database and network capacity. Keep the session file outside Git, restrict its file permissions, and use only synthetic accounts.

## Initial acceptance thresholds

- Failed HTTP requests: below 1%.
- API p95: below 500 ms.
- API p99: below 1,500 ms.
- Database health check: HTTP 200 before the run starts.

These are initial targets, not guarantees. Save the k6 summary, Vercel function metrics, Atlas CPU/connection metrics and R2 transfer metrics together. If any threshold fails, inspect the slow routes and Atlas Performance Advisor before increasing connection pools or upgrading capacity.

This is a read-only workload. It does not create posts, announcements, messages or uploaded files. It does not test write bursts, realtime fan-out, video streaming, or simultaneous large file downloads; those require separate controlled scenarios.
