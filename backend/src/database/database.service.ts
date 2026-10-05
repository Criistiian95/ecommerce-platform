import { assertMigrationsCurrent } from './migrations/runner';
import { OrderEmailDelivery } from './models/order-email-delivery.model';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import { Commerce } from './models/commerce.model';
import { User } from './models/user.model';
import { Session } from './models/session.model';
import { Category } from './models/category.model';
import { Product } from './models/product.model';
import { StockMovement } from './models/stock-movement.model';
import { Order } from './models/order.model';
import { OrderItem } from './models/order-item.model';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly sequelize: Sequelize;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');

    this.sequelize = new Sequelize(url, {
      dialect: 'mysql',
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        connectTimeout: 20000,
      },
      define: { timestamps: true },
    });

    Commerce.register(this.sequelize);
    User.register(this.sequelize);
    Session.register(this.sequelize);
    Category.register(this.sequelize);
    Product.register(this.sequelize);
    StockMovement.register(this.sequelize);
    Order.register(this.sequelize);
    OrderItem.register(this.sequelize);
    OrderEmailDelivery.register(this.sequelize);

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

    Commerce.hasMany(Order, { foreignKey: 'commerceId', as: 'orders' });
    Order.belongsTo(Commerce, { foreignKey: 'commerceId', as: 'commerce' });
    User.hasMany(Order, { foreignKey: 'customerId', as: 'customerOrders' });
    Order.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

    Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
    OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

    Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems' });
    OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  }

  private async wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async authenticateWithRetry(attempts = 6) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.sequelize.authenticate();
        return;
      } catch (error) {
        lastError = error;
        console.error(`MySQL connection attempt ${attempt}/${attempts} failed`);

        if (attempt < attempts) {
          await this.wait(3000);
        }
      }
    }

    throw lastError;
  }

  private async bootstrapDemoCommerce() {
    if (process.env.BOOTSTRAP_DEMO !== 'true') return;

    const commerceName = process.env.BOOTSTRAP_COMMERCE_NAME?.trim();
    const commerceSlug = process.env.BOOTSTRAP_COMMERCE_SLUG?.trim();
    const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!commerceName || !commerceSlug || !adminName || !adminEmail || !adminPassword) {
      throw new Error('Bootstrap demo variables are incomplete');
    }

    const [commerce] = await Commerce.findOrCreate({
      where: { slug: commerceSlug },
      defaults: {
        name: commerceName,
        slug: commerceSlug,
        active: true,
      },
    });

    const existingUser = await User.findOne({ where: { email: adminEmail } });
    if (existingUser) {
      if (existingUser.commerceId !== commerce.id || existingUser.role !== 'admin') {
        await existingUser.update({
          commerceId: commerce.id,
          role: 'admin',
          active: true,
        });
      }
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await User.create({
      commerceId: commerce.id,
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: 'admin',
      active: true,
    });

    console.log(`Demo commerce bootstrapped: ${commerceSlug}`);
  }

  async onModuleInit() {
    await this.authenticateWithRetry();
    await assertMigrationsCurrent(this.sequelize);
    await this.bootstrapDemoCommerce();
  }

  async onModuleDestroy() {
    await this.sequelize.close();
  }
}
