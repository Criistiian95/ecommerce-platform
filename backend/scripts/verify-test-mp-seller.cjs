'use strict';

const MP_IDENTITY_URL = 'https://api.mercadopago.com/users/me';

async function verifySeller(env=process.env, fetcher=global.fetch) {
  const token=String(env.MP_TEST_SELLER_TOKEN||'').trim();
  const expected=String(env.EXPECTED_TEST_SELLER_ID||'').trim();
  if(!token) throw new Error('Falta secreto MP_TEST_SELLER_TOKEN en GitHub Actions.');
  if(!/^\d{7,20}$/.test(expected)) throw new Error('EXPECTED_TEST_SELLER_ID inválido.');
  const response=await fetcher(MP_IDENTITY_URL,{
    method:'GET',
    redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw new Error('La API de Mercado Pago rechazó la comprobación de identidad (HTTP '+response.status+').');
  const data=await response.json();
  if(String(data?.id)!==expected) throw new Error('El token no pertenece al vendedor de prueba esperado. No continuar.');
  if(data.site_id!=='MLA') throw new Error('La cuenta vendedora no pertenece a Mercado Pago Argentina.');
  return {sellerConfirmed:true,currency:'ARS',createdSubscriptions:0,chargedPayments:0};
}

module.exports={verifySeller};
if(require.main===module){
 verifySeller().then(()=>console.log('Cuenta vendedora de prueba verificada (Argentina). No se crearon suscripciones ni cobros.'))
 .catch(error=>{console.error(error.message);process.exitCode=1;});
}
