# Avisos de venta al comercio

En Admin → Configuración, guardar **Email para avisos de venta**. Es un destino privado, independiente del contacto público. Vacío desactiva avisos nuevos; los ya programados conservan el destino original.

Solo la confirmación de un pago acreditado programa el aviso, dentro de la misma transacción del pedido. Incluye cliente, teléfono, productos, cantidades, precios, total, entrega y observaciones. No se avisan pedidos históricos ni pagos pendientes.

Comprador y comercio tienen registros separados y una restricción única por pedido/destinatario lógico. El trabajador existente conserva cuerpo y clave de idempotencia durante los reintentos; el fallo de un destinatario no bloquea al otro. En Pedidos se muestran ambos estados. «Enviado al proveedor» confirma aceptación por Resend, no entrega en la bandeja.

Reutiliza RESEND_API_KEY y ORDER_EMAIL_FROM. Migración 008 agrega sales_email y audience, conserva registros anteriores como customer y reemplaza el índice único por (order_id,audience). Es reanudable. No volver a una versión anterior del trabajador después de activar avisos al comercio.

Pruebas: mensajes con HTML escapado y destinatarios separados; MySQL con pago duplicado concurrente, ausencia de aviso antes del pago, destino por comercio, snapshot y reintento independiente. El transporte está simulado y no envía correos reales.
