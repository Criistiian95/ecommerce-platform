import 'dotenv/config';
import 'reflect-metadata';
import { DatabaseService } from './database.service';
import { runMigrations } from './migrations/runner';
async function main() {
  const db = new DatabaseService();
  try { await db.sequelize.authenticate(); await runMigrations(db.sequelize); console.log('Database migrations complete'); }
  finally { await db.sequelize.close(); }
}
void main().catch(error => { console.error('Database migration failed', error); process.exitCode = 1; });
