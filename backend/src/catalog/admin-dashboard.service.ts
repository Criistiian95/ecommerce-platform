import { BadRequestException, Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { Order } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Product } from '../database/models/product.model';
import { User } from '../database/models/user.model';

type Period = 7 | 30 | 90;

@Injectable()
export class AdminDashboardService {
  private requireCommerce(commerceId: string | null) {
    if (!commerceId) {
      throw new BadRequestException('El usuario no tiene comercio asociado');
    }
    return commerceId;
  }

  private normalizeDays(days?: number): Period {
    return days === 7 || days === 90 ? days : 30;
  }

  private change(current: number, previous: number) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private dayKey(value: Date | string) {
    const date = new Date(value);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  async getDashboard(commerceId: string | null, requestedDays?: number) {
    const id = this.requireCommerce(commerceId);
    const days = this.normalizeDays(requestedDays);

    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setHours(0, 0, 0, 0);
    currentStart.setDate(currentStart.getDate() - (days - 1));

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    const previousEnd = new Date(currentStart);
    previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);

    const [currentOrders, previousOrders, recentOrders, lowStockProducts, activeProducts, registeredCustomers, pendingPayments] = await Promise.all([
      Order.findAll({
        where: {
          commerceId: id,
          createdAt: { [Op.gte]: currentStart },
        },
        include: [{ model: OrderItem, as: 'items' }],
        order: [['createdAt', 'ASC']],
      }),
      Order.findAll({
        where: {
          commerceId: id,
          createdAt: { [Op.between]: [previousStart, previousEnd] },
        },
        attributes: ['id', 'total', 'paymentStatus', 'customerId', 'customerEmail'],
      }),
      Order.findAll({
        where: { commerceId: id },
        order: [['createdAt', 'DESC']],
        limit: 7,
        attributes: [
          'id', 'orderNumber', 'status', 'paymentStatus',
          'customerName', 'total', 'createdAt',
        ],
      }),
      Product.findAll({
        where: {
          commerceId: id,
          active: true,
          [Op.and]: [
            Product.sequelize!.literal('current_stock <= minimum_stock'),
          ],
        },
        attributes: ['id', 'sku', 'name', 'currentStock', 'minimumStock'],
        order: [['currentStock', 'ASC']],
        limit: 8,
      }),
      Product.count({ where: { commerceId: id, active: true } }),
      User.count({
        where: {
          commerceId: id,
          role: 'customer',
          active: true,
        },
      }),
      Order.count({
        where: {
          commerceId: id,
          status: 'pending_payment',
          paymentStatus: 'pending',
        },
      }),
    ]);

    const paidCurrent = currentOrders.filter(order => order.paymentStatus === 'paid');
    const paidPrevious = previousOrders.filter(order => order.paymentStatus === 'paid');

    const revenue = paidCurrent.reduce((sum, order) => sum + Number(order.total), 0);
    const previousRevenue = paidPrevious.reduce((sum, order) => sum + Number(order.total), 0);
    const paidOrders = paidCurrent.length;
    const previousPaidOrders = paidPrevious.length;
    const averageTicket = paidOrders ? revenue / paidOrders : 0;
    const previousAverageTicket = previousPaidOrders
      ? previousRevenue / previousPaidOrders
      : 0;

    const buyerKeys = new Set(
      paidCurrent.map(order => {
        const plain = order.get({ plain: true }) as any;
        return plain.customerId
          ? `customer:${plain.customerId}`
          : `guest:${String(plain.customerEmail ?? '').toLowerCase()}`;
      }),
    );

    const previousBuyerKeys = new Set(
      paidPrevious.map(order => {
        const plain = order.get({ plain: true }) as any;
        return plain.customerId
          ? `customer:${plain.customerId}`
          : `guest:${String(plain.customerEmail ?? '').toLowerCase()}`;
      }),
    );

    const openOrders = currentOrders.filter(order =>
      ['confirmed', 'preparing', 'shipped'].includes(order.status),
    ).length;

    const seriesMap = new Map<string, { revenue: number; orders: number }>();
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(currentStart);
      date.setDate(date.getDate() + offset);
      seriesMap.set(this.dayKey(date), { revenue: 0, orders: 0 });
    }

    for (const order of paidCurrent) {
      const key = this.dayKey((order as any).createdAt);
      const entry = seriesMap.get(key);
      if (!entry) continue;
      entry.revenue += Number(order.total);
      entry.orders += 1;
    }

    const productMap = new Map<string, {
      productId: string;
      sku: string;
      name: string;
      units: number;
      revenue: number;
    }>();

    for (const order of paidCurrent) {
      const plain = order.get({ plain: true }) as any;
      for (const item of plain.items ?? []) {
        const key = item.productId;
        const current = productMap.get(key) ?? {
          productId: item.productId,
          sku: item.sku,
          name: item.productName,
          units: 0,
          revenue: 0,
        };
        current.units += Number(item.quantity);
        current.revenue += Number(item.lineTotal);
        productMap.set(key, current);
      }
    }

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 7);

    return {
      periodDays: days,
      summary: {
        revenue,
        revenueChange: this.change(revenue, previousRevenue),
        paidOrders,
        paidOrdersChange: this.change(paidOrders, previousPaidOrders),
        averageTicket,
        averageTicketChange: this.change(averageTicket, previousAverageTicket),
        buyers: buyerKeys.size,
        buyersChange: this.change(buyerKeys.size, previousBuyerKeys.size),
        registeredCustomers,
        activeProducts,
        openOrders,
        lowStock: lowStockProducts.length,
        pendingPayments,
      },
      salesSeries: [...seriesMap.entries()].map(([date, values]) => ({
        date,
        ...values,
      })),
      topProducts,
      recentOrders: recentOrders.map(order => {
        const plain = order.get({ plain: true }) as any;
        return {
          id: plain.id,
          orderNumber: plain.orderNumber,
          status: plain.status,
          paymentStatus: plain.paymentStatus,
          customerName: plain.customerName,
          total: Number(plain.total),
          createdAt: plain.createdAt,
        };
      }),
      lowStockProducts: lowStockProducts.map(product => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        currentStock: product.currentStock,
        minimumStock: product.minimumStock,
      })),
    };
  }
}
