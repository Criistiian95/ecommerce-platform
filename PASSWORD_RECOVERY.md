# Recuperación de contraseña

Disponible para clientes y administradores/operadores de un comercio activo.
Cliente: enlace en su login; comercio: /recuperar desde /login. En el dominio central
el administrador debe indicar el identificador de su tienda para evitar ambigüedad
cuando el mismo email existe en varios comercios. No recupera superadmins sin comercio.

## Configuración y despliegue

Usa RESEND_API_KEY y ORDER_EMAIL_FROM existentes. El origen HTTPS se toma de
PASSWORD_RESET_ORIGIN (opcional) o FRONTEND_URL. Debe ser un origen sin ruta, query,
credenciales ni fragmento, por ejemplo https://ecommerce-platform-web.onrender.com.
Nunca se construye el enlace con Host/Origin enviados por el navegador.
La migración aditiva 007_password_recovery crea tres tablas y no cambia contraseñas.
El inicio existente ejecuta la migración antes de servir solicitudes.

## Protecciones

- Solicitud siempre genérica: no consulta usuarios antes de responder. Encola datos
  normalizados en MySQL incluso para emails inexistentes y los procesa aparte.
- Tokens aleatorios de 256 bits, huella SHA-256 en MySQL, vencimiento 20 minutos,
  un solo uso y vinculados al usuario, comercio, tipo de cuenta y hash de contraseña.
- Cada enlace nuevo invalida el anterior. Consumo, hash bcrypt coste 12 y revocación
  de todas las sesiones ocurren en una misma transacción con bloqueo de usuario.
- El login también comprueba bajo bloqueo que no haya cambiado la contraseña antes
  de crear una sesión. No se inicia sesión automáticamente después del cambio.
- Contraseña nueva: al menos 15 caracteres, máximo 72 bytes UTF-8 (límite de bcrypt),
  confirmación idéntica. No se trunca silenciosamente ni se impiden espacios/pegado.
- Token en fragmento URL: no llega en URLs de solicitudes HTTP. La pantalla lo retira
  de la barra y lo mantiene solo en memoria. Se envía por POST y no se registra.
- Límites persistentes en MySQL por ventanas de 15 minutos: 3 solicitudes por email,
  20 por dirección observada y 100 globales; reset: 20 por dirección y 100 globales.
  No se confía en X-Forwarded-For arbitrario. Detrás de un proxy los usuarios pueden
  compartir cupo por IP: límites conservadores hasta configurar una cadena de proxies
  conocida. Los límites globales acotan abuso, pero un ataque puede agotar temporalmente
  el cupo; considerar WAF/CAPTCHA si hay volumen real. No afecta el login normal.
- Cola durable con lease, hasta 3 intentos de email, vencimiento 10 minutos. Un fallo
  ambiguo del proveedor puede dejar llegar un enlace anterior ya inválido: usar el más
  reciente. Limpieza de solicitudes, tokens y límites expirados. Sin tokens en logs.
- Correo informativo después del cambio, sin contraseña; envío de ese aviso es best-effort
  y no revierte un cambio exitoso si falla. Se registra solo el tipo de fallo.

El worker corre en la API cada 5 segundos y después de solicitar recuperación. En
instancias gratuitas puede detenerse al dormir el servicio; una nueva solicitud lo
reactiva. No hay garantía de entrega instantánea ni de entrega a cualquier destinatario
si Resend restringe el remitente a una cuenta de prueba.

## Pruebas

npm test --prefix backend; npm run test:mysql --prefix backend (MySQL local aislado);
npm test --prefix frontend; npm run build --prefix frontend.
Las pruebas verifican aislamiento, expiración, consumo concurrente, revocación de
sesiones, bcrypt, límites persistentes y reintentos. Usan emails simulados.
Antes de dar por verificada la entrega real, solicitar un enlace con una cuenta propia,
comprobar recepción, cambiar contraseña, probar el enlace usado y la sesión anterior.
No enviar correos de prueba a clientes sin autorización.

## Recuperación desde backup

Antes de conectar la API a una copia restaurada, vaciar password_reset_tokens y
password_reset_requests además de sessions. Usar una base aislada sin credenciales
reales de Resend/Mercado Pago para pruebas de recuperación.

Referencia: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
