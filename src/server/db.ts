import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 数据库访问层（PGlite 方案）
 *
 * 为什么用 PGlite 而不是本机 PostgreSQL：
 * · brew install 被沙箱锁目录策略拦截，无法完成
 * · Postgres.app 的 DMG 从 GitHub 下载被限速到 8KB/s
 * · PGlite 走 npm 源，零系统权限、零外部下载
 *
 * PGlite 是 PostgreSQL 的 WASM 构建，支持标准语法：
 * 部分唯一索引、JSONB、FILTER 聚合、CTE、子查询。
 * 唯一不支持的是 `SELECT ... FOR UPDATE` 行锁，
 * 因此并发控制统一改用：
 *   1. 条件更新的原子性（UPDATE ... WHERE owner_id IS NULL RETURNING）
 *   2. version 字段乐观锁
 *
 * 若将来切换到标准 PostgreSQL，只需改这一层的实现，
 * 上层 services 的调用方式完全不变。
 */

const DATA_DIR = resolve(process.cwd(), '.pglite');

declare global {
  // eslint-disable-next-line no-var
  var __qkgjDb: PGlite | undefined;
}

export function getDb(): PGlite {
  if (globalThis.__qkgjDb) return globalThis.__qkgjDb;

  const instance = new PGlite(DATA_DIR);
  globalThis.__qkgjDb = instance;
  return instance;
}

/** 执行建表 / 批量 SQL */
export async function exec(sql: string): Promise<void> {
  const db = getDb();
  await db.waitReady;
  await db.exec(sql);
}

/** 查询，返回全部行 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = getDb();
  await db.waitReady;
  const result = await db.query<T>(sql, params);
  return result.rows;
}

/** 查询单行，无结果返回 null */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 查询单值（如 count / sum） */
export async function queryScalar<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const row = await queryOne<Record<string, T>>(sql, params);
  if (!row) return null;
  const keys = Object.keys(row);
  return keys.length > 0 ? (row[keys[0]!] ?? null) : null;
}

/** 事务包裹。原子操作必须走这里，任一失败整体回滚 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = getDb();
  await db.waitReady;
  await db.exec('BEGIN');
  try {
    const result = await fn();
    await db.exec('COMMIT');
    return result;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

/** 生成短 ID，避免额外依赖 cuid */
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${rand}`;
}

/** 业务编号：LD-20261011-0001 */
export function makeCode(prefix: string, seq: number, date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}

/** 取当日序号 */
export async function nextSeq(
  table: 'Lead' | 'Opportunity' | 'Customer',
  prefix: string,
): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "code" LIKE $1`,
    [`${prefix}-%`],
  );
  return (row?.n ?? 0) + 1;
}