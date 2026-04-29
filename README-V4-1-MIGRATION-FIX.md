# V4.1 migration runner fix

Render failed with:

```txt
Cannot read properties of undefined (reading 'STRING')
```

because older migrations are written in Sequelize CLI style:

```js
up(queryInterface, Sequelize)
```

but the Umzug runner was only passing:

```js
up(queryInterface)
```

This version fixes `runMigrations.js` so every migration receives both:

```js
queryInterface
Sequelize
```

## Deploy

Upload this backend, then run:

```bash
npm run migrate
```

Then restart the Render service.