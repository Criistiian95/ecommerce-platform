import { DataTypes, Model, Sequelize } from 'sequelize';

export class Session extends Model {
  declare id: string;
  declare userId: string;
  declare expiresAt: Date;
  declare revokedAt: Date | null;

  static register(sequelize: Sequelize) {
    Session.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'user_id',
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false,
          field: 'expires_at',
        },
        revokedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: 'revoked_at',
        },
      },
      {
        sequelize,
        modelName: 'Session',
        tableName: 'sessions',
        underscored: true,
      },
    );
  }
}
