import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async list(commerceId: string | null, status?: string, search?: string) {
    if (!commerceId) throw new BadRequestException('El usuario no tiene comercio asociado');

    const where: any = { commerceId };
    if (status && status !== 'all') where.status = status;

    if (search?.trim()) {
      const term = search.trim();
      where[Op.or] = [
        { orderNumber: { [Op.like]: `%${term}%` } },
        { customerName: { [Op.like]: `%${term}%` } },
        { customerEmail: { [Op.like]: `%${term}%` } },
        { customerPhone: { [Op.like]: `%${term}%` } },
      ];
    }

    const orders = await Order.findAll({
      where,
      include: [{ model: OrderItem, as: 'items' }],
      order: [['createdAt', 'DESC']],
      limit: 250,
    });

    return orders.map(order => this.serialize(order));
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
    return this.serialize(order);
  }

  async updateStatus(
    commerceId: string | null,
    userId: string,
    id: string,
    status: OrderStatus,
  ) {
    const allowed: OrderStatus[] = [
      'pending_payment',
      'confirmed',
      'preparing',
      'shipped',
      'delivered',
      'cancelled',
    ];

    if (!allowed.includes(status)) {
      throw new BadRequestException('Estado de pedido inválido');
    }

    const order = await this.findOrder(commerceId, id);

    if (order.status === 'cancelled' || order.status === 'delivered') {
      throw new BadRequestException('Ese pedido ya no admite cambios de estado');
    }

    if (status === 'cancelled') {
      await this.cancelOrder(order, userId);
      return this.detail(commerceId, id);
    }

    if (order.status === 'pending_payment' && status !== 'pending_payment') {
      if (order.paymentStatus !== 'paid') {
        throw new BadRequestException('El pedido todavía no tiene el pago acreditado');
      }
    }

    await order.update({ status });
    return this.detail(commerceId, id);
  }

  private async cancelOrder(order: Order, userId: string) {
    if (order.status === 'shipped') {
      throw new BadRequestException('Un pedido enviado no puede cancelarse desde este panel');
    }

    const transaction = await Order.sequelize!.transaction();

    try {
      const lockedOrder = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!lockedOrder || lockedOrder.status === 'cancelled') {
        await transaction.rollback();
        return;
      }

      const items = await OrderItem.findAll({
        where: { orderId: lockedOrder.id },
        transaction,
      });

      for (const item of items) {
        const product = await Product.findByPk(item.productId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!product) continue;

        const previousStock = product.currentStock;
        const newStock = previousStock + item.quantity;

        await product.update({ currentStock: newStock }, { transaction });

        await StockMovement.create({
          commerceId: lockedOrder.commerceId,
          productId: product.id,
          userId,
          type: lockedOrder.paymentStatus === 'paid' ? 'return' : 'release',
          previousStock,
          quantityChange: item.quantity,
          newStock,
          reason: `Cancelación pedido ${lockedOrder.orderNumber}`,
        }, { transaction });
      }

      await lockedOrder.update({
        status: 'cancelled',
        paymentReviewRequired: lockedOrder.paymentStatus === 'paid',
        ...(lockedOrder.paymentStatus === 'pending' ? { paymentStatus: 'cancelled' } : {}),
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  private serialize(order: Order) {
    const plain = order.get({ plain: true }) as any;
    return {
      id: plain.id,
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
