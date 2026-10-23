# Mi plan

Los administradores pueden abrir `/admin/plan` desde la navegación del panel o desde el resumen del dashboard. La pantalla muestra el estado de la tienda, el abono asociado, el fin del período abonado, el último pago y un historial paginado de acreditaciones. Las fechas se muestran en horario de Argentina.

`GET /admin/plan?page=1` usa la sesión existente y los roles de administrador. El comercio se obtiene exclusivamente del token validado; no acepta un identificador de comercio externo. La respuesta no se almacena en caché y no incluye correo del pagador, credenciales ni identificador de suscripción de Mercado Pago. Los usuarios sin una sesión administrativa válida deben volver a ingresar; el flujo existente de login resuelve las tiendas pendientes o suspendidas.

La consulta es de solo lectura: no crea suscripciones, no cobra y no modifica períodos. Una tienda anterior sin suscripción aparece como «Sin suscripción asociada», sin deuda ni fecha ficticia. El historial contiene únicamente acreditaciones del ledger existente; no muestra importes históricos porque el ledger no guarda ese dato por pago. El importe del abono se toma de la suscripción. La fecha de fin del período no se presenta como una fecha confirmada del siguiente débito de Mercado Pago.

El enlace para continuar el pago se ofrece solo para una suscripción existente pendiente, sin pagos ni período acreditado, con cobro habilitado y URL HTTPS de Mercado Pago Argentina. La asistencia usa el WhatsApp de plataforma ya configurado; no reemplaza el número comercial de cada tienda.

No requiere migraciones de base de datos, nuevas variables, nuevos servicios ni cambios de precio. La navegación y el resumen del dashboard consumen la misma API. Las pruebas cubren aislamiento por comercio, historial en MySQL, paginación, fechas, estados y bloqueo de enlaces de cobro ajenos a Mercado Pago.
