# Dyne account bootstrap and database checks

Dyne currently stores accounts and sessions in MongoDB. Supabase credentials do not replace the MongoDB variables used by these routes.

## 1. Check the deployed database

Open `/api/health/db` on the deployed site. A healthy response is:

```json
{ "ok": true, "database": "connected" }
```

If it reports `not_configured`, add `MONGODB_URI` to the deployment environment. If it reports `unreachable`, verify the Atlas database user, password/URI encoding, database name, and Network Access IP allow-list. Also configure `MONGODB_DB` and a unique `AUTH_SECRET` (at least 32 characters) in the same deployment environment, then redeploy.

Never put real database credentials in Git or expose them with a `NEXT_PUBLIC_` prefix.

## 2. Provision the initial staff accounts

The one-time bootstrap command creates or updates the account IDs `admin0` (role `super_admin`) and `staff0` (role `teacher`). It hashes passwords with bcrypt and sets `mustChangePassword` so each account must choose a new password after first sign-in.

Configure these variables only in a secure shell/deployment secret store:

- `MONGODB_URI`
- `MONGODB_DB`
- `ADMIN_BOOTSTRAP_PASSWORD` (required to provision admin0)
- `TEACHER_BOOTSTRAP_PASSWORD` (required to provision staff0)

Optional account fields are `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, and the matching `TEACHER_BOOTSTRAP_*` variables. Defaults are `admin0` / `admin0@dyne.local` and `staff0` / `staff0@dyne.local`.

From a trusted machine with the repository installed, dependencies installed, and the intended MongoDB URI selected, run:

```sh
npm run bootstrap:admin
```

The script does not print passwords. Do not set bootstrap passwords in the committed `.env.example`; use local untracked environment files or a secret manager. After successful provisioning, remove the bootstrap password variables and redeploy/restart. The accounts remain in MongoDB; their passwords are not hardcoded into the app.

Use strong unique bootstrap passwords whenever possible. The supplied short starter passwords should be treated as temporary only and changed immediately.

## 3. Sign-in behavior

The normal, teacher, and administrator forms accept either an email address or account ID. Portal selection never grants privileges: the account's MongoDB role is checked on the server. If signup reports that the account was created but automatic sign-in failed, use the new account ID/email and password at `/login` after the database is healthy.
