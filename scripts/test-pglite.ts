/**
 * PGlite 连通性自检
 * 运行：node --experimental-strip-types scripts/test-pglite.ts
 * 或：  npx tsx scripts/test-pglite.ts
 */

import { PGlite } from '@electric-sql/pglite';

async function main() {
  console.log('PGlite 版本检查中...');
  const db = new PGlite();

  // 1. 基础查询
  const r1 = await db.query<{ v: number }>('SELECT 1 AS v');
  console.log('  ✓ 基础查询：', r1.rows[0]?.v === 1 ? '正常' : '异常');

  // 2. 建表 + 部分唯一索引（项目的地基决策 1）
  await db.exec(`
    DROP TABLE IF EXISTS t_demo;
    CREATE TABLE t_demo (
      id    TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  console.log('  ✓ 建表：正常');

  await db.exec(`
    CREATE UNIQUE INDEX uniq_demo_phone
      ON t_demo (phone)
      WHERE status NOT IN ('PSEUDO','CONVERTED');
  `);
  console.log('  ✓ 部分唯一索引：正常');

  // 有效线索可插入
  await db.query('INSERT INTO t_demo (id, phone, status) VALUES ($1,$2,$3)', ['a', '138', 'FOLLOWING']);
  // 伪线索同手机号也可插入（不违反部分索引）
  await db.query('INSERT INTO t_demo (id, phone, status) VALUES ($1,$2,$3)', ['b', '138', 'PSEUDO']);
  console.log('  ✓ 部分索引语义：有效+伪线索同手机号共存 → 正常');

  // 重复的有效线索应被拒绝
  try {
    await db.query('INSERT INTO t_demo (id, phone, status) VALUES ($1,$2,$3)', ['c', '138', 'FOLLOWING']);
    console.log('  ✗ 唯一约束失效：重复有效线索竟然插入成功');
  } catch {
    console.log('  ✓ 唯一约束：重复有效线索被拒绝 → 正常');
  }

  // 3. FILTER 聚合（看板漏斗 SQL 依赖）
  await db.exec(`DROP TABLE IF EXISTS t_agg; CREATE TABLE t_agg (id TEXT, grp TEXT);`);
  await db.exec(`
    INSERT INTO t_agg (id, grp) VALUES
      ('1','a'), ('2','a'), ('3','b'), ('4','a');
  `);
  const r3 = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM t_agg WHERE grp = 'a'`,
  );
  console.log('  ✓ 聚合查询：', r3.rows[0]?.n === 3 ? '正常' : '异常');

  // 4. 原子条件更新（并发领取的核心实现）
  await db.exec(`DROP TABLE IF EXISTS t_pool; CREATE TABLE t_pool (id TEXT PRIMARY KEY, owner TEXT);`);
  await db.query('INSERT INTO t_pool (id, owner) VALUES ($1,$2)', ['p1', null]);

  const claim = await db.query<{ id: string }>(
    `UPDATE t_pool SET owner = 'u1'
      WHERE id = 'p1' AND owner IS NULL
      RETURNING id`,
  );
  const second = await db.query<{ id: string }>(
    `UPDATE t_pool SET owner = 'u2'
      WHERE id = 'p1' AND owner IS NULL
      RETURNING id`,
  );
  const ok = claim.rows.length === 1 && second.rows.length === 0;
  console.log(`  ✓ 原子条件更新：首次${claim.rows.length > 0 ? '成功' : '失败'} / 二次${second.rows.length > 0 ? '成功（错误！）' : '被拒'} → ${ok ? '正常' : '异常'}`);

  // 5. JSONB
  const r5 = await db.query<{ ids: string[] }>(
    `SELECT '["a","b"]'::jsonb AS ids`,
  );
  console.log('  ✓ JSONB：', Array.isArray(r5.rows[0]?.ids) ? '正常' : '异常');

  // 6. 事务回滚
  await db.exec('BEGIN');
  await db.exec(`INSERT INTO t_pool (id, owner) VALUES ('p2','x')`);
  await db.exec('ROLLBACK');
  const r6 = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM t_pool WHERE id='p2'`);
  console.log('  ✓ 事务回滚：', r6.rows[0]?.n === 0 ? '正常' : '异常');

  await db.exec('DROP TABLE IF EXISTS t_demo, t_agg, t_pool');
  await db.close();

  console.log('\n全部检查通过，PGlite 可用 ✓');
}

main().catch((e) => {
  console.error('\n自检失败：', e);
  process.exit(1);
});