/**
 * 数据库初始化：建表 + 写入演示数据
 *
 * 运行：npm run db:init
 * 或：npm run db:init -- --reset   先清空所有表再重建
 *
 * 建表与种子数据逻辑已抽到 scripts/seed-data.ts，云端运行时共用。
 */

import { getPglite } from '../src/server/pglite';
import { DDL } from './ddl';
import { seed } from './seed-data';

const RESET = process.argv.includes('--reset');

async function main() {
  const db = getPglite();
  await db.waitReady;
  console.log('PGlite 已就绪');

  if (RESET) {
    console.log('\n[0/2] 清空旧数据');
    // 用 TRUNCATE 而非 DROP TABLE：
    // PGlite 的 DROP 路径会触发宿主的删除保护策略（safe-delete），
    // TRUNCATE 走纯 SQL，不涉及文件删除。
    await db.exec(`
      TRUNCATE TABLE
        "Notification","Todo","Attachment","OperationLog","PriceHistory","AmountHistory",
        "OwnershipHistory","StatusChangeLog","ServiceRecord","FollowUp",
        "Customer","Activity","Opportunity","Lead","Channel","Course",
        "RolePerm","SystemConfig","User","Dept"
      RESTART IDENTITY CASCADE;
    `);
    console.log('  ✓ 已清空');
  }

  console.log('\n[1/2] 建表');
  await db.exec(DDL);
  console.log('  ✓ 全部表与索引已创建（含手机号部分唯一索引）');

  console.log('\n[2/2] 写入演示数据');
  await seed(db);

  const tables = await db.query<{ n: number }>(`
    SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public'
  `);
  console.log(`\n✓ 初始化完成，共 ${tables.rows[0]?.n ?? 0} 张表`);
  console.log('\n  登录地址：http://localhost:3100/login');
  console.log('  统一密码：Qingke@2026\n');
  console.log('  超级管理员  张启明  A0001');
  console.log('  销售主管    李文静  A0002');
  console.log('  销售顾问    王小雨  A0003\n');
}

main()
  .catch((e) => {
    console.error('\n✗ 初始化失败：', e);
    process.exit(1);
  })
  .then(async () => {
    const db = getPglite();
    await db.close();
    process.exit(0);
  });
