import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { DDL } from '../../scripts/ddl';
import { seed } from '../../scripts/seed-data';

/**
 * 数据库访问层（自适应双驱动）
 *
 * 背景：部署到 Vercel Serverless 后，函数目录 /var/task 是只读文件系统，
 * PGlite 无法写入本地数据文件（EROFS: read-only file system, mkdir '/var/task/.pglite'）。
 *
 * 因此运行时按环境变量自动切换：
 * · 配置了 DATABASE_URL → 连接托管 PostgreSQL（生产推荐，数据持久化）
 * · 未配置 DATABASE_URL → PGlite 内存模式（演示可用，实例冷启动后重置为演示数据）
 *
 * 首次使用时自动建表并写入演示数据（幂等：CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING）。
 * 上层 services 只依赖 exec / query / transaction 等导出接口，切换驱动无需改动任何调用方。
 */

const DATABASE_URL = process.env.DATABASE_URL;

/** 远程 PostgreSQL 连接池（惰性创建） */
let remotePool: Pool | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __qkgjDb: DbLike | undefined;
  // eslint-disable-next-line no-var
  var __qkgjInit: Promise<void> | undefined;
}

/** 统一的 SQL 执行接口（PGlite 与 pg 兼容） */
type DbLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  waitReady: Promise<unknown>;
  close(): Promise<void>;
};

function isRemote(): boolean {
  return DATABASE_URL != null && DATABASE_URL !== '';
}

/** 首次使用时自动建表 + 演示数据（幂等），通过 waitReady getter 惰性触发 */
function ensureSchema(): Promise<void> {
  if (!globalThis.__qkgjInit) {
    globalThis.__qkgjInit = (async () => {
      const db = getDb();
      await db.exec(DDL);
      await seed(db);
    })().catch((e) => {
      globalThis.__qkgjInit = undefined;
      throw e;
    });
  }
  return globalThis.__qkgjInit;
}

/** 托管 PostgreSQL 连接（惰性创建） */
function getPoolWrapper(): DbLike {
  if (!globalThis.__qkgjDb) {
    remotePool = new Pool({ connectionString: DATABASE_URL!, max: 1 });
    let ready: Promise<unknown> | null = null;
    globalThis.__qkgjDb = {
      query: async <T,>(sql: string, params: unknown[] = []) => {
        const result = await remotePool!.query(sql, params as never);
        return result as { rows: T[] };
      },
      exec: (sql) => remotePool!.query(sql),
      get waitReady() {
        if (!ready) ready = ensureSchema();
        return ready;
      },
      close: () => remotePool!.end(),
    };
  }
  return globalThis.__qkgjDb;
}

/** PGlite 内存模式（惰性创建，不写磁盘） */
function getPgliteWrapper(): DbLike {
  if (!globalThis.__qkgjDb) {
    const instance = new PGlite();
    let ready: Promise<unknown> | null = null;
    globalThis.__qkgjDb = {
      query: <T,>(sql: string, params: unknown[] = []) =>
        instance.query<T>(sql, params).then((r) => ({ rows: r.rows })),
      exec: (sql) => instance.exec(sql),
      get waitReady() {
        if (!ready) ready = ensureSchema().then(() => instance.waitReady);
        return ready;
      },
      close: () => instance.close(),
    };
  }
  return globalThis.__qkgjDb;
}

/** 获取数据库连接。返回包装对象，query/exec/waitReady/close 与 PGlite 保持一致 */
export function getDb(): DbLike {
  return isRemote() ? getPoolWrapper() : getPgliteWrapper();
}

/** 执行建表 / 批量 SQL */
export async function exec(sql: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.exec(sql);
}

/** 查询，返回全部行 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const db = getDb();
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
  await ensureSchema();

  if (isRemote()) {
    // pg：从连接池取出专用连接，BEGIN/COMMIT/ROLLBACK
    const client = await remotePool!.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  const db = getDb();
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
