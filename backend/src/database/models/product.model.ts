import { DataTypes, Model, Sequelize } from 'sequelize';

export class Product extends Model {
  declare id: string;
  declare commerceId: string;
  declare categoryId: string | null;
  declare sku: string;
  declare name: string;
  declare description: string | null;
  declare price: string;
  declare currentStock: number;
  declare minimumStock: number;
  declare imageUrl: string | null;
  declare active: boolean;

  static register(sequelize: Sequelize) {
    Product.init(
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
        categoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: 'category_id',
        },
        sku: {
          type: DataTypes.STRING(80),
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(160),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        price: {
          type: DataTypes.DECIMAL(14, 2),
          allowNull: false,
          defaultValue: 0,
        },
        currentStock: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: 'current_stock',
        },
        minimumStock: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: 'minimum_stock',
        },
        imageUrl: {
          type: DataTypes.STRING(500),
          allowNull: true,
          field: 'image_url',
        },
        active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        modelName: 'Product',
        tableName: 'products',
        underscored: true,
        indexes: [
          {
            unique: true,
            fields: ['commerce_id', 'sku'],
            name: 'uq_products_commerce_sku',
          },
          {
            fields: ['commerce_id', 'category_id'],
            name: 'ix_products_commerce_category',
          },
        ],
      },
    );
  }
}
