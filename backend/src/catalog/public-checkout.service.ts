import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Commerce } from '../database/models/commerce.model';
import { Order } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Product } from '../database/models/product.model';
import { StockMovement } from '../database/models/stock-movement.model';
import { OrderEmailService } from './order-email.service';

type CheckoutInput = {
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
  constructor(private readonly orderEmail: OrderEmailService) {}
  private validateCustomer(input: CheckoutInput) {
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

  async createOrder(slug: string, input: CheckoutInput) {
    this.validateCustomer(input);

    const commerce = await Commerce.findOne({
      where: { slug, active: true },
      attributes: ['id', 'name'],
    });

    if (!commerce) {
      throw new NotFoundException('Comercio no encontrado');
    }

    const cleanItems = (input.items ?? [])
      .filter(item => item?.productId && Number.isInteger(Number(item.quantity)))
      .map(item => ({
        productId: item.productId,
        quantity: Math.max(1, Number(item.quantity)),
      }));

    if (!cleanItems.length) {
      throw new BadRequestException('El carrito está vacío');
    }

    const transaction = await Product.sequelize!.transaction();

    try {
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
      const orderNumber = `ORD-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;

      const order = await Order.create({
        commerceId: commerce.id,
        orderNumber,
        status: 'pending',
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail.trim().toLowerCase(),
        customerPhone: input.customerPhone.trim(),
        deliveryMethod: input.deliveryMethod,
        address: input.deliveryMethod === 'shipping' ? input.address?.trim() || null : null,
        notes: input.notes?.trim() || null,
        subtotal,
        total: subtotal,
      }, { transaction });

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
          type: 'sale',
          previousStock,
          quantityChange: -line.quantity,
          newStock,
          reason: `Pedido ${orderNumber}`,
        }, { transaction });
      }

      await transaction.commit();

      void this.orderEmail.sendConfirmation({
        commerceName: commerce.name,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        deliveryMethod: order.deliveryMethod,
        address: order.address,
        total: Number(order.total),
        items: orderLines.map(line => ({
          name: line.product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
      }).catch(error => {
        console.error('Unexpected order confirmation email error', error);
      });

      return {
        ok: true,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          subtotal: Number(order.subtotal),
          total: Number(order.total),
          deliveryMethod: order.deliveryMethod,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
