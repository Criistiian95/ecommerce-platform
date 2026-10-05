import { DataTypes, Model, Sequelize } from 'sequelize';

export type UserRole = 'superadmin' | 'admin' | 'operator' | 'customer';

export class User extends Model {
  declare id: string;
  declare commerceId: string | null;
  declare email: string;
  declare passwordHash: string;
  declare name: string;
  declare phone: string | null;
  declare defaultAddress: string | null;
  declare role: UserRole;
  declare active: boolean;

  static register(sequelize: Sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        commerceId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: 'commerce_id',
        },
        email: {
          type: DataTypes.STRING(190),
          allowNull: false,
        },
        passwordHash: {
          type: DataTypes.STRING(100),
          allowNull: false,
          field: 'password_hash',
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        phone: {
          type: DataTypes.STRING(60),
          allowNull: true,
        },
        defaultAddress: {
          type: DataTypes.STRING(300),
          allowNull: true,
          field: 'default_address',
        },
        role: {
          type: DataTypes.ENUM('superadmin', 'admin', 'operator', 'customer'),
          allowNull: false,
        },
        active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        underscored: true,
        indexes: [
          {
            unique: true,
            fields: ['commerce_id', 'email'],
            name: 'uq_users_commerce_email',
          },
        ],
      },
    );
  }
}
