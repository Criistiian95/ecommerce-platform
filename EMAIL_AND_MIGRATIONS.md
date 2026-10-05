# Correos de pedidos y migraciones

## Confirmaciones persistentes

La transición de pago pendiente a pagado crea una fila única en `order_email_deliveries` dentro de la misma transacción que confirma el pedido y sus movimientos. Si falla el registro del correo, toda la confirmación local se revierte para poder procesar nuevamente la notificación.

El worker revisa cada 30 segundos hasta 20 mensajes. Usa bloqueo de filas y leases de 60 segundos; una caída permite que otro proceso recupere el trabajo. La llamada a Resend vence a los 15 segundos. Reintenta errores de red, respuestas incompletas, 408, 429, 5xx y conflictos temporales de idempotencia. Los errores definitivos quedan para revisión.

La clave es estable por entrega y el cuerpo completo, incluido el remitente, se conserva desde el primer intento. Se hacen hasta 10 intentos con espera creciente (1 minuto hasta 1 hora), durante un máximo de 20 horas desde el primero. Después requiere revisión para no reenviar fuera de la ventana de idempotencia del proveedor. Referencia: https://resend.com/changelog/idempotency-keys (ventana de 24 horas).

Sin `RESEND_API_KEY` o `ORDER_EMAIL_FROM`, el correo permanece pendiente sin consumir intentos. El servicio debe estar activo para ejecutar el worker; al reiniciar retoma pendientes. No se crean envíos para pedidos históricos ya pagados, evitando duplicar correos anteriores cuyo estado no fue registrado.

`sent` significa aceptado por Resend con un identificador, no recepción en la bandeja del cliente. La pantalla distingue pendiente/enviado/requiere revisión/desconocido. Los rechazos y rebotes posteriores del proveedor no están cubiertos: eso requeriría un webhook de entrega. Los pedidos reembolsados o cancelados antes de reclamar el envío no generan una confirmación nueva.

## Migraciones versionadas

- `001_baseline`: snapshot SQL fijo para instalaciones nuevas, sin eliminar tablas existentes.
- `002_legacy_checkout`: adapta las versiones anteriores y el índice único del checkout.
- `003_email_outbox`: crea el registro persistente de envíos.

`schema_migrations` registra cada versión completada. Un bloqueo MySQL por base, mantenido en una conexión dedicada, impide ejecutar dos migradores simultáneamente. Los pasos toleran reejecución después de una interrupción; no se presenta el DDL de MySQL como si fuera transaccional.

El arranque de Nest solo verifica las versiones y no modifica la estructura. `DB_SYNC` deja de utilizarse.

Después de compilar:

```sh
npm run migrate --prefix backend
npm start --prefix backend
```

`npm start` ya ejecuta las migraciones antes de iniciar la API, por lo que el primer comando es opcional si se usa ese inicio. En Render, conservar `npm run start`/`npm start` como Start Command. Si se configuró `node dist/main.js` directamente, cambiarlo a `npm start` o ejecutar `npm run migrate` en un paso previo al despliegue. Para desarrollo con `start:dev`, compilar y migrar previamente.

Desplegar backend antes del frontend. Conservar las credenciales existentes. Las nuevas tablas y columnas son aditivas; no se borra información de pedidos. Antes de cambios de esquema en producción, conservar un respaldo recuperable. No existe reversión automática de datos.

## Pruebas

`npm test --prefix backend` verifica 27 casos de checkout, transporte y políticas de reintento. `npm run test:mysql --prefix backend` verifica migraciones, concurrencia de stock, atomicidad de confirmación/cola, dos workers simultáneos, recuperación de lease y cierre de ventana de idempotencia con MySQL aislado. Las llamadas de email y pago están simuladas: ninguna prueba envía mensajes ni cobra. El workflow del PR ejecuta ambos grupos y la compilación del frontend.
