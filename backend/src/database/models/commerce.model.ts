import { DataTypes, Model, Sequelize } from 'sequelize';

export class Commerce extends Model {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare accountDisplay: string;
  declare instagramUrl: string | null;
  declare facebookUrl: string | null;
  declare tiktokUrl: string | null;
  declare youtubeUrl: string | null;
  declare heroTitle: string | null;
  declare heroButtonText: string | null;
  declare announcementText: string | null;
  declare heroLayout: string;
  declare tagline: string | null;
  declare headerTagline: string | null;
  declare headerDisplay: string;
  declare fontFamily: string;
  declare backgroundColor: string;
  declare coverPreset: string;
  declare coverData: Buffer | null;
  declare coverMimeType: string | null;
  declare primaryColor: string;
  declare secondaryColor: string;
  declare logoUrl: string | null;
  declare logoData: Buffer | null;
  declare logoMimeType: string | null;
  declare whatsapp: string | null;
  declare salesEmail: string | null;
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
        accountDisplay: {type: DataTypes.STRING(20),allowNull:false,defaultValue:'icon',field:'account_display'},
        instagramUrl: {type: DataTypes.STRING(500),allowNull:true,field:'instagram_url'},
        facebookUrl: {type: DataTypes.STRING(500),allowNull:true,field:'facebook_url'},
        tiktokUrl: {type: DataTypes.STRING(500),allowNull:true,field:'tiktok_url'},
        youtubeUrl: {type: DataTypes.STRING(500),allowNull:true,field:'youtube_url'},
        heroTitle: {type: DataTypes.STRING(180),allowNull:true,field:'hero_title'},
        heroButtonText: {type: DataTypes.STRING(40),allowNull:true,field:'hero_button_text'},
        announcementText: {type: DataTypes.STRING(160),allowNull:true,field:'announcement_text'},
        heroLayout: {type: DataTypes.STRING(20),allowNull:false,defaultValue:'split',field:'hero_layout'},
        tagline: {
          type: DataTypes.STRING(180),
          allowNull: true,
        },
        headerTagline: { type: DataTypes.STRING(180), allowNull: true, field: 'header_tagline' },
        headerDisplay: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'logo', field: 'header_display' },
        fontFamily: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'modern', field: 'font_family' },
        backgroundColor: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#f7f9fd', field: 'background_color' },
        coverPreset: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none', field: 'cover_preset' },
        coverData: { type: DataTypes.BLOB('medium'), allowNull: true, field: 'cover_data' },
        coverMimeType: { type: DataTypes.STRING(60), allowNull: true, field: 'cover_mime_type' },
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
        salesEmail: { type: DataTypes.STRING(190), allowNull: true, field: 'sales_email' },
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
