import { DataTypes, Model, Sequelize } from 'sequelize';
export class OrderEmailDelivery extends Model {
  declare id: string;
  declare orderId: string;
  declare status: 'pending' | 'sending' | 'sent' | 'failed';
  declare payload: Record<string, any>;
  declare message: Record<string, any> | null;
  declare attempts: number;
  declare firstAttemptAt: Date | null;
  declare nextAttemptAt: Date;
  declare leaseUntil: Date | null;
  declare leaseToken: string | null;
  declare sentAt: Date | null;
  declare providerMessageId: string | null;
  declare lastError: string | null;
  static register(sequelize: Sequelize) {
    OrderEmailDelivery.init({
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      orderId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'order_id' },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      payload: { type: DataTypes.JSON, allowNull: false }, message: { type: DataTypes.JSON, allowNull: true },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      firstAttemptAt: { type: DataTypes.DATE, field: 'first_attempt_at' },
      nextAttemptAt: { type: DataTypes.DATE, allowNull: false, field: 'next_attempt_at' },
      leaseUntil: { type: DataTypes.DATE, field: 'lease_until' }, leaseToken: { type: DataTypes.STRING(36), field: 'lease_token' },
      sentAt: { type: DataTypes.DATE, field: 'sent_at' }, providerMessageId: { type: DataTypes.STRING(150), field: 'provider_message_id' },
      lastError: { type: DataTypes.STRING(100), field: 'last_error' },
    }, { sequelize, modelName: 'OrderEmailDelivery', tableName: 'order_email_deliveries', underscored: true });
  }
}
