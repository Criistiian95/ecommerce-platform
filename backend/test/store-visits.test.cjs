const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { argentinaDay, StoreVisitsService } = require('../dist/catalog/store-visits.service');
const { Commerce } = require('../dist/database/models/commerce.model');
afterEach(() => mock.restoreAll());

test('visit day changes at midnight in Argentina', () => {
  assert.equal(argentinaDay(new Date('2026-10-28T02:59:59Z')), '2026-10-27');
  assert.equal(argentinaDay(new Date('2026-10-28T03:00:00Z')), '2026-10-28');
  assert.equal(argentinaDay(new Date('2026-10-28T03:00:00Z'), 6), '2026-10-22');
});

test('invalid identifiers and bots never cause database writes', async () => {
  const service = new StoreVisitsService({sequelize:{transaction:()=>assert.fail('no database write')}});
  mock.method(Commerce,'findOne',()=>assert.fail('no database lookup'));
  await service.record('valid-shop', 'bad-id', 'human');
  await service.record('valid-shop', 'a'.repeat(32), 'Googlebot');
  await service.record('invalid/slug', 'a'.repeat(32), 'human');
});

test('the database receives a day-and-store scoped hash, and only a new visitor increments totals', async () => {
  const transaction={}, queries=[];
  mock.method(Commerce,'findOne',async()=>({id:'store-one',trialEndsAt:null,trialConvertedAt:null}));
  const db={sequelize:{transaction:async cb=>cb(transaction),query:async (sql,opts)=>{
    queries.push({sql,opts});if(sql.includes('ROW_COUNT'))return [{inserted:1}];return [];
  }}};
  await new StoreVisitsService(db).record('valid-shop','a'.repeat(32),'human',new Date('2026-10-28T12:00:00Z'));
  assert.equal(queries.length,3);assert.equal(queries[0].opts.transaction,transaction);
  assert.equal(queries[0].opts.replacements.day,'2026-10-28');
  assert.notEqual(queries[0].opts.replacements.digest,'a'.repeat(32));
  assert.match(queries[0].opts.replacements.digest,/^[a-f0-9]{64}$/);
  assert.match(queries[2].sql,/store_visit_totals/);
});

test('repeat visits do not increment the daily aggregate', async () => {
  const queries=[];mock.method(Commerce,'findOne',async()=>({id:'store',trialEndsAt:null}));
  const db={sequelize:{transaction:async cb=>cb({}),query:async sql=>{queries.push(sql);return sql.includes('ROW_COUNT')?[{inserted:0}]:[];}}};
  await new StoreVisitsService(db).record('shop','a'.repeat(32),'human');
  assert.equal(queries.length,2);
});
