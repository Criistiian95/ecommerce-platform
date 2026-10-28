import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import { QueryTypes } from 'sequelize';
import { DatabaseService } from '../database/database.service';
import { argentinaDay } from '../catalog/store-visits.service';

const pages = new Set(['/', '/registro', '/contacto', '/demo', '/login', '/recuperar']);

@Injectable()
export class PlatformStatisticsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DatabaseService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.cleanup(); }, 6 * 60 * 60_000);
    this.timer.unref();
    void this.cleanup();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async record(path: unknown, sessionId: unknown, userAgent = '', now = new Date()) {
    if (typeof path !== 'string' || !pages.has(path) || typeof sessionId !== 'string' ||
        !/^[a-f0-9]{32}$/.test(sessionId) || /bot|crawler|spider|headless|preview|slurp/i.test(userAgent)) return;
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    const day = argentinaDay(now);
    await this.db.sequelize.transaction(async transaction => {
      await this.db.sequelize.query('INSERT IGNORE INTO platform_session_dedup(session_hash, started_at) VALUES (:hash, :now)',
        { replacements: { hash: sessionHash, now }, transaction });
      const [row] = await this.db.sequelize.query<{ inserted: number }>('SELECT ROW_COUNT() AS inserted', { type: QueryTypes.SELECT, transaction });
      await this.db.sequelize.query(`INSERT INTO platform_visit_totals(visit_date,page_views,sessions,register_views)
        VALUES (:day,1,:session,:registration)
        ON DUPLICATE KEY UPDATE page_views=page_views+1,sessions=sessions+VALUES(sessions),register_views=register_views+VALUES(register_views)`,
      { replacements: { day, session: Number(row.inserted) === 1 ? 1 : 0, registration: path === '/registro' ? 1 : 0 }, transaction });
    });
  }

  async statistics(period: string | undefined, now = new Date()) {
    const days = period === '7' ? 7 : period === '90' ? 90 : period === 'all' ? null : 30;
    const start = days ? argentinaDay(now, days - 1) : null;
    const end = argentinaDay(now);
    const tomorrow = argentinaDay(new Date(now.getTime() + 24 * 60 * 60_000));
    const conditions = start ? 'visit_date BETWEEN :start AND :end' : 'visit_date <= :end';
    const [totals] = await this.db.sequelize.query<{ visits: number; sessions: number; registrations: number }>(
      `SELECT COALESCE(SUM(page_views),0) visits, COALESCE(SUM(sessions),0) sessions, COALESCE(SUM(register_views),0) registrations FROM platform_visit_totals WHERE ${conditions}`,
      { replacements: { start, end }, type: QueryTypes.SELECT });
    const startTime = start ? new Date(`${start}T03:00:00.000Z`) : null;
    const endTime = new Date(`${tomorrow}T03:00:00.000Z`);
    const [shops] = await this.db.sequelize.query<{ total: number }>(`SELECT COUNT(*) total FROM commerces
      WHERE trial_started_at IS NOT NULL AND trial_started_at < :endTime ${startTime ? 'AND trial_started_at >= :startTime' : ''}`,
      { replacements: { startTime, endTime }, type: QueryTypes.SELECT });
    return { period: days ?? 'all', visits: Number(totals.visits), sessions: Number(totals.sessions),
      registrationViews: Number(totals.registrations), storesCreated: Number(shops.total) };
  }

  async cleanup(now = new Date()) {
    try {
      await this.db.sequelize.query('DELETE FROM platform_session_dedup WHERE started_at < :cutoff LIMIT 10000',
        { replacements: { cutoff: new Date(now.getTime() - 48 * 60 * 60_000) } });
      await this.db.sequelize.query('DELETE FROM platform_owner_codes WHERE expires_at < :cutoff LIMIT 1000',
        { replacements: { cutoff: new Date(now.getTime() - 24 * 60 * 60_000) } });
    } catch { console.warn('Platform statistics cleanup will be retried.'); }
  }
}
