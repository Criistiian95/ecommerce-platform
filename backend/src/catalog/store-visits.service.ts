import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import { QueryTypes } from 'sequelize';
import { trialExpired } from '../billing/trial-policy';
import { DatabaseService } from '../database/database.service';
import { Commerce } from '../database/models/commerce.model';

const DAY_MS = 24 * 60 * 60 * 1000;
// The platform's reporting day is the calendar day in Argentina (UTC-3).
export function argentinaDay(now = new Date(), daysAgo = 0): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000 - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

@Injectable()
export class StoreVisitsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  constructor(private readonly db: DatabaseService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.clean(); }, 6 * 60 * 60 * 1000);
    this.timer.unref();
    void this.clean();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async record(slug: string, visitorId: unknown, userAgent = '', now = new Date()) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ||
        typeof visitorId !== 'string' || !/^[a-f0-9]{32}$/.test(visitorId) ||
        /bot|crawler|spider|headless|preview|slurp/i.test(userAgent)) return;
    const commerce = await Commerce.findOne({
      where: { slug, active: true }, attributes: ['id', 'trialEndsAt', 'trialConvertedAt'],
    });
    if (!commerce || trialExpired(commerce, now)) return;
    const day = argentinaDay(now);
    // A random, store-specific browser ID is hashed together with the day. IPs are never stored.
    const digest = createHash('sha256').update(`${commerce.id}:${day}:${visitorId}`).digest('hex');
    await this.db.sequelize.transaction(async transaction => {
      await this.db.sequelize.query(`INSERT IGNORE INTO store_visit_dedup (commerce_id, visit_date, visitor_hash)
        VALUES (:id, :day, :digest)`, { replacements: { id: commerce.id, day, digest }, transaction });
      const [row] = await this.db.sequelize.query<{ inserted: number }>('SELECT ROW_COUNT() AS inserted', { type: QueryTypes.SELECT, transaction });
      if (Number(row.inserted) === 1) {
        await this.db.sequelize.query(`INSERT INTO store_visit_totals (commerce_id, visit_date, visits)
          VALUES (:id, :day, 1) ON DUPLICATE KEY UPDATE visits = visits + 1`,
          { replacements: { id: commerce.id, day }, transaction });
      }
    });
  }

  async periodTotal(commerceId: string, days: number, now = new Date()): Promise<number> {
    const [row] = await this.db.sequelize.query<{ total: number | string }>(`SELECT COALESCE(SUM(visits), 0) AS total
      FROM store_visit_totals WHERE commerce_id = :id AND visit_date BETWEEN :start AND :end`, {
      replacements: { id: commerceId, start: argentinaDay(now, days - 1), end: argentinaDay(now) },
      type: QueryTypes.SELECT,
    });
    return Number(row?.total ?? 0);
  }

  async clean(now = new Date()) {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      // Daily totals remain; short-lived anonymous deduplication hashes are removed in batches.
      await this.db.sequelize.query('DELETE FROM store_visit_dedup WHERE visit_date < :cutoff LIMIT 10000',
        { replacements: { cutoff: argentinaDay(now, 1) } });
    } catch { console.warn('Visit cleanup will be retried.'); }
    finally { this.cleaning = false; }
  }
}
