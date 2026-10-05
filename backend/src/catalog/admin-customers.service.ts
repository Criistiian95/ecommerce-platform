import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { Order } from '../database/models/order.model';

type CustomerAggregate = {
  key: string;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  paidOrdersCount: number;
  totalSpent: number;
  lastOrderAt: string;
  lastOrderNumber: string;
};

@Injectable()
export class AdminCustomersService {
  private async customerOrders(commerceId: string | null) {
    if (!commerceId) {
      throw new BadRequestException('El usuario no tiene comercio asociado');
    }

    return Order.findAll({
      where: { commerceId },
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'orderNumber',
        'status',
        'paymentStatus',
        'customerName',
        'customerEmail',
        'customerPhone',
        'deliveryMethod',
        'address',
        'total',
        'createdAt',
      ],
    });
  }

  private aggregate(orders: Order[]) {
    const map = new Map<string, CustomerAggregate>();

    for (const order of orders) {
      const plain = order.get({ plain: true }) as any;
      const email = String(plain.customerEmail ?? '').trim().toLowerCase();
      const phone = String(plain.customerPhone ?? '').trim();
      const key = email || phone;
      if (!key) continue;

      const current = map.get(key);
      const paid = plain.paymentStatus === 'paid';
      const createdAt = new Date(plain.createdAt).toISOString();

      if (!current) {
        map.set(key, {
          key,
          name: plain.customerName,
          email,
          phone,
          ordersCount: 1,
          paidOrdersCount: paid ? 1 : 0,
          totalSpent: paid ? Number(plain.total) : 0,
          lastOrderAt: createdAt,
          lastOrderNumber: plain.orderNumber,
        });
        continue;
      }

      current.ordersCount += 1;
      if (paid) {
        current.paidOrdersCount += 1;
        current.totalSpent += Number(plain.total);
      }

      if (new Date(createdAt) > new Date(current.lastOrderAt)) {
        current.name = plain.customerName;
        current.phone = phone || current.phone;
        current.lastOrderAt = createdAt;
        current.lastOrderNumber = plain.orderNumber;
      }
    }

    return [...map.values()].sort(
      (a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
    );
  }

  async list(commerceId: string | null, search?: string) {
    const customers = this.aggregate(await this.customerOrders(commerceId));

    if (!search?.trim()) return customers;

    const term = search.trim().toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term),
    );
  }

  async summary(commerceId: string | null) {
    const customers = this.aggregate(await this.customerOrders(commerceId));
    const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    const paidOrders = customers.reduce((sum, customer) => sum + customer.paidOrdersCount, 0);

    return {
      totalCustomers: customers.length,
      repeatCustomers: customers.filter(customer => customer.ordersCount > 1).length,
      paidRevenue: totalRevenue,
      averageTicket: paidOrders ? totalRevenue / paidOrders : 0,
    };
  }

  async detail(commerceId: string | null, customerKey: string) {
    if (!commerceId) {
      throw new BadRequestException('El usuario no tiene comercio asociado');
    }

    const decodedKey = decodeURIComponent(customerKey).trim().toLowerCase();
    const isEmail = decodedKey.includes('@');

    const orders = await Order.findAll({
      where: {
        commerceId,
        ...(isEmail
          ? { customerEmail: { [Op.eq]: decodedKey } }
          : { customerPhone: { [Op.eq]: decodedKey } }),
      },
      order: [['createdAt', 'DESC']],
    });

    if (!orders.length) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const customer = this.aggregate(orders)[0];

    return {
      ...customer,
      orders: orders.map(order => {
        const plain = order.get({ plain: true }) as any;
        return {
          id: plain.id,
          orderNumber: plain.orderNumber,
          status: plain.status,
          paymentStatus: plain.paymentStatus,
          total: Number(plain.total),
          deliveryMethod: plain.deliveryMethod,
          address: plain.address,
          createdAt: plain.createdAt,
        };
      }),
    };
  }
}
