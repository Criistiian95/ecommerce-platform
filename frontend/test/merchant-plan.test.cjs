const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const sandbox = { exports: {}, Date, Number, Math };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/admin/plan/plan-data.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, sandbox);
const { planPresentation, planDate } = sandbox.exports;
const now = Date.parse('2026-10-23T12:00:00Z');
test('no-subscription stores are not labelled paid, overdue or free', () => {
  const p = planPresentation({ subscription: null, commerce: { active: true } }, now);
  assert.equal(p.label, 'Sin suscripción asociada'); assert.equal(p.daysLeft, null);
});
test('paid periods show a near-expiry warning and never show expired periods as current', () => {
  const status = (paidThrough, state = 'active') => planPresentation({ subscription: { status: state, paidThrough } }, now);
  assert.equal(status('2026-11-23T12:00:00Z').label, 'Al día');
  assert.equal(status('2026-10-25T12:00:00Z').label, 'Próximo a vencer');
  assert.equal(status('2026-10-23T12:00:00Z').label, 'Período vencido');
  assert.equal(status(null, 'pending').label, 'Pago pendiente');
  assert.equal(status('not-a-date').label, 'Estado por revisar');
  assert.equal(status('2026-11-23T12:00:00Z', 'cancelled').label, 'Suscripción cancelada');
});
test('plan dates use Argentina even when the device timezone is different', () => {
  assert.equal(planDate('2026-10-24T01:30:00Z'), '23/10/2026');
  assert.equal(planDate(null), 'Sin fecha registrada');
});
