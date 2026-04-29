# V4.2 migration fix

Fixes the previous migration-runner mistake:

```txt
ReferenceError: Sequelize is not defined
```

The runner now imports Sequelize types before passing them into old Sequelize CLI style migrations.

## Run on Render

```bash
npm run migrate
```

Then restart the service.