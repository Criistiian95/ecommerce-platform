# Mi plan

Los administradores pueden abrir `/admin/plan` desde la navegación del panel o desde el resumen del dashboard. La pantalla muestra el estado de la tienda, el abono asociado, el fin del período abonado, el último pago y un historial paginado de acreditaciones. Las fechas se muestran en horario de Argentina.

`GET /admin/plan?page=1` usa la sesión existente y los roles de administrador. El comercio se obtiene exclusivamente del token validado; no acepta un identificador de comercio externo. La respuesta no se almacena en caché y no incluye correo del pagador, credenciales ni identificador de suscripción de Mercado Pago. Los usuarios sin una sesión administrativa válida deben volver a ingresar; el flujo existente de login resuelve las tiendas pendientes o suspendidas.

La consulta es de solo lectura: no crea suscripciones, no cobra y no modifica períodos. Una tienda anterior sin suscripción aparece como «Sin suscripción asociada», sin deuda ni fecha ficticia. El historial contiene únicamente acreditaciones del ledger existente; no muestra importes históricos porque el ledger no guarda ese dato por pago. El importe del abono se toma de la suscripción. La fecha de fin del período no se presenta como una fecha confirmada del siguiente débito de Mercado Pago.

El enlace para continuar el pago se ofrece solo para una suscripción existente pendiente, sin pagos ni período acreditado, con cobro habilitado y URL HTTPS de Mercado Pago Argentina. La asistencia usa el WhatsApp de plataforma ya configurado; no reemplaza el número comercial de cada tienda.

No requiere migraciones de base de datos, nuevas variables, nuevos servicios ni cambios de precio. La navegación y el resumen del dashboard consumen la misma API. Las pruebas cubren aislamiento por comercio, historial en MySQL, paginación, fechas, estados y bloqueo de enlaces de cobro ajenos a Mercado Pago.


## Pago desde el panel

Dashboard → Mi plan muestra **Pagar cuota · $39.900** para tiendas sin suscripción ni pagos previos, y para altas pendientes sin acreditación. El usuario acepta expresamente la renovación mensual antes de continuar al checkout alojado por Mercado Pago. La inscripción no modifica el acceso de comercios anteriores ni crea deuda retroactiva.

`POST /admin/plan/checkout` toma comercio, administrador y email de la sesión/base de datos. Exige consentimiento y el precio fijo vigente; ignora identificadores y precios alternativos del navegador. El mismo proveedor y el webhook de suscripciones existentes reciben el pago.

La intención de crear la suscripción se registra antes del POST remoto y bajo bloqueo de comercio. Solicitudes simultáneas, reinicios y respuestas inciertas recuperan la misma suscripción consultando Mercado Pago. No se repite a ciegas un POST perdido. Solo un rechazo explícito 400/401/403/422 permite volver a intentar la creación; si el resultado sigue incierto, se informa el error y se conserva la intención para revisión/recuperación. No se crean suscripciones adicionales para planes ya autorizados ni pagos previos.

**Ya pagué / Verificar pago** usa `POST /admin/plan/sync` y la conciliación existente: consulta facturas y pagos del proveedor, valida receptor/importe/comercio, y acredita cada pago una sola vez. Volver del checkout no basta para acreditar.

El botón cubre el alta/primer pago pendiente. Una renovación con débito automático rechazado se resuelve en la suscripción existente de Mercado Pago; no se emite un pago manual paralelo que pudiera duplicar el débito. Planes cancelados o pausados tampoco se reemplazan automáticamente. No se crea deuda a partir de la simple ausencia de un registro.

No se agregan variables, migraciones, servicios ni recursos pagos. Pruebas con Mercado Pago simulado; no se ejecuta un cargo real ni se inscribe un comercio de producción durante la validación.
