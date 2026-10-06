# Panel de pedidos

Ruta `/admin/pedidos`, disponible desde la navegación del comercio. Lista pedidos con búsqueda por número, nombre, email o teléfono; filtros de estado y pago, páginas de 50 resultados y detalle actualizado con cliente, entrega, productos, precios históricos, pago y estado del correo.

Todos los endpoints requieren administrador y filtran por el commerceId de la sesión. Las acciones permitidas se calculan en el backend y se vuelven a validar dentro de una transacción con bloqueo del pedido.

- Pago acreditado: confirmado → preparando → enviado → entregado.
- Retiro: confirmado → preparando → entregado.
- Confirmado/preparando puede cancelarse; enviado/entregado no puede cancelarse desde este flujo.
- Una cancelación verifica los movimientos del pedido, devuelve el stock y cambia el estado en la misma transacción. Las solicitudes repetidas no devuelven unidades dos veces.
- Cancelar no reembolsa Mercado Pago. Un pago ya cobrado se conserva como pagado y queda marcado para revisión del reintegro.
- Pagos pendientes y casos marcados para revisión no se procesan manualmente desde estos botones. Las reservas vencidas se concilian automáticamente con Mercado Pago antes de liberar stock.
- Un pedido reembolsado que siga confirmado/preparando puede cancelarse para devolver stock.

La consulta paginada `GET /admin/orders` devuelve `{orders,page,pageSize,total}`. Publicar backend y frontend de esta versión juntos y recargar pestañas antiguas. No requiere migraciones adicionales.

Pruebas agregadas en MySQL: aislamiento entre comercios, transiciones inválidas, retiro sin envío, cancelación simultánea con devolución única, filtros/paginación y estado del email. La revisión se hizo sobre el panel existente para conservar los módulos de clientes, dashboard y personalización agregados en main.
