import { DataTypes, Model, Sequelize } from 'sequelize';

export type OrderStatus = 'pending' | 'pending_payment' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'rejected' | 'cancelled' | 'refunded';
export type DeliveryMethod = 'pickup' | 'shipping';

export class Order extends Model {
  declare id: string;
  declare mpCollectorId: string | null;
  declare checkoutKey: string | null;
  declare checkoutHash: string | null;
  declare reservationExpiresAt: Date | null;
  declare reservationCheckedAt: Date | null;
  declare paymentReviewRequired: boolean;
  declare commerceId: string;
  declare customerId: string | null;
  declare orderNumber: string;
  declare status: OrderStatus;
  declare paymentStatus: PaymentStatus;
  declare mpOrderId: string | null;
  declare mpCheckoutUrl: string | null;
  declare paidAt: Date | null;
  declare customerName: string;
  declare customerEmail: string;
  declare customerPhone: string;
  declare deliveryMethod: DeliveryMethod;
  declare address: string | null;
  declare notes: string | null;
  declare subtotal: string;
  declare total: string;

  static register(sequelize: Sequelize) {
    Order.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        mpCollectorId: { type: DataTypes.STRING(40), allowNull: true, field: 'mp_collector_id' },
        checkoutKey: { type: DataTypes.STRING(64), allowNull: true, unique: 'uq_orders_checkout_key', field: 'checkout_key' },
        checkoutHash: { type: DataTypes.STRING(64), allowNull: true, field: 'checkout_hash' },
        reservationExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'reservation_expires_at' },
        reservationCheckedAt: { type: DataTypes.DATE, allowNull: true, field: 'reservation_checked_at' },
        paymentReviewRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'payment_review_required' },
        commerceId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'commerce_id',
        },
        customerId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: 'customer_id',
        },
        orderNumber: {
          type: DataTypes.STRING(40),
          allowNull: false,
          unique: true,
          field: 'order_number',
        },
        status: {
          type: DataTypes.ENUM('pending', 'pending_payment', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'),
          allowNull: false,
          defaultValue: 'pending_payment',
        },
        paymentStatus: {
          type: DataTypes.ENUM('pending', 'paid', 'rejected', 'cancelled', 'refunded'),
          allowNull: false,
          defaultValue: 'pending',
          field: 'payment_status',
        },
        mpOrderId: {
          type: DataTypes.STRING(100),
          allowNull: true,
          field: 'mp_order_id',
        },
        mpCheckoutUrl: {
          type: DataTypes.STRING(1000),
          allowNull: true,
          field: 'mp_checkout_url',
        },
        paidAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: 'paid_at',
        },
        customerName: {
          type: DataTypes.STRING(160),
          allowNull: false,
          field: 'customer_name',
        },
        customerEmail: {
          type: DataTypes.STRING(190),
          allowNull: false,
          field: 'customer_email',
        },
        customerPhone: {
          type: DataTypes.STRING(60),
          allowNull: false,
          field: 'customer_phone',
        },
        deliveryMethod: {
          type: DataTypes.ENUM('pickup', 'shipping'),
          allowNull: false,
          field: 'delivery_method',
        },
        address: {
          type: DataTypes.STRING(300),
          allowNull: true,
        },
        notes: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        subtotal: {
          type: DataTypes.DECIMAL(14, 2),
          allowNull: false,
        },
        total: {
          type: DataTypes.DECIMAL(14, 2),
          allowNull: false,
        },
      },
      {
        sequelize,
        modelName: 'Order',
        tableName: 'orders',
        underscored: true,
        indexes: [
          { fields: ['commerce_id', 'created_at'], name: 'ix_orders_commerce_created' },
          { fields: ['commerce_id', 'status'], name: 'ix_orders_commerce_status' },
          { fields: ['commerce_id', 'customer_id'], name: 'ix_orders_commerce_customer' },
        ],
      },
    );
  }
}
