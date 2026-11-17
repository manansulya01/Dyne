# Dyne school roster provisioning

Production self-registration is disabled by default. Use this local CLI to provision accounts from a school-approved roster. It connects directly to the configured MongoDB database; no roster or temporary password is uploaded to Dyne or ChatGPT.

## CSV format

Required headers (case-insensitive):

```csv
email,username,displayName,role,classGrade,house
student001@school.example,student001,Student One,student,Grade 9-A,Blue
teacher001@school.example,teacher001,Teacher One,teacher,,Red
staff001@school.example,staff001,Staff One,staff,,Green
```

- Allowed roles: `student`, `teacher`, `staff` only. This tool cannot create administrators.
- Every student must have a trusted `classGrade`; teachers/staff may leave it blank.
- Email and username must be unique. Existing accounts are skipped; duplicate rows in the CSV stop the import.
- Maximum 3,500 rows and 5 MB per run.

## Run a dry-run first

On a trusted school/admin computer, place the approved CSV locally and configure `MONGODB_URI` and `MONGODB_DB` in `.env.local`. Do not commit those values or the roster.

```bash
node --env-file=.env.local scripts/import-school-roster.mjs --file ./school-roster.csv
```

This connects read-only apart from ensuring the unique email/username indexes, checks duplicates and reports how many accounts would be created.

## Create accounts

Only after verifying the database name and roster:

```bash
node --env-file=.env.local scripts/import-school-roster.mjs --file ./school-roster.csv --apply --confirm-db dyne
```

The script creates a random temporary password per account, stores only its bcrypt hash in MongoDB, and sets `mustChangePassword=true`. It writes a local credentials CSV with file permissions restricted to the current user. The CSV includes a status column so partial imports can be reconciled.

Keep the credentials file encrypted or on a protected device, distribute credentials only through an approved school channel, and securely delete it after students/staff change their passwords. Never email the CSV as an attachment or upload it to source control.

Run separate small batches for staff and students if the school wants different distribution controls. Back up the database before a large import and verify a small pilot batch before importing the full roster.
