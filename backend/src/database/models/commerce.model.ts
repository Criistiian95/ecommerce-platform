import { DataTypes, Model, Sequelize } from 'sequelize';

export class Commerce extends Model {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare active: boolean;

  static register(sequelize: Sequelize) {
    Commerce.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        slug: {
          type: DataTypes.STRING(120),
          allowNull: false,
          unique: true,
        },
        active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        modelName: 'Commerce',
        tableName: 'commerces',
        underscored: true,
      },
    );
  }
}
