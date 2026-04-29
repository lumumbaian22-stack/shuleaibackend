const { sequelize } = require('./src/models');
const { Umzug, SequelizeStorage } = require('umzug');

const umzug = new Umzug({
  migrations: {
    glob: 'src/migrations/*.js',
    resolve: ({ name, path, context }) => {
      const migration = require(path);
      return {
        name,
        up: async () => migration.up(context, Sequelize),
        down: async () => {
          if (typeof migration.down === 'function') {
            return migration.down(context, Sequelize);
          }
        }
      };
    }
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

umzug.up().then(() => {
  console.log('Migrations executed successfully');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
