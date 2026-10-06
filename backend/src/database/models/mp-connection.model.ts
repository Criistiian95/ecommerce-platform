import { DataTypes, Model, Sequelize } from 'sequelize';
export class MpConnection extends Model {
  declare commerceId: string;
  declare collectorId: string;
  declare credentials: string;
  declare expiresAt: Date;
  static register(sequelize: Sequelize) {
    this.init({
      commerceId: { type: DataTypes.UUID, primaryKey: true, field: 'commerce_id' },
      collectorId: { type: DataTypes.STRING(40), allowNull: false, unique: true, field: 'collector_id' },
      credentials: { type: DataTypes.TEXT, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    }, { sequelize, tableName: 'mp_connections', underscored: true });
  }
}
export class MpOAuthState extends Model {
  declare id: string;
  declare commerceId: string;
  declare userId: string;
  declare verifier: string;
  declare expiresAt: Date;
  static register(sequelize: Sequelize) {
    this.init({
      id: { type: DataTypes.STRING(64), primaryKey: true },
      commerceId: { type: DataTypes.UUID, allowNull: false, field: 'commerce_id' },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      verifier: { type: DataTypes.TEXT, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    }, { sequelize, tableName: 'mp_oauth_states', underscored: true });
  }
}
