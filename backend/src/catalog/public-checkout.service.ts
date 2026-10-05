import { normalizeCartItems } from './cart-items';
import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { UniqueConstraintError } from 'sequelize';
import { Commerce } from '../database/models/commerce.model';
import { Order } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Product } from '../database/models/product.model';
import { StockMovement } from '../database/models/stock-movement.model';
import { User } from '../database/models/user.model';
import { MercadoPagoService } from './mercado-pago.service';

type CheckoutInput = {
  checkoutKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethod: 'pickup' | 'shipping';
  address?: string | null;
  notes?: string | null;
  items: Array<{ productId: string; quantity: number }>;
};

@Injectable()
export class PublicCheckoutService {
  constructor(private readonly mercadoPago: MercadoPagoService) {}
  private validateCustomer(input: CheckoutInput) {
    if (typeof input.checkoutKey !== 'string' || !/^[a-zA-Z0-9-]{20,100}$/.test(input.checkoutKey)) {
      throw new BadRequestException('Clave de checkout inválida');
    }
    if ([input.customerName, input.customerEmail, input.customerPhone].some(value => typeof value !== 'string') ||
        (input.address != null && typeof input.address !== 'string') ||
        (input.notes != null && typeof input.notes !== 'string')) {
      throw new BadRequestException('Datos del cliente inválidos');
    }
    const name = input.customerName?.trim();
    const email = input.customerEmail?.trim().toLowerCase();
    const phone = input.customerPhone?.trim();

    if (!name || !email || !phone) {
      throw new BadRequestException('Nombre, email y teléfono son obligatorios');
    }

    if (!email.includes('@')) {
      throw new BadRequestException('Email inválido');
    }

    if (!['pickup', 'shipping'].includes(input.deliveryMethod)) {
      throw new BadRequestException('Método de entrega inválido');
    }

    if (input.deliveryMethod === 'shipping' && !input.address?.trim()) {
      throw new BadRequestException('La dirección es obligatoria para envío');
    }
  }

  private replay(order: Order, hash: string) {
    if (order.checkoutHash !== hash) throw new ConflictException('La clave de checkout ya se usó con otros datos');
    if (order.paymentStatus !== 'pending' || order.status !== 'pending_payment') {
      throw new ConflictException({ message: 'Este pedido ya finalizó. Revisá su estado.', code: 'CHECKOUT_CLOSED', orderId: order.id });
    }
    if (order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) {
      throw new ConflictException({ message: 'La reserva está vencida y pendiente de conciliación. Revisá el estado del pedido.', orderId: order.id });
    }
    if (!order.mpCheckoutUrl) throw new ConflictException({ message: 'El pago se está preparando o verificando. Reintentá en unos momentos.', orderId: order.id });
    return { ok: true, order: { id: order.id, orderNumber: order.orderNumber,
      status: order.status, paymentStatus: order.paymentStatus, subtotal: Number(order.subtotal),
      total: Number(order.total), deliveryMethod: order.deliveryMethod },
      payment: { mpOrderId: order.mpOrderId, checkoutUrl: order.mpCheckoutUrl } };
  }

  async createOrder(slug: string, input: CheckoutInput, customerId?: string | null) {
    this.validateCustomer(input);

    const commerce = await Commerce.findOne({
      where: { slug, active: true },
      attributes: ['id', 'name', 'pickupEnabled', 'shippingEnabled'],
    });

    if (!commerce) {
      throw new NotFoundException('Comercio no encontrado');
    }

    if (input.deliveryMethod === 'pickup' && !commerce.pickupEnabled) {
      throw new BadRequestException('El retiro por el comercio no está disponible');
    }
    if (input.deliveryMethod === 'shipping' && !commerce.shippingEnabled) {
      throw new BadRequestException('El envío a domicilio no está disponible');
    }

    const account = customerId
      ? await User.findOne({
          where: {
            id: customerId,
            commerceId: commerce.id,
            role: 'customer',
            active: true,
          },
        })
      : null;

    const customerName = account?.name?.trim() || input.customerName.trim();
    const customerEmail = account?.email?.trim().toLowerCase() || input.customerEmail.trim().toLowerCase();
    const customerPhone = input.customerPhone.trim() || account?.phone?.trim() || '';

    if (!customerPhone) {
      throw new BadRequestException('El teléfono es obligatorio');
    }

    if (account && customerPhone !== account.phone) {
      await account.update({ phone: customerPhone });
    }

    const cleanItems = normalizeCartItems(input.items);

    if (!cleanItems.length) {
      throw new BadRequestException('El carrito está vacío');
    }

    const checkoutKey = createHash('sha256').update(`${commerce.id}:${input.checkoutKey}`).digest('hex');
    const checkoutHash = createHash('sha256').update(JSON.stringify({
      customerName, customerEmail,
      customerPhone, customerId: account?.id ?? null, deliveryMethod: input.deliveryMethod,
      address: input.deliveryMethod === 'shipping' ? input.address?.trim() || null : null,
      notes: input.notes?.trim() || null, items: cleanItems,
    })).digest('hex');
    const existing = await Order.findOne({ where: { checkoutKey } });
    if (existing) return this.replay(existing, checkoutHash);
    const transaction = await Product.sequelize!.transaction();
    let committed = false;

    try {
      const orderNumber = `ORD-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;

      const order = await Order.create({
        commerceId: commerce.id,
        customerId: account?.id ?? null,
        checkoutKey, checkoutHash,
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        reservationCheckedAt: new Date(),
        orderNumber,
        status: 'pending_payment',
        paymentStatus: 'pending',
        customerName,
        customerEmail,
        customerPhone,
        deliveryMethod: input.deliveryMethod,
        address: input.deliveryMethod === 'shipping' ? input.address?.trim() || null : null,
        notes: input.notes?.trim() || null,
        subtotal: 0,
        total: 0,
      }, { transaction });
      const orderLines: Array<{
        product: Product;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }> = [];

      for (const item of cleanItems) {
        const product = await Product.findOne({
          where: {
            id: item.productId,
            commerceId: commerce.id,
            active: true,
            published: true,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!product) {
          throw new BadRequestException('Uno de los productos ya no está disponible');
        }

        if (product.currentStock < item.quantity) {
          throw new BadRequestException('Uno de los productos no tiene disponibilidad suficiente');
        }

        const unitPrice = Number(product.offerPrice ?? product.price);
        orderLines.push({
          product,
          quantity: item.quantity,
          unitPrice,
          lineTotal: unitPrice * item.quantity,
        });
      }

      const subtotal = orderLines.reduce((sum, line) => sum + line.lineTotal, 0);
      await order.update({ subtotal, total: subtotal }, { transaction });

      for (const line of orderLines) {
        await OrderItem.create({
          orderId: order.id,
          productId: line.product.id,
          sku: line.product.sku,
          productName: line.product.name,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        }, { transaction });

        const previousStock = line.product.currentStock;
        const newStock = previousStock - line.quantity;

        await line.product.update({
          currentStock: newStock,
        }, { transaction });

        await StockMovement.create({
          commerceId: commerce.id,
          productId: line.product.id,
          userId: null,
          type: 'reservation',
          previousStock,
          quantityChange: -line.quantity,
          newStock,
          reason: `Reserva pedido ${orderNumber}`,
        }, { transaction });
      }

      await transaction.commit();
      committed = true;

      try {
        const payment = await this.mercadoPago.createCheckout(
          order,
          orderLines.map(line => ({
            title: line.product.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        );

        return {
          ok: true,
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            subtotal: Number(order.subtotal),
            total: Number(order.total),
            deliveryMethod: order.deliveryMethod,
          },
          payment,
        };
      } catch (error) {
        console.error('Mercado Pago checkout creation failed', error);
        // A timeout may mean MP created the preference. Keep this order and its
        // reservation until reconciliation; never create a second payment blindly.
        throw new ServiceUnavailableException({
          message: 'No pudimos confirmar el inicio del pago. Reintentá con el mismo pedido; la reserva se revisará automáticamente.',
          orderId: order.id,
        });
      }
    } catch (error) {
      if (!committed) await transaction.rollback();
      if (error instanceof UniqueConstraintError) {
        const existing = await Order.findOne({ where: { checkoutKey } });
        if (existing) return this.replay(existing, checkoutHash);
      }
      throw error;
    }
  }
}
