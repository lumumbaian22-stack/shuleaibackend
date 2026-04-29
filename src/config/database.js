const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

console.log('🔧 Database Config Debug:');
console.log('📊 NODE_ENV:', process.env.NODE_ENV);
console.log('📊 DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('📊 isProduction:', isProduction);

if (process.env.DATABASE_URL) {
  console.log('📊 Using DATABASE_URL (first 20 chars):', process.env.DATABASE_URL.substring(0, 20) + '...');
} else {
  console.log('📊 Using DB_NAME:', process.env.DB_NAME);
  console.log('📊 Using DB_USER:', process.env.DB_USER);
  console.log('📊 Using DB_HOST:', process.env.DB_HOST);
}

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: !isProduction ? console.log : false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false // This is critical for Render
        }
      }
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: !isProduction ? console.log : false,
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false // This is critical for Render
          }
        }
      }
    );

// Test the connection immediately
sequelize
  .authenticate()
  .then(() => {
    console.log('✅ Database connection test SUCCESSFUL');
  })
  .catch(err => {
    console.error('❌ Database connection test FAILED:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Full error:', err);
  });

module.exports = sequelize;
