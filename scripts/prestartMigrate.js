const { spawnSync } = require('child_process');

const isProduction = process.env.NODE_ENV === 'production';
const shouldRun = isProduction ? process.env.RUN_MIGRATIONS_ON_START !== 'false' : process.env.RUN_MIGRATIONS_ON_START === 'true';

if (!shouldRun) {
  console.log('[prestart] Skipping migrations before start. Set RUN_MIGRATIONS_ON_START=true to enable outside production.');
  process.exit(0);
}

console.log('[prestart] Running database migrations before application startup...');
const result = spawnSync(process.execPath, ['runMigrations.js'], { stdio: 'inherit', env: process.env });
if (result.status !== 0) {
  console.error('[prestart] Migrations failed. Refusing to start application.');
  process.exit(result.status || 1);
}
console.log('[prestart] Migrations completed. Starting application.');
