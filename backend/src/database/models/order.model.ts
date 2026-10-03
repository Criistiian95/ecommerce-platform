import { DataTypes, Model, Sequelize } from 'sequelize';

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type DeliveryMethod = 'pickup' | 'shipping';

export class Order extends Model {
  declare id: string;
  declare commerceId: string;
  declare orderNumber: string;
  declare status: OrderStatus;
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
        commerceId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'commerce_id',
        },
        orderNumber: {
          type: DataTypes.STRING(40),
          allowNull: false,
          unique: true,
          field: 'order_number',
        },
        status: {
          type: DataTypes.ENUM('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'),
          allowNull: false,
          defaultValue: 'pending',
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
        ],
      },
    );
  }
}
