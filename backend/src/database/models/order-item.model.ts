import { DataTypes, Model, Sequelize } from 'sequelize';

export class OrderItem extends Model {
  declare id: string;
  declare orderId: string;
  declare productId: string;
  declare sku: string;
  declare productName: string;
  declare unitPrice: string;
  declare quantity: number;
  declare lineTotal: string;

  static register(sequelize: Sequelize) {
    OrderItem.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        orderId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'order_id',
        },
        productId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'product_id',
        },
        sku: {
          type: DataTypes.STRING(80),
          allowNull: false,
        },
        productName: {
          type: DataTypes.STRING(160),
          allowNull: false,
          field: 'product_name',
        },
        unitPrice: {
          type: DataTypes.DECIMAL(14, 2),
          allowNull: false,
          field: 'unit_price',
        },
        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        lineTotal: {
          type: DataTypes.DECIMAL(14, 2),
          allowNull: false,
          field: 'line_total',
        },
      },
      {
        sequelize,
        modelName: 'OrderItem',
        tableName: 'order_items',
        underscored: true,
        indexes: [
          { fields: ['order_id'], name: 'ix_order_items_order' },
          { fields: ['product_id'], name: 'ix_order_items_product' },
        ],
      },
    );
  }
}
