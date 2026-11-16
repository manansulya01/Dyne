# Dyne account bootstrap and database checks

Dyne stores accounts and sessions in MongoDB. The persisted MongoDB role is the authority for every login portal and protected route.

## 1. Check the deployed database

Open `/api/health/db` on the deployed site. A healthy response is:

```json
{ "ok": true, "database": "connected" }
```

If it reports `not_configured`, add `MONGODB_URI` to the deployment environment. If it reports `unreachable`, verify the Atlas database user, URI encoding, database name, and Network Access allow-list. Configure `MONGODB_DB` and a unique `AUTH_SECRET` in the same environment, then redeploy.

Never put real database credentials in Git or expose them with a `NEXT_PUBLIC_` prefix.

## 2. Provision the three account types

The bootstrap command provisions separate identities:

| Portal | Default account ID | Default email | MongoDB role |
|---|---|---|---|
| Administrator | `admin0` | `admin0@dyne.local` | `super_admin` |
| Teacher | `teacher0` | `teacher0@dyne.local` | `teacher` |
| Staff | `staff0` | `staff0@dyne.local` | `staff` |

Set one or more of these password variables in a trusted shell or secret manager:

- `ADMIN_BOOTSTRAP_PASSWORD`
- `TEACHER_BOOTSTRAP_PASSWORD`
- `STAFF_BOOTSTRAP_PASSWORD`

Each password must be 12–128 characters. Optional account overrides are `*_BOOTSTRAP_USERNAME`, `*_BOOTSTRAP_EMAIL`, and `*_BOOTSTRAP_DISPLAY_NAME` for the matching account type. Usernames and emails must be unique.

From a trusted machine with dependencies installed and the intended MongoDB URI selected, run:

```sh
npm run bootstrap:admin
```

The script hashes passwords with bcrypt and sets `mustChangePassword`; each account is forced to choose a new password after first sign-in. It does not print passwords. Remove the bootstrap password variables after provisioning. The account records remain in MongoDB.

The script updates an existing record only when its configured username or email matches that same account. If those identifiers resolve to different records, it stops instead of merging identities.

## 3. Portal and authorization behavior

- `/admin/login` accepts only `admin` and `super_admin`; it opens `/admin`.
- `/teacher/login` accepts only `teacher`; it opens `/teacher`.
- `/staff/login` accepts only `staff`; it opens the staff member's authenticated `/dashboard`.
- The regular `/login` accepts any active account and sends it to the workspace associated with its stored role.
- Selecting a portal never grants a role. The server checks the MongoDB role before creating a session.
- Suspended and banned users are refused. Accounts marked `mustChangePassword` can only reach the password-rotation screen until the password is changed.
- Privileged APIs independently enforce server-side permissions; hiding a link in the UI is not an authorization check.

If signup reports that an account was created but automatic sign-in failed, use the new account ID/email and password at `/login` after the database is healthy.
