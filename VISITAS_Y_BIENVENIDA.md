# Visitas y correos de registro

Las tiendas muestran en el dashboard las visitas del período elegido (7, 30 o 90 días). Se cuenta una visita por navegador y tienda por día de Argentina. Las recargas, las demás páginas del mismo comercio y las pestañas adicionales no suman otra visita el mismo día. Es una estimación: modo incógnito, borrar los datos del navegador o usar otro dispositivo puede contar otra visita; el propio comercio también puede contarse. No incluye el simulador, el panel, las vistas previas dentro de un iframe ni bots identificados por su agente. El historial empieza al activar esta función.

El navegador conserva un identificador aleatorio por comercio en almacenamiento local. El servidor guarda solo una huella distinta por comercio y día para evitar duplicados; no guarda IPs en la tabla de visitas. Las huellas se eliminan en lotes y se mantienen los totales diarios agregados.

Cada alta nueva crea, en la misma transacción que el comercio, dos trabajos de correo: bienvenida al administrador de la tienda y aviso a la plataforma. Un proceso del backend los envía a través de `RESEND_API_KEY` y `ORDER_EMAIL_FROM`, que también se usan para otros correos. No se envían correos de forma retroactiva a tiendas existentes. Una falla temporal queda en cola y se reintenta con una clave estable para evitar duplicados; ante errores persistentes se marca para revisión. No se crea ninguna compra ni se cobra al registrarse.

Para activar los avisos a Cristian es necesario configurar `PLATFORM_REGISTRATION_ALERT_EMAIL` en el backend con la dirección de destino confirmada. Si falta o es inválida, esos avisos quedan pendientes y la bienvenida a las tiendas continúa de manera independiente. No usar automáticamente una dirección de una tienda o el remitente como destino. `PLATFORM_PUBLIC_URL` es opcional y debe ser un origen HTTPS sin ruta; por defecto es `https://disenolys.store`.

La presencia de las variables y la aceptación del proveedor deben verificarse en el entorno desplegado. El servicio de correo existente puede tener límites de uso según su plan.
