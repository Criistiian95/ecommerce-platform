import { DataTypes, Model, Sequelize } from 'sequelize';

export class Commerce extends Model {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare tagline: string | null;
  declare primaryColor: string;
  declare secondaryColor: string;
  declare logoUrl: string | null;
  declare logoData: Buffer | null;
  declare logoMimeType: string | null;
  declare whatsapp: string | null;
  declare contactEmail: string | null;
  declare contactPhone: string | null;
  declare address: string | null;
  declare businessHours: string | null;
  declare pickupEnabled: boolean;
  declare shippingEnabled: boolean;
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
        tagline: {
          type: DataTypes.STRING(180),
          allowNull: true,
        },
        primaryColor: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: '#245ce6',
          field: 'primary_color',
        },
        secondaryColor: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: '#172238',
          field: 'secondary_color',
        },
        logoUrl: {
          type: DataTypes.STRING(500),
          allowNull: true,
          field: 'logo_url',
        },
        logoData: {
          type: DataTypes.BLOB('medium'),
          allowNull: true,
          field: 'logo_data',
        },
        logoMimeType: {
          type: DataTypes.STRING(60),
          allowNull: true,
          field: 'logo_mime_type',
        },
        whatsapp: {
          type: DataTypes.STRING(60),
          allowNull: true,
        },
        contactEmail: {
          type: DataTypes.STRING(160),
          allowNull: true,
          field: 'contact_email',
        },
        contactPhone: {
          type: DataTypes.STRING(60),
          allowNull: true,
          field: 'contact_phone',
        },
        address: {
          type: DataTypes.STRING(300),
          allowNull: true,
        },
        businessHours: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: 'business_hours',
        },
        pickupEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          field: 'pickup_enabled',
        },
        shippingEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          field: 'shipping_enabled',
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
