import { DataTypes, Model, Sequelize } from 'sequelize';

export class Category extends Model {
  declare id: string;
  declare commerceId: string;
  declare name: string;
  declare description: string | null;
  declare active: boolean;

  static register(sequelize: Sequelize) {
    Category.init(
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
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        description: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        modelName: 'Category',
        tableName: 'categories',
        underscored: true,
        indexes: [
          {
            unique: true,
            fields: ['commerce_id', 'name'],
            name: 'uq_categories_commerce_name',
          },
        ],
      },
    );
  }
}
