# V4.4 super admin school FK fix

Fixes:

```txt
insert or update on table "Users" violates foreign key constraint "Users_schoolCode_fkey"
Key (schoolCode)=(SUPER-ADMIN) is not present in table "Schools".
```

The migration now creates a platform school row with:

```txt
schoolCode = SUPER-ADMIN
```

before updating super-admin users.

## Run

Deploy this backend, then:

```bash
npm run migrate
```

Then restart Render.