const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('crypto');
const {BILLING_MONTHLY_ARS,nextPaidThrough,verifyMpWebhook}=require('../dist/billing/billing-rules.js');
test('fixed plan is ARS 39,900',()=>assert.equal(BILLING_MONTHLY_ARS,39900));
test('calendar month clamps day 31',()=>{
 assert.equal(nextPaidThrough(null,new Date('2026-01-31T12:00:00Z')).toISOString(),'2026-02-28T12:00:00.000Z');
});
test('renewal extends from paid through, not event time',()=>{
 assert.equal(nextPaidThrough(new Date('2026-11-30T12:00:00Z'),new Date('2026-11-25T12:00:00Z')).toISOString(),'2026-12-30T12:00:00.000Z');
});
test('rejects forged, missing, and outdated notifications',()=>{
 const now=Math.floor(Date.now()/1000).toString();
 const make=(ts,id='123')=>'ts='+ts+',v1='+createHmac('sha256','secret').update('id:'+id+';request-id:req-1;ts:'+ts+';').digest('hex');
 assert.equal(verifyMpWebhook('secret',make(now),'req-1','123'),true);
 assert.equal(verifyMpWebhook('secret',make(now),'req-1','124'),false);
 assert.equal(verifyMpWebhook('secret','', 'req-1','123'),false);
 assert.equal(verifyMpWebhook('secret',make('1'),'req-1','123'),false);
});
