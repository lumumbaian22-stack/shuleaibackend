const REQUIRED_PRODUCTION = [
  'JWT_SECRET',
  'PAYMENT_VAULT_KEY',
  'DATABASE_URL',
  'PUBLIC_API_BASE_URL'
];

function assertRequiredEnv() {
  const missing = REQUIRED_PRODUCTION.filter(key => !process.env[key]);
  if (process.env.NODE_ENV === 'production' && missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
  if (missing.length) {
    console.warn(`[env-check] Missing recommended environment variables: ${missing.join(', ')}. Production will refuse to boot without them.`);
  }
  const publicBase = process.env.PUBLIC_API_BASE_URL || process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (process.env.NODE_ENV === 'production' && publicBase && !/^https:\/\//i.test(publicBase)) {
    throw new Error('PUBLIC_API_BASE_URL/BACKEND_PUBLIC_URL must be a public HTTPS URL in production.');
  }
}

module.exports = { assertRequiredEnv };
