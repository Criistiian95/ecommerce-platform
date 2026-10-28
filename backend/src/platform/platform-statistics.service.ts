import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { isIP } from 'net';
import { QueryTypes } from 'sequelize';
import { DatabaseService } from '../database/database.service';
import { argentinaDay } from '../catalog/store-visits.service';

const pages = new Set(['/', '/registro', '/contacto', '/demo', '/login', '/recuperar']);
type FilterRow = {
  started_at: Date;
  baseline_day: string | Date;
  baseline_views: number;
  baseline_sessions: number;
  baseline_register_views: number;
  ip_hash: string | null;
  browser_hash: string;
};
type DailyRow = { page_views: number; sessions: number; register_views: number };

function sessionDigest(id: string) { return createHash('sha256').update(id).digest('hex'); }

// Never store a raw address or browser session ID.
export function publicIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ip = value.trim().replace(/^::ffff:/i, '').toLowerCase();
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)) return null;
    return ip;
  }
  if (family === 6 && ip !== '::1' && !ip.startsWith('fe8') &&
      !ip.startsWith('fc') && !ip.startsWith('fd')) return ip;
  return null;
}

function ipDigest(value: unknown): string | null {
  const ip = publicIp(value);
  if (!ip || !process.env.JWT_SECRET) return null;
  return createHmac('sha256', process.env.JWT_SECRET).update('platform-exclude-ip-v1:' + ip).digest('hex');
}
export function excludedVisitor(filter: Pick<FilterRow, 'ip_hash' | 'browser_hash'> | undefined,
  sessionHash: string, addressHash: string | null): boolean {
  return !!filter && (filter.browser_hash === sessionHash || (!!filter.ip_hash && filter.ip_hash === addressHash));
}

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

  async record(path: unknown, sessionId: unknown, userAgent = '', edgeIp?: string, browserId?: unknown, now = new Date()) {
    if (typeof path !== 'string' || !pages.has(path) || typeof sessionId !== 'string' ||
        !/^[a-f0-9]{32}$/.test(sessionId) || /bot|crawler|spider|headless|preview|slurp/i.test(userAgent)) return;
    const sessionHash = sessionDigest(sessionId);
    const addressHash = ipDigest(edgeIp);
    const browserHash = typeof browserId === 'string' && /^[a-f0-9]{32}$/.test(browserId) ? sessionDigest(browserId) : sessionHash;
    const day = argentinaDay(now);
    await this.db.sequelize.transaction(async transaction => {
      const [filter] = await this.db.sequelize.query<FilterRow>(
        'SELECT ip_hash, browser_hash FROM platform_traffic_filter WHERE id=1',
        { type: QueryTypes.SELECT, transaction });
      if (excludedVisitor(filter, browserHash, addressHash)) return;
      await this.db.sequelize.query('INSERT IGNORE INTO platform_session_dedup(session_hash, started_at) VALUES (:hash, :now)',
        { replacements: { hash: sessionHash, now }, transaction });
      const [row] = await this.db.sequelize.query<{ inserted: number }>('SELECT ROW_COUNT() AS inserted', { type: QueryTypes.SELECT, transaction });
      await this.db.sequelize.query('INSERT INTO platform_visit_totals(visit_date,page_views,sessions,register_views) VALUES (:day,1,:session,:registration) ON DUPLICATE KEY UPDATE page_views=page_views+1,sessions=sessions+VALUES(sessions),register_views=register_views+VALUES(register_views)',
        { replacements: { day, session: Number(row.inserted) === 1 ? 1 : 0, registration: path === '/registro' ? 1 : 0 }, transaction });
    });
  }

  // Historical totals are aggregated and cannot be filtered per visitor.
  // Keep them, but start trustworthy reporting after the exclusion is enabled.
  async excludeOwner(sessionId: unknown, edgeIp?: string, now = new Date()) {
    if (typeof sessionId !== 'string' || !/^[a-f0-9]{32}$/.test(sessionId)) throw new Error('Identificador de navegador inválido');
    const browserHash = sessionDigest(sessionId);
    const addressHash = ipDigest(edgeIp);
    const day = argentinaDay(now);
    return this.db.sequelize.transaction(async transaction => {
      const [existing] = await this.db.sequelize.query<FilterRow>(
        'SELECT * FROM platform_traffic_filter WHERE id=1 FOR UPDATE', { type: QueryTypes.SELECT, transaction });
      if (!existing) {
        const [today] = await this.db.sequelize.query<DailyRow>(
          'SELECT page_views,sessions,register_views FROM platform_visit_totals WHERE visit_date=:day FOR UPDATE',
          { replacements: { day }, type: QueryTypes.SELECT, transaction });
        await this.db.sequelize.query(
          'INSERT INTO platform_traffic_filter (id,started_at,baseline_day,baseline_views,baseline_sessions,baseline_register_views,ip_hash,browser_hash) VALUES (1,:now,:day,:views,:sessions,:registration,:ipHash,:browserHash)',
          { replacements: { now, day, views: Number(today?.page_views ?? 0),
            sessions: Number(today?.sessions ?? 0), registration: Number(today?.register_views ?? 0),
            ipHash: addressHash, browserHash }, transaction });
        return { active: true, since: now.toISOString(), ipExcluded: !!addressHash };
      }
      await this.db.sequelize.query(
        'UPDATE platform_traffic_filter SET ip_hash=COALESCE(:ipHash,ip_hash), browser_hash=:browserHash WHERE id=1',
        { replacements: { ipHash: addressHash, browserHash }, transaction });
      return { active: true, since: new Date(existing.started_at).toISOString(),
        ipExcluded: !!(addressHash || existing.ip_hash) };
    });
  }

  async statistics(period: string | undefined, now = new Date()) {
    const days = period === '7' ? 7 : period === '90' ? 90 : period === 'all' ? null : 30;
    const requestedStart = days ? argentinaDay(now, days - 1) : null;
    const end = argentinaDay(now);
    const tomorrow = argentinaDay(new Date(now.getTime() + 24 * 60 * 60_000));
    const [filter] = await this.db.sequelize.query<FilterRow>(
      'SELECT * FROM platform_traffic_filter WHERE id=1', { type: QueryTypes.SELECT });
    const baselineDay = filter ? argentinaDay(new Date(filter.started_at)) : null;
    const start = baselineDay && (!requestedStart || baselineDay > requestedStart) ? baselineDay : requestedStart;
    const conditions = start ? 'visit_date BETWEEN :start AND :end' : 'visit_date <= :end';
    const [totals] = await this.db.sequelize.query<{ visits: number; sessions: number; registrations: number }>(
      'SELECT COALESCE(SUM(page_views),0) visits, COALESCE(SUM(sessions),0) sessions, COALESCE(SUM(register_views),0) registrations FROM platform_visit_totals WHERE ' + conditions,
      { replacements: { start, end }, type: QueryTypes.SELECT });
    const subtract = !!filter && !!baselineDay && start === baselineDay && start <= end;
    const excluded = subtract ? filter : null;
    const startTime = requestedStart ? new Date(requestedStart + 'T03:00:00.000Z') : null;
    const endTime = new Date(tomorrow + 'T03:00:00.000Z');
    const [shops] = await this.db.sequelize.query<{ total: number }>(
      'SELECT COUNT(*) total FROM commerces WHERE trial_started_at IS NOT NULL AND trial_started_at < :endTime ' +
        (startTime ? 'AND trial_started_at >= :startTime' : ''),
      { replacements: { startTime, endTime }, type: QueryTypes.SELECT });
    return { period: days ?? 'all',
      visits: Math.max(0, Number(totals.visits) - Number(excluded?.baseline_views ?? 0)),
      sessions: Math.max(0, Number(totals.sessions) - Number(excluded?.baseline_sessions ?? 0)),
      registrationViews: Math.max(0, Number(totals.registrations) - Number(excluded?.baseline_register_views ?? 0)),
      storesCreated: Number(shops.total),
      filteredSince: filter ? new Date(filter.started_at).toISOString() : null,
      ipExcluded: !!filter?.ip_hash };
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
