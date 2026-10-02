import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { Commerce } from './models/commerce.model';
import { User } from './models/user.model';
import { Session } from './models/session.model';
import { Category } from './models/category.model';
import { Product } from './models/product.model';
import { StockMovement } from './models/stock-movement.model';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly sequelize: Sequelize;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');

    this.sequelize = new Sequelize(url, {
      dialect: 'mysql',
      logging: false,
      define: { timestamps: true },
    });

    Commerce.register(this.sequelize);
    User.register(this.sequelize);
    Session.register(this.sequelize);
    Category.register(this.sequelize);
    Product.register(this.sequelize);
    StockMovement.register(this.sequelize);

    Commerce.hasMany(User, { foreignKey: 'commerceId', as: 'users' });
    User.belongsTo(Commerce, { foreignKey: 'commerceId', as: 'commerce' });

    User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
    Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

    Commerce.hasMany(Category, { foreignKey: 'commerceId', as: 'categories' });
    Category.belongsTo(Commerce, { foreignKey: 'commerceId', as: 'commerce' });

    Commerce.hasMany(Product, { foreignKey: 'commerceId', as: 'products' });
    Product.belongsTo(Commerce, { foreignKey: 'commerceId', as: 'commerce' });

    Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
    Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

    Product.hasMany(StockMovement, { foreignKey: 'productId', as: 'stockMovements' });
    StockMovement.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
    User.hasMany(StockMovement, { foreignKey: 'userId', as: 'stockMovements' });
  }

  async onModuleInit() {
    await this.sequelize.authenticate();
    if (process.env.NODE_ENV !== 'production') {
      await this.sequelize.sync();
    }
  }

  async onModuleDestroy() {
    await this.sequelize.close();
  }
}
