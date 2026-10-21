# Cobro mensual Diseñolys (ARS 39.900)

Las suscripciones de la plataforma son **independientes** de las conexiones OAuth de cada comercio a Mercado Pago. La cuenta central de Diseñolys es la única receptora de los abonos.

## Preparar producción sin activar nuevos cobros
Variables de **backend** (Render):
- `MP_SUBSCRIPTIONS_ACCESS_TOKEN`: token de producción de la cuenta central (secreto).
- `MP_SUBSCRIPTIONS_WEBHOOK_SECRET`: secreto HMAC de notificaciones (secreto).
- `BILLING_WEBHOOK_URL=https://ecommerce-platform-api-2kh1.onrender.com/billing/webhook`
- `BILLING_ENABLED=false` hasta la aprobación de pruebas de extremo a extremo.
- `BILLING_RECONCILIATION_ENABLED=false` hasta validar conciliación y cancelaciones.

La variable pública `NEXT_PUBLIC_BILLING_ENABLED` del **frontend** debe coincidir con `BILLING_ENABLED` en la compilación de Next.js, y el backend debe publicarse antes de habilitarla.

## Verificaciones obligatorias antes de habilitar
1. Probar que el endpoint firmado acepte la notificación de Mercado Pago y rechace firmas inválidas. El test sintético `subscription_preapproval` nunca debe habilitar una tienda.
2. Verificar con cuentas de prueba que `POST /preapproval` acepta el campo `notification_url` según la documentación/configuración de la aplicación; inspeccionar el vínculo y el cobrador.
3. Confirmar un cobro en el proveedor y que la factura `authorized_payments` y el pago `v1/payments` tienen importe ARS 39900, estado aprobado y collector ID esperado.
4. Comprobar doble notificación: debe quedar un solo pago y una sola extensión mensual.
5. Verificar cobro rechazado, cancelación, reembolso y pérdida de webhook; la tienda no se reactiva sin pago aprobado.
6. Activar inicialmente el flujo de suscripción solo en un entorno de prueba: `BILLING_ENABLED=true` en backend y `NEXT_PUBLIC_BILLING_ENABLED=true` en frontend; recargar build. Mantener las tiendas preexistentes intactas.
7. Activar la conciliación periódica solo después de comprobar que los impagos se desactivan sin pérdida de datos.

**Nunca compartir credenciales en GitHub o el chat.** No confundir estas variables con las que usa cada comercio para cobrar sus ventas.


## Prueba con el proveedor

El procedimiento reproducible está en [BILLING_TEST_RUNBOOK.md](BILLING_TEST_RUNBOOK.md).
Incluye una comprobación de solo lectura de la configuración y de la cuenta vendedora.
Pasar esa comprobación o las pruebas simuladas de CI **no equivale** a validar un cobro,
la entrega de notificaciones ni la activación de una tienda con Mercado Pago.
