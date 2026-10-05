# Checkout, reservas y stock

## Comportamiento

- El cliente genera una clave por intento y conserva su hash de contenido en localStorage. Reintentos con la misma clave y contenido recuperan el pedido; otra carga con la misma clave se rechaza. No se guardan los datos personales en esa huella.
- El backend exige `checkoutKey`; los clientes antiguos deben recargar el frontend. El índice único de la base impide dos reservas por clave y comercio incluso con múltiples procesos.
- Se suman las cantidades del mismo producto antes de validar; los productos se bloquean en orden estable. Los ajustes administrativos y su movimiento se confirman o revierten juntos.
- La preferencia vence a los 30 minutos. Un proceso del backend revisa las reservas vencidas cada minuto, con 5 minutos de margen. Si el servicio duerme, retoma al arrancar.
- Antes de liberar, consulta Mercado Pago. Pagos pendientes, estados desconocidos, respuestas incompletas y errores de red conservan la reserva y se vuelven a revisar. Un rechazo aislado no cancela otros intentos de pago todavía pendientes.
- Una respuesta ambigua al crear una preferencia no inicia otra ni libera inmediatamente: conserva el pedido hasta conciliar. Puede mantener stock por aproximadamente 35 minutos o más si MP no responde.
- Una aprobación posterior a la liberación marca `paymentReviewRequired`; no confirma una venta sin reserva. La pantalla pide contactar al comercio. La resolución administrativa de esos casos corresponde al futuro panel de pedidos.
- Pedidos anteriores sin vencimiento consultan la preferencia original. Si tampoco tienen identificador de preferencia, requieren conciliación manual; no se infiere que nunca se pagaron.

## Actualización

Se agregan columnas anulables de clave/hash/vencimiento/última revisión y una bandera de revisión de pago. Las columnas de pedidos existentes se agregan antes de `sync`; la clave es única. No se borran pedidos. Se mantiene el mecanismo de actualización actual; migraciones versionadas quedan para la próxima etapa.

Desplegar backend antes del frontend y recargar pestañas antiguas. Mantener disponibles las credenciales MP ya existentes. No se requieren nuevas credenciales. El worker necesita el backend activo para ejecutar a intervalos regulares.

## Verificación

- `npm test --prefix backend`: 20 pruebas unitarias y de servicios con dobles de base de datos/MP (incluyen fallas y concurrencia simulada).
- `npm run test:mysql --prefix backend`: integración con MySQL local aislado mediante `TEST_DATABASE_URL`; solo acepta localhost y una base `ecommerce_test_*`. Prueba actualización de esquema, claves simultáneas, ajustes durante checkout, rollback y liberación concurrente. Modifica exclusivamente esa base de pruebas.
- `npm run build --prefix frontend`: compilación y tipos.
- El workflow de GitHub ejecuta ambos grupos en MySQL 8.4 y compila el frontend. Ninguna prueba cobra ni usa credenciales de producción.
