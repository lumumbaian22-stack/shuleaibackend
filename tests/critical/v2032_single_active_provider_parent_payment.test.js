const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const service = fs.readFileSync(path.join(root, 'src/services/paymentProviderEngine.js'), 'utf8');
const lockedCtrl = fs.readFileSync(path.join(root, 'src/controllers/lockedPaymentController.js'), 'utf8');
const legacyCtrl = fs.readFileSync(path.join(root, 'src/controllers/paymentController.js'), 'utf8');
const parentDash = fs.readFileSync(path.resolve(root, '../frontend/js/parent-dashboard.js'), 'utf8');

test('v2032 parent payment uses backend-resolved school active provider, not parent-selected provider', () => {
  assert.match(service, /one_active_provider_per_scope/);
  assert.match(service, /Parents do not choose providers/);
  assert.match(service, /provider: undefined/);
  assert.match(parentDash, /paymentMethod: 'mobile_money'/);
  assert.doesNotMatch(parentDash, /provider: normalizedProvider \|\| undefined/);
});

test('v2032 parent school-fee response does not expose checkout URLs', () => {
  assert.match(lockedCtrl, /isParentSchoolFee/);
  assert.match(lockedCtrl, /checkoutUrl: isParentSchoolFee \? null : payment\.checkoutUrl/);
  assert.match(legacyCtrl, /parentInternalPaymentFlow/);
  assert.match(legacyCtrl, /checkoutUrl: \(payment\.paymentType === 'fee' && payment\.metadata\?\.parentInternalPaymentFlow === true\) \? null : payment\.checkoutUrl/);
});

test('v2032 provider adapters exist for active provider engine', () => {
  assert.match(service, /createPaystackMobileMoneyPrompt/);
  assert.match(service, /createFlutterwaveMpesaPrompt/);
  assert.match(service, /createPesapalManagedPrompt/);
  assert.match(service, /createStripeManagedPrompt/);
  assert.match(service, /provider_managed/);
});
