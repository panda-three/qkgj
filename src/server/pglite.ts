import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * PGlite —— PostgreSQL 的 WASM 版本，以 npm 包形态运行
 *
 * 为什么用它而不是本机 PostgreSQL：
 * · 本机 brew install 被沙箱的锁目录策略拦截，无法完成
 * · GitHub 下载 Postgres.app 被限速到 8KB/s，107MB 需数小时
 * · PGlite 走npm 源，与其他依赖一起安装，零系统权限、零外部下载
 *
 * 能力边界（重要）：
 * · 支持标准 PostgreSQL 语法：部分唯一索引、JSONB、FILTER 聚合、CTE
 * · **不支持 `SELECT ... FOR UPDATE` 行锁**
 *   → 本项目的并发领取改用 `UPDATE ... WHERE owner_id IS NULL RETURNING`，
 *     由数据库的条件更新保证原子性，不依赖行锁（见 src/server/services/pool.ts）
 *   → 转商机等需要行锁的场景，用 `version` 乐观锁替代
 * · 数据存本地目录 .pglite/，删除该目录即可重置
 */

const DATA_DIR = resolve(process.cwd(), '.pglite');

declare global {
  // eslint-disable-next-line no-var
  var __qkgjPglite: PGlite | undefined;
}

export function getPglite(): PGlite {
  if (globalThis.__qkgjPglite) return globalThis.__qkgjPglite;

  mkdirSync(dirname(DATA_DIR), { recursive: true });
  const instance = new PGlite(DATA_DIR, {
    // 本机开发无需密码，与 .env.example 的连接串保持一致
    username: 'postgres',
  });
  globalThis.__qkgjPglite = instance;
  return instance;
}

/** 供 seed 与手工运维使用的 SQL 执行入口 */
export async function exec(sql: string): Promise<void> {
  await getPglite().exec(sql);
}

/** 查询并返回全部行 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const result = await getPglite().query<T>(sql);
  return result.rows;
}

/**
 * 应用手机号部分唯一索引。
 * BR-L01 手机号唯一 / BR-L03 仅一条有效线索 / 允许伪线索后重录，
 * 三条要求同时成立，只能靠部分唯一索引实现。
 */
export async function ensurePhoneUniqueIndex(): Promise<void> {
  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS "uniq_lead_phone_active"
      ON "Lead" ("phone")
      WHERE "status" NOT IN ('PSEUDO', 'CONVERTED')
        AND "is_deleted" = false;
  `);
}

/** 密码哈希，与 seed 脚本保持一致 */
export function hashPassword(plain: string): string {
  return createHash('sha256').update(`qingkeguanjia:${plain}`).digest('hex');
}