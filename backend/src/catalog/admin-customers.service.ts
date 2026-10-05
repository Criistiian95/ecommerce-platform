import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { Order } from '../database/models/order.model';
import { User } from '../database/models/user.model';

type CustomerAggregate = {
  key: string;
  customerId: string | null;
  registered: boolean;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  paidOrdersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastOrderNumber: string | null;
};

@Injectable()
export class AdminCustomersService {
  private requireCommerce(commerceId: string | null) {
    if (!commerceId) {
      throw new BadRequestException('El usuario no tiene comercio asociado');
    }
    return commerceId;
  }

  private async buildCustomers(commerceId: string) {
    const [users, orders] = await Promise.all([
      User.findAll({
        where: {
          commerceId,
          role: 'customer',
          active: true,
        },
        attributes: ['id', 'name', 'email', 'phone', 'createdAt'],
        order: [['createdAt', 'DESC']],
      }),
      Order.findAll({
        where: { commerceId },
        order: [['createdAt', 'DESC']],
        attributes: [
          'id',
          'customerId',
          'orderNumber',
          'paymentStatus',
          'customerName',
          'customerEmail',
          'customerPhone',
          'total',
          'createdAt',
        ],
      }),
    ]);

    const map = new Map<string, CustomerAggregate>();

    for (const user of users) {
      const plain = user.get({ plain: true }) as any;
      map.set(`customer:${plain.id}`, {
        key: `customer:${plain.id}`,
        customerId: plain.id,
        registered: true,
        name: plain.name,
        email: String(plain.email ?? '').toLowerCase(),
        phone: plain.phone ?? '',
        ordersCount: 0,
        paidOrdersCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
        lastOrderNumber: null,
      });
    }

    for (const order of orders) {
      const plain = order.get({ plain: true }) as any;
      const email = String(plain.customerEmail ?? '').trim().toLowerCase();
      const phone = String(plain.customerPhone ?? '').trim();
      const key = plain.customerId
        ? `customer:${plain.customerId}`
        : `guest:${email || phone}`;

      let current = map.get(key);

      if (!current) {
        current = {
          key,
          customerId: plain.customerId ?? null,
          registered: Boolean(plain.customerId),
          name: plain.customerName,
          email,
          phone,
          ordersCount: 0,
          paidOrdersCount: 0,
          totalSpent: 0,
          lastOrderAt: null,
          lastOrderNumber: null,
        };
        map.set(key, current);
      }

      current.ordersCount += 1;

      if (plain.paymentStatus === 'paid') {
        current.paidOrdersCount += 1;
        current.totalSpent += Number(plain.total);
      }

      const createdAt = new Date(plain.createdAt).toISOString();
      if (!current.lastOrderAt || new Date(createdAt) > new Date(current.lastOrderAt)) {
        current.lastOrderAt = createdAt;
        current.lastOrderNumber = plain.orderNumber;
        if (!current.registered) {
          current.name = plain.customerName;
          current.email = email;
          current.phone = phone;
        }
      }
    }

    return [...map.values()].sort((a, b) => {
      if (!a.lastOrderAt && !b.lastOrderAt) return a.name.localeCompare(b.name, 'es');
      if (!a.lastOrderAt) return 1;
      if (!b.lastOrderAt) return -1;
      return new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime();
    });
  }

  async list(commerceId: string | null, search?: string) {
    const id = this.requireCommerce(commerceId);
    const customers = await this.buildCustomers(id);

    if (!search?.trim()) return customers;

    const term = search.trim().toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term),
    );
  }

  async summary(commerceId: string | null) {
    const id = this.requireCommerce(commerceId);
    const customers = await this.buildCustomers(id);
    const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    const paidOrders = customers.reduce((sum, customer) => sum + customer.paidOrdersCount, 0);

    return {
      totalCustomers: customers.length,
      registeredCustomers: customers.filter(customer => customer.registered).length,
      guestCustomers: customers.filter(customer => !customer.registered).length,
      repeatCustomers: customers.filter(customer => customer.ordersCount > 1).length,
      paidRevenue: totalRevenue,
      averageTicket: paidOrders ? totalRevenue / paidOrders : 0,
    };
  }

  async detail(commerceId: string | null, customerKey: string) {
    const id = this.requireCommerce(commerceId);
    const decodedKey = decodeURIComponent(customerKey);

    let customer: CustomerAggregate | undefined;
    let orders: Order[] = [];

    if (decodedKey.startsWith('customer:')) {
      const customerId = decodedKey.slice('customer:'.length);
      const user = await User.findOne({
        where: {
          id: customerId,
          commerceId: id,
          role: 'customer',
          active: true,
        },
      });

      if (!user) throw new NotFoundException('Cliente no encontrado');

      orders = await Order.findAll({
        where: { commerceId: id, customerId: user.id },
        order: [['createdAt', 'DESC']],
      });

      const list = await this.buildCustomers(id);
      customer = list.find(item => item.customerId === user.id);
    } else if (decodedKey.startsWith('guest:')) {
      const guestKey = decodedKey.slice('guest:'.length).trim().toLowerCase();

      orders = await Order.findAll({
        where: {
          commerceId: id,
          customerId: null,
          [Op.or]: [
            { customerEmail: guestKey },
            { customerPhone: guestKey },
          ],
        },
        order: [['createdAt', 'DESC']],
      });

      const list = await this.buildCustomers(id);
      customer = list.find(item => item.key === decodedKey);
    }

    if (!customer) throw new NotFoundException('Cliente no encontrado');

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
