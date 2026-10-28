# Visitas y correos de registro

El panel privado `/estadisticas` mide la página de Diseños L&S, no las tiendas de los comercios. Incluye páginas vistas (cada carga o navegación), sesiones estimadas (30 minutos de inactividad), vistas de `/registro` y altas de tiendas desde la web. Ofrece períodos de 7, 30 y 90 días y todo el historial. No incluye rutas de tiendas, paneles, iframes, subdominios de comercios ni bots identificados. Las propias visitas pueden contarse y las vistas comienzan al activar el contador; las altas anteriores siguen siendo consultables.

El navegador conserva un identificador aleatorio de sesión en almacenamiento local. El servidor guarda solo su huella temporal para calcular sesiones; no guarda IPs en las tablas de estadísticas. Las huellas se eliminan después de 48 horas y se mantienen los totales diarios agregados. El contador anterior de tiendas quedó desconectado y no se recopilan visitas nuevas de los comercios; sus datos anteriores no se borran.

El acceso al panel privado requiere un código de un solo uso enviado a `PLATFORM_REGISTRATION_ALERT_EMAIL`. El código vence a los 10 minutos y tiene un límite de intentos; el acceso vence a las dos horas. La autorización se verifica en el backend y no concede privilegios a los administradores de tiendas. Se utiliza el proveedor de correo existente.

Cada alta nueva crea, en la misma transacción que el comercio, dos trabajos de correo: bienvenida al administrador de la tienda y aviso a la plataforma. Un proceso del backend los envía a través de `RESEND_API_KEY` y `ORDER_EMAIL_FROM`, que también se usan para otros correos. No se envían correos de forma retroactiva a tiendas existentes. Una falla temporal queda en cola y se reintenta con una clave estable para evitar duplicados; ante errores persistentes se marca para revisión. No se crea ninguna compra ni se cobra al registrarse.

Los avisos y el acceso privado usan `PLATFORM_REGISTRATION_ALERT_EMAIL` en el backend. Si falta o es inválida, los avisos quedan pendientes y la bienvenida a las tiendas continúa de manera independiente. `PLATFORM_PUBLIC_URL` es opcional y debe ser un origen HTTPS sin ruta; por defecto es `https://disenolys.store`.

La presencia de las variables y la aceptación del proveedor deben verificarse en el entorno desplegado. El servicio de correo existente puede tener límites de uso según su plan.
