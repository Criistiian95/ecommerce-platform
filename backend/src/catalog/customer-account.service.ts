import { BadRequestException, Injectable } from '@nestjs/common';
import { Order } from '../database/models/order.model';

@Injectable()
export class CustomerAccountService {
  async orders(userId: string, commerceId: string | null) {
    if (!commerceId) throw new BadRequestException('Cliente sin comercio asociado');

    const orders = await Order.findAll({
      where: { customerId: userId, commerceId },
      order: [['createdAt', 'DESC']],
      attributes: [
        'id','orderNumber','status','paymentStatus','total',
        'deliveryMethod','address','createdAt','paidAt',
      ],
    });

    return orders.map(order => {
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
        paidAt: plain.paidAt,
      };
    });
  }
}
