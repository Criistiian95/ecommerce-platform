# Cobros por comercio con Mercado Pago

Implementa OAuth Authorization Code con PKCE y Checkout Pro, sin comisión de la plataforma. Cada nuevo pedido guarda `mp_collector_id` y usa las credenciales de su comercio. Sin conexión no se reserva stock ni se inicia un pago. El token global jamás se utiliza como alternativa para un nuevo pedido.

## Configuración antes de publicar

En la aplicación de Mercado Pago que representa a esta plataforma:

1. Habilitar/configurar OAuth y PKCE (S256).
2. Registrar exactamente esta URL de retorno:
   `https://ecommerce-platform-web.onrender.com/admin/configuracion`
3. Configurar notificaciones de pagos a:
   `https://ecommerce-platform-api-2kh1.onrender.com/catalog/mercadopago/webhook`
4. Configurar en el backend de Render:
   - `MP_CLIENT_ID`: ID de esa aplicación.
   - `MP_CLIENT_SECRET`: secreto de esa aplicación.
   - `MP_OAUTH_REDIRECT_URI`: URL de retorno anterior, sin barra final.
   - `MP_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatorios codificados en base64. Generar en un entorno seguro y guardar en el gestor de secretos; no usar una clave de ejemplo ni cambiarla sin recifrar los registros existentes.
   - `MP_WEBHOOK_SECRET`: firma de notificaciones de la misma aplicación.
   - `FRONTEND_URL`: mantener la URL actual del frontend.
5. Para verificar pedidos históricos que no tienen `mp_collector_id`, conservar `MP_ACCESS_TOKEN` y configurar `MP_LEGACY_COLLECTOR_ID` con el ID del titular de esa credencial (obtener mediante GET `/users/me` con el token antiguo). No se deriva del texto del token ni se asigna automáticamente a nuevos comercios.

No subir secretos al repositorio ni ingresarlos en el frontend. Guardar una copia segura de la clave de cifrado: sin ella no se pueden recuperar las conexiones.

## Publicación y activación

- La migración `006_commerce_payments` crea dos tablas y una columna nullable; se ejecuta desde el comando de inicio existente. Es reanudable. Los pedidos anteriores conservan sus datos.
- Publicar backend y frontend juntos, después de configurar las variables.
- Cada administrador debe entrar en Configuración > Cobros y autorizar su propia cuenta de Mercado Pago, incluida la tienda demo. Hasta conectarla, ese comercio no podrá iniciar nuevos cobros online. Los pedidos históricos se siguen conciliando con la credencial antigua.
- La autorización final se completa con el JWT del administrador. El estado aleatorio dura diez minutos, se vincula al usuario/comercio y se consume una sola vez. Los tokens nunca se envían al navegador.
- Verificar con dos cuentas vendedoras distintas: cuenta receptora correcta, pedido confirmado, stock vendido, correo y aislamiento entre tiendas. Las pruebas automáticas simulan Mercado Pago; no reemplazan la autorización y prueba real del proveedor.

## Operación

Las credenciales se cifran con AES-256-GCM y datos autenticados por comercio. Al usarse cerca del vencimiento se renuevan bajo bloqueo de fila para evitar renovaciones concurrentes. Una cuenta revocada necesita reconexión manual. El botón Reconectar autoriza nuevamente la misma cuenta; no permite cambiar el destinatario de pedidos históricos. Una cuenta vendedora se asigna a un solo comercio en esta versión.

El webhook usa `user_id` solo para localizar la conexión. Después consulta el pago real a Mercado Pago y valida `collector_id`, referencia, pertenencia del pedido, importe y moneda. No confirma datos del webhook directamente. Consultas de estado y vencimiento de reservas también usan la conexión del pedido. Errores de consulta conservan la reserva para revisión posterior.

No se implementa comisión por venta, reintegros automáticos, cambio de titular ni desconexión que elimine credenciales necesarias para conciliar pedidos. El comercio puede revocar permisos desde Mercado Pago; debe reconectar para continuar.

## Referencias oficiales

- https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/how-tos/integrate-marketplace

## Verificación

`npm test --prefix backend`, `npm run test:mysql --prefix backend` (MySQL local aislado) y `npm run build --prefix frontend`.
