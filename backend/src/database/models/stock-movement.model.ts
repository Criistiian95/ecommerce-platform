import { DataTypes, Model, Sequelize } from 'sequelize';

export type StockMovementType = 'initial' | 'adjustment' | 'sale' | 'return';

export class StockMovement extends Model {
  declare id: string;
  declare commerceId: string;
  declare productId: string;
  declare userId: string;
  declare type: StockMovementType;
  declare previousStock: number;
  declare quantityChange: number;
  declare newStock: number;
  declare reason: string | null;

  static register(sequelize: Sequelize) {
    StockMovement.init(
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
        productId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'product_id',
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'user_id',
        },
        type: {
          type: DataTypes.ENUM('initial', 'adjustment', 'sale', 'return'),
          allowNull: false,
          defaultValue: 'adjustment',
        },
        previousStock: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'previous_stock',
        },
        quantityChange: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'quantity_change',
        },
        newStock: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'new_stock',
        },
        reason: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: 'StockMovement',
        tableName: 'stock_movements',
        underscored: true,
        indexes: [
          {
            fields: ['commerce_id', 'product_id', 'created_at'],
            name: 'ix_stock_movements_product_created',
          },
        ],
      },
    );
  }
}
