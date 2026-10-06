import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderEmailDelivery } from '../database/models/order-email-delivery.model';
import { Op } from 'sequelize';
import { Order, OrderStatus } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Product } from '../database/models/product.model';
import { StockMovement } from '../database/models/stock-movement.model';

@Injectable()
export class AdminOrdersService {
  private async findOrder(commerceId: string | null, id: string) {
    if (!commerceId) throw new BadRequestException('El usuario no tiene comercio asociado');

    const order = await Order.findOne({
      where: { id, commerceId },
      include: [{ model: OrderItem, as: 'items' }],
    });

    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  async list(commerceId: string | null, status?: string, search?: string, payment?: string, pageInput?: string) {
    if (!commerceId) throw new BadRequestException('El usuario no tiene comercio asociado');

    const where: any = { commerceId };
    const statuses = ['pending', 'pending_payment', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
    if (status && status !== 'all') {
      if (!statuses.includes(status)) throw new BadRequestException('Estado inválido');
      where.status = status;
    }
    if (payment && payment !== 'all') {
      if (!['pending', 'paid', 'rejected', 'cancelled', 'refunded'].includes(payment)) throw new BadRequestException('Pago inválido');
      where.paymentStatus = payment;
    }
    const page = Number(pageInput ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Página inválida');

    if (search?.trim()) {
      const term = search.trim().slice(0, 120);
      where[Op.or] = [
        { orderNumber: { [Op.like]: `%${term}%` } },
        { customerName: { [Op.like]: `%${term}%` } },
        { customerEmail: { [Op.like]: `%${term}%` } },
        { customerPhone: { [Op.like]: `%${term}%` } },
      ];
    }

    const { rows: orders, count } = await Order.findAndCountAll({
      where,
      distinct: true,
      include: [{ model: OrderItem, as: 'items' }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 50, offset: (page - 1) * 50,
    });

    return { orders: orders.map(order => this.serialize(order)), page, pageSize: 50, total: count };
  }

  async summary(commerceId: string | null) {
    if (!commerceId) throw new BadRequestException('El usuario no tiene comercio asociado');

    const [orders, pendingPayment, active, delivered] = await Promise.all([
      Order.findAll({ where: { commerceId }, attributes: ['total', 'status', 'paymentStatus'] }),
      Order.count({ where: { commerceId, status: 'pending_payment' } }),
      Order.count({
        where: {
          commerceId,
          status: { [Op.in]: ['confirmed', 'preparing', 'shipped'] },
        },
      }),
      Order.count({ where: { commerceId, status: 'delivered' } }),
    ]);

    const paidRevenue = orders
      .filter(order => order.paymentStatus === 'paid')
      .reduce((sum, order) => sum + Number(order.total), 0);

    return {
      totalOrders: orders.length,
      pendingPayment,
      active,
      delivered,
      paidRevenue,
    };
  }

  async detail(commerceId: string | null, id: string) {
    const order = await this.findOrder(commerceId, id);
    const email = await OrderEmailDelivery.findOne({ where: { orderId: order.id }, attributes: ['status', 'attempts', 'sentAt'] });
    return { ...this.serialize(order), email: email ? { status: email.status, attempts: email.attempts, sentAt: email.sentAt } : null };
  }

  async updateStatus(
    commerceId: string | null,
    userId: string,
    id: string,
    status: OrderStatus,
  ) {
    if (!commerceId) throw new BadRequestException('El usuario no tiene comercio asociado');
    await Order.sequelize!.transaction(async transaction => {
      const order = await Order.findOne({ where: { id, commerceId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status === status) return; // Repeated requests never return stock twice.
      if (!this.actions(order).includes(status)) {
        throw new BadRequestException('El cambio no está permitido para el estado y pago actuales. Actualizá el pedido.');
      }
      if (status === 'cancelled') {
        const items = await OrderItem.findAll({ where: { orderId: order.id }, order: [['productId', 'ASC']], transaction });
        const quantities = new Map<string, number>();
        for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
        for (const [productId, quantity] of quantities) {
          const product = await Product.findOne({ where: { id: productId, commerceId }, transaction, lock: transaction.LOCK.UPDATE });
          if (!product) throw new BadRequestException('No se pudo verificar el producto para devolver stock');
          const movements = await StockMovement.findAll({ where: { commerceId, productId,
            reason: { [Op.in]: [`Reserva pedido ${order.orderNumber}`, `Venta pedido ${order.orderNumber}`, `Liberación pedido ${order.orderNumber}`, `Cancelación pedido ${order.orderNumber}`] } }, transaction });
          const outstanding = -movements.reduce((sum, movement) => sum + movement.quantityChange, 0);
          if (outstanding !== quantity) throw new BadRequestException('El stock de este pedido requiere revisión antes de cancelar');
          const previousStock = product.currentStock;
          const newStock = previousStock + outstanding;
          if (newStock > 2147483647) throw new BadRequestException('Stock fuera de rango');
          await product.update({ currentStock: newStock }, { transaction });
          await StockMovement.create({ commerceId, productId, userId, type: 'return', previousStock,
            quantityChange: outstanding, newStock, reason: `Cancelación pedido ${order.orderNumber}` }, { transaction });
        }
        await order.update({ status, paymentReviewRequired: order.paymentStatus === 'paid' }, { transaction });
      } else await order.update({ status }, { transaction });
    });
    return this.detail(commerceId, id);
  }

  private actions(order: Pick<Order, 'status' | 'paymentStatus' | 'paymentReviewRequired' | 'deliveryMethod'>): OrderStatus[] {
    if (order.paymentReviewRequired) return [];
    if (order.paymentStatus === 'refunded' && ['confirmed', 'preparing'].includes(order.status)) return ['cancelled'];
    if (order.paymentStatus !== 'paid') return [];
    if (order.status === 'confirmed') return ['preparing', 'cancelled'];
    if (order.status === 'preparing') return [order.deliveryMethod === 'pickup' ? 'delivered' : 'shipped', 'cancelled'];
    if (order.status === 'shipped') return ['delivered'];
    return [];
  }

  private serialize(order: Order) {
    const plain = order.get({ plain: true }) as any;
    return {
      id: plain.id,
      allowedActions: this.actions(order),
      orderNumber: plain.orderNumber,
      status: plain.status,
      paymentStatus: plain.paymentStatus,
      customerName: plain.customerName,
      customerEmail: plain.customerEmail,
      customerPhone: plain.customerPhone,
      deliveryMethod: plain.deliveryMethod,
      address: plain.address,
      notes: plain.notes,
      subtotal: Number(plain.subtotal),
      total: Number(plain.total),
      paidAt: plain.paidAt,
      paymentReviewRequired: Boolean(plain.paymentReviewRequired),
      createdAt: plain.createdAt,
      items: (plain.items ?? []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
      })),
    };
  }
}
