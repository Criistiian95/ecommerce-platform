import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Op } from 'sequelize';
import { Order } from '../database/models/order.model';
import { MercadoPagoService } from './mercado-pago.service';

@Injectable()
export class ReservationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  constructor(private readonly mercadoPago: MercadoPagoService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.run(); }, 60_000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearInterval(this.timer); }

  async run() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const orders = await Order.findAll({
        where: { status: 'pending_payment', paymentStatus: 'pending',
          [Op.or]: [{ reservationExpiresAt: { [Op.lte]: new Date(Date.now() - 5 * 60_000) } }, { reservationExpiresAt: null }] },
        order: [['reservationCheckedAt', 'ASC'], ['id', 'ASC']], limit: 50,
      });
      for (const order of orders) {
        if (this.stopped) break;
        try {
          await order.update({ reservationCheckedAt: new Date() });
          await this.mercadoPago.reconcileExpiredReservation(order);
        } catch (error) { console.error('Reservation reconciliation failed; will retry', order.id, error); }
      }
    } catch (error) { console.error('Reservation worker failed; will retry', error); }
    finally { this.running = false; }
  }
}
