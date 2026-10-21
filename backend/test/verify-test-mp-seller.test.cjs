const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verifySeller}=require('../scripts/verify-test-mp-seller.cjs');
test('test seller identity accepted',async()=>{
 const r=await verifySeller({MP_TEST_SELLER_TOKEN:'dummy',EXPECTED_TEST_SELLER_ID:'3746889702'},async()=>({ok:true,json:async()=>({id:3746889702,site_id:'MLA'})}));
 assert.equal(r.sellerConfirmed,true);
 assert.equal(r.chargedPayments,0);
});
test('different seller rejected',async()=>{
 await assert.rejects(verifySeller({MP_TEST_SELLER_TOKEN:'dummy',EXPECTED_TEST_SELLER_ID:'3746889702'},async()=>({ok:true,json:async()=>({id:12345678,site_id:'MLA'})})),/no pertenece/);
});