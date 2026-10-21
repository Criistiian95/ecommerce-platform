# Validación de suscripciones con Mercado Pago

Objetivo: verificar el recorrido de ARS 39.900 mensuales con cuentas y medios de pago de prueba, antes de habilitarlo en producción.

## Estado y alcance

Las pruebas automatizadas usan respuestas simuladas de Mercado Pago. Falta el checkout con el proveedor, el webhook firmado y su efecto en MySQL. No marcar este procedimiento como aprobado hasta reunir las evidencias indicadas al final.

No reutilizar ni alterar el token central productivo, las conexiones OAuth de los comercios, la base productiva o `demo-2`.

## 1. Cuentas de prueba

En Mercado Pago Developers, abrir **Tus integraciones → Suscripcion tienda → Cuentas de prueba**. Comprobar o crear un vendedor y un comprador de Argentina; guardar las contraseñas fuera del repositorio y del chat.

La guía oficial para suscripciones pendientes indica crear una aplicación al iniciar sesión como vendedor de prueba y usar sus credenciales de producción. Son credenciales **de esa cuenta de prueba**, no las de la cuenta real de Diseñolys. El prefijo del token por sí solo no demuestra qué cuenta lo emitió.

Fuente: [Mercado Pago: cómo probar una integración, sección Suscripciones](https://www.mercadopago.com.ar/developers/es/news/2023/11/16/Questions-on-how-to-test-your-integration--).

Registrar los IDs de las dos cuentas y el email del comprador que muestra Developers. La comprobación automática consulta al vendedor; la identidad del comprador debe contrastarse con ese panel.

## 2. Entorno separado

Usar el mismo repositorio y código del PR, con servicios de prueba independientes:

- MySQL en Railway: instancia separada, base `disenolys_billing_test` y credenciales exclusivas. No copiar datos de clientes. Antes de migrar, comprobar en Railway que el servicio y la conexión son los de prueba.
- Backend y frontend de prueba en Render, con sus propias URLs HTTPS. No reemplazar los servicios productivos.
- `JWT_SECRET` nuevo. No copiar secretos de producción ni credenciales de email reales.
- Configurar el webhook de la aplicación del vendedor de prueba con la URL del backend de prueba y guardar su secreto allí.

El nombre de la base y las URLs son controles de configuración; **no demuestran por sí solos** que la infraestructura esté aislada. Confirmar también los servicios en los paneles antes de iniciar el backend. La creación de esos recursos no la realiza este script.

## 3. Comprobación de solo lectura

Con Node.js 22 o posterior, desde `backend/`:

```bash
cp .env.billing-test.example .env.billing-test.local
# Completar el archivo privado, sin imprimirlo ni subirlo a Git.
node --env-file=.env.billing-test.local scripts/check-billing-test-env.cjs
```

`.env.billing-test.local` ya queda cubierto por `.gitignore`. Completar las variables con los valores reales del entorno de prueba; no con ejemplos inventados.

El script valida la configuración antes de enviar el token, luego hace un único `GET /users/me`. Exige que el ID coincida con el vendedor esperado, el país sea `MLA` y la respuesta contenga `tags: ["test_user", ...]`. Si el proveedor no devuelve esa marca, detenerse y revisar la cuenta o el contrato de esa respuesta: no sustituir la verificación por un prefijo o un nombre de usuario.

No inicia Nest, no conecta MySQL, no crea suscripciones y no modifica variables de Render. Tampoco valida la firma del webhook ni la recepción de pagos. Sus pruebas unitarias son:

```bash
node --test test/billing-test-env.test.cjs
```

## 4. Ejecutar el flujo de prueba

Una vez verificadas las cuentas y la infraestructura aislada:

1. En el **backend de prueba**, establecer `BILLING_ENABLED=true`, `BILLING_RECONCILIATION_ENABLED=false` y `BOOTSTRAP_DEMO=false`. Cargar el token y secreto de la aplicación del vendedor de prueba, `DATABASE_URL`, `FRONTEND_URL`, `BILLING_WEBHOOK_URL` y el secreto JWT exclusivo. Configurar CORS para el frontend de prueba. Compilar y ejecutar las migraciones con esa conexión; el inicio habitual del backend ya ejecuta `npm run migrate`.
2. En el **frontend de prueba**, configurar `NEXT_PUBLIC_API_URL` con la URL del backend de prueba y `NEXT_PUBLIC_BILLING_ENABLED=true` antes de compilar. Verificar en el navegador que las solicitudes salen hacia el backend de prueba.
3. Abrir `/registro` del frontend de prueba. Usar un nombre y slug nuevos (por ejemplo `prueba-abono-01`) y el **email del comprador de prueba** como email del administrador. Ese email se envía como `payer_email`. Usar una contraseña nueva para este administrador; no es necesario reutilizar la contraseña de Mercado Pago.
4. Confirmar en MySQL que la tienda sigue inactiva y que la suscripción contiene el importe 39900, el ID del proveedor y el enlace de checkout. Reintentar debe devolver la misma suscripción, sin crear otra.
5. Abrir el enlace generado en una sesión del comprador de prueba. Verificar vendedor, importe y periodicidad. Completar usando exclusivamente los medios de prueba admitidos por Mercado Pago para suscripciones.
6. Esperar la factura y el pago aprobado del proveedor. Una suscripción `authorized`, una página de retorno exitosa o un webhook HTTP 200 no bastan para declarar el cobro aprobado.
7. Revisar la entrega del webhook, su firma y las consultas a `authorized_payments`, `preapproval` y `v1/payments`. Contrastar importe, moneda, factura, pago y receptor con los registros de MySQL.
8. Verificar que la tienda se activa y permite iniciar sesión solo después del pago verificado. Reenviar la notificación desde el proveedor: debe conservarse un solo pago y un solo período abonado.
9. Probar rechazo y cancelación con otro comercio de prueba. Cuando el entorno lo permita, comprobar renovación, reembolso y recuperación de una notificación perdida. Si una situación no puede reproducirse, registrarla como pendiente, no como aprobada.

La conciliación de vencimientos queda desactivada durante esta primera validación. Debe validarse por separado antes de automatizar suspensiones. El frontend y backend productivos mantienen sus flags de cobro en `false` durante todo este procedimiento.

## 5. Evidencia de aceptación

Guardar evidencia sin tokens, contraseñas, tarjetas, cabeceras de autorización ni datos personales:

| Comprobación | Evidencia mínima |
|---|---|
| Aislamiento | IDs de servicios de prueba y nombre de base; no guardar la cadena de conexión |
| Versión | SHA desplegado en backend y frontend de prueba |
| Identidades | IDs de cuentas de prueba y comprobación del vendedor |
| Pendiente | ID del comercio y de la suscripción; tienda inactiva; importe y moneda |
| Checkout | Resultado observado del proveedor y correspondencia con la suscripción |
| Pago | ID de factura y pago; estado aprobado, monto, moneda y receptor verificados |
| Notificación | Tipo, fecha y resultado de validación y procesamiento |
| Activación | Un registro de pago, fecha de vencimiento y tienda activa |
| Duplicado | Mismo pago y mismo vencimiento tras repetir la notificación |
| Rechazo/cancelación | Resultado observado; sin activación por un pago no aprobado |
| Pendientes | Casos no soportados, errores o diferencias reales del proveedor |

Conservar los resultados para decidir el paso a producción. Este documento y el preflight no habilitan cobros por sí mismos.
