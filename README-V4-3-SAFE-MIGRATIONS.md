# V4.3 safe migrations

This fixes the latest Render error:

```txt
column "department" of relation "Teachers" already exists
```

The old migrations were not safe to rerun against a database that already has some columns.

This version hardens `runMigrations.js` so:

- old migrations still receive `(queryInterface, Sequelize)`
- `addColumn` checks whether the column exists before adding
- duplicate-column errors are skipped safely
- duplicate-index/table errors are skipped safely

## Run

```bash
npm run migrate
```

Then restart Render.