import { createHash } from 'crypto';
import { Sequelize, QueryTypes } from 'sequelize';
import type { Connection } from 'mysql2';
import { baseline } from './baseline';

type Query = (sql: string, values?: unknown[]) => Promise<any[]>;
const versions = ['001_baseline', '002_legacy_checkout', '003_email_outbox', '004_customer_accounts'];
async function legacy(query: Query) {
  const columns: Record<string, Record<string, string>> = {
    products: { image_data: 'MEDIUMBLOB NULL', image_mime_type: 'VARCHAR(60) NULL', brand: 'VARCHAR(120) NULL', cost: 'DECIMAL(14,2) NULL', offer_price: 'DECIMAL(14,2) NULL', published: 'TINYINT(1) NOT NULL DEFAULT 1', featured: 'TINYINT(1) NOT NULL DEFAULT 0' },
    orders: { payment_status: "ENUM('pending','paid','rejected','cancelled','refunded') NOT NULL DEFAULT 'pending'", mp_order_id: 'VARCHAR(100) NULL', mp_checkout_url: 'VARCHAR(1000) NULL', paid_at: 'DATETIME NULL', checkout_key: 'VARCHAR(64) NULL', checkout_hash: 'VARCHAR(64) NULL', reservation_expires_at: 'DATETIME NULL', reservation_checked_at: 'DATETIME NULL', payment_review_required: 'TINYINT(1) NOT NULL DEFAULT 0' },
  };
  for (const [table, fields] of Object.entries(columns)) {
    for (const [name, type] of Object.entries(fields)) {
      if (!(await query(`SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`, [name])).length) {
        await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type}`);
      }
    }
  }
  if (!(await query("SHOW INDEX FROM orders WHERE Key_name = 'uq_orders_checkout_key'")).length) {
    await query('ALTER TABLE orders ADD UNIQUE KEY uq_orders_checkout_key (checkout_key)');
  }
  const [status] = await query("SHOW COLUMNS FROM orders WHERE Field = 'status'");
  if (!String(status.Type).includes('pending_payment')) await query("ALTER TABLE orders MODIFY status ENUM('pending','pending_payment','confirmed','preparing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending_payment'");
  const [type] = await query("SHOW COLUMNS FROM stock_movements WHERE Field = 'type'");
  if (!String(type.Type).includes('reservation')) await query("ALTER TABLE stock_movements MODIFY type ENUM('initial','adjustment','sale','return','reservation','release') NOT NULL DEFAULT 'adjustment'");
  const [user] = await query("SHOW COLUMNS FROM stock_movements WHERE Field = 'user_id'");
  if (user.Null === 'NO') await query('ALTER TABLE stock_movements MODIFY user_id CHAR(36) BINARY NULL');
}

export async function runMigrations(sequelize: Sequelize) {
  // A single dedicated connection keeps the MySQL advisory lock across DDL auto-commits.
  const manager = (sequelize as any).connectionManager;
  const connection = await manager.getConnection({ type: 'WRITE' }) as Connection;
  const query: Query = (sql, values = []) => new Promise((resolve, reject) => {
    connection.query(sql, values, (error, result) => error ? reject(error) : resolve(result as any[]));
  });
  const lock = `ecommerce-schema-${createHash('sha256').update(sequelize.getDatabaseName()).digest('hex').slice(0, 32)}`;
  let acquired = false;
  try {
    const [result] = await query('SELECT GET_LOCK(?, 60) AS acquired', [lock]);
    if (Number(result.acquired) !== 1) throw new Error('Could not acquire schema migration lock');
    acquired = true;
    await query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB');
    const applied = new Set((await query('SELECT version FROM schema_migrations')).map(row => row.version));
    for (const version of versions) {
      if (applied.has(version)) continue;
      if (version === '001_baseline') {
        for (const table of baseline) {
          await query(table.create);
          for (const sql of table.indexes) {
            const name = sql.match(/ADD (?:UNIQUE )?INDEX `([^`]+)`/)?.[1];
            if (!name) throw new Error('Invalid frozen index definition');
            if (!(await query(`SHOW INDEX FROM \`${table.table}\` WHERE Key_name = ?`, [name])).length) await query(sql);
          }
        }
      } else if (version === '002_legacy_checkout') await legacy(query);
      else if (version === '003_email_outbox') await query(`CREATE TABLE IF NOT EXISTS order_email_deliveries (
        id CHAR(36) BINARY PRIMARY KEY, order_id CHAR(36) BINARY NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending', payload JSON NOT NULL, message MEDIUMTEXT NULL,
        attempts INT NOT NULL DEFAULT 0, first_attempt_at DATETIME NULL, next_attempt_at DATETIME NOT NULL,
        lease_until DATETIME NULL, lease_token CHAR(36) NULL, sent_at DATETIME NULL,
        provider_message_id VARCHAR(150) NULL, last_error VARCHAR(100) NULL,
        created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
        INDEX ix_email_due (status, next_attempt_at),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB`);
      else {
        const [emailIndex] = await query("SHOW INDEX FROM users WHERE Key_name = 'email'");
        if (emailIndex) await query('ALTER TABLE users DROP INDEX email');
        if (!(await query("SHOW COLUMNS FROM users WHERE Field = 'phone'")).length) {
          await query('ALTER TABLE users ADD COLUMN phone VARCHAR(60) NULL AFTER name');
        }
        if (!(await query("SHOW COLUMNS FROM users WHERE Field = 'default_address'")).length) {
          await query('ALTER TABLE users ADD COLUMN default_address VARCHAR(300) NULL AFTER phone');
        }
        if (!(await query("SHOW INDEX FROM users WHERE Key_name = 'uq_users_commerce_email'")).length) {
          await query('ALTER TABLE users ADD UNIQUE INDEX uq_users_commerce_email (commerce_id, email)');
        }
        if (!(await query("SHOW COLUMNS FROM orders WHERE Field = 'customer_id'")).length) {
          await query('ALTER TABLE orders ADD COLUMN customer_id CHAR(36) BINARY NULL AFTER commerce_id');
          await query('ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE');
        }
        if (!(await query("SHOW INDEX FROM orders WHERE Key_name = 'ix_orders_commerce_customer'")).length) {
          await query('ALTER TABLE orders ADD INDEX ix_orders_commerce_customer (commerce_id, customer_id)');
        }
      }
      // DDL is not transactional in MySQL; every step above is safe to resume.
      await query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, NOW())', [version]);
    }
  } finally {
    try { if (acquired) await query('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { await manager.releaseConnection(connection); }
  }
}

export async function assertMigrationsCurrent(sequelize: Sequelize) {
  let rows: Array<{ version: string }>;
  try { rows = await sequelize.query('SELECT version FROM schema_migrations', { type: QueryTypes.SELECT }); }
  catch { throw new Error('Database migrations missing. Run npm run migrate before starting the API.'); }
  const applied = new Set(rows.map(row => row.version));
  if (versions.some(version => !applied.has(version))) throw new Error('Database migrations pending. Run npm run migrate before starting the API.');
}
