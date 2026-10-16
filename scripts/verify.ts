import { getDb } from '../src/server/db';

async function main() {
  const db = getDb();
  await db.waitReady;

  const tables = ['Dept', 'User', 'RolePerm', 'SystemConfig', 'Course', 'Channel',
    'Lead', 'Opportunity', 'Customer', 'FollowUp', 'StatusChangeLog',
    'OwnershipHistory', 'ServiceRecord'];

  console.log('表数据统计：');
  for (const t of tables) {
    const r = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    const n = r.rows[0]?.n ?? 0;
    console.log(`  ${n > 0 ? '✓' : '✗'} ${t.padEnd(20)} ${n}`);
  }

  console.log('\n线索按状态分布：');
  const byStatus = await db.query<{ status: string; n: number }>(
    `SELECT "status", COUNT(*)::int AS n FROM "Lead" GROUP BY "status" ORDER BY "status"`,
  );
  for (const r of byStatus.rows) console.log(`  ${r.status.padEnd(12)} ${r.n}`);

  console.log('\n商机按阶段分布：');
  const byStage = await db.query<{ stage: string; n: number }>(
    `SELECT "stage", COUNT(*)::int AS n FROM "Opportunity" GROUP BY "stage" ORDER BY "stage"`,
  );
  for (const r of byStage.rows) console.log(`  ${r.stage.padEnd(12)} ${r.n}`);

  console.log('\n★ 地基决策验证：手机号部分唯一索引');
  const test1 = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "Lead" WHERE "phone" = '13910000001' AND "status" NOT IN ('PSEUDO','CONVERTED')`,
  );
  console.log(`  有效线索数：${test1.rows[0]?.n}（应为 1）`);

  // 尝试插入重复的有效线索 → 应被拒绝
  try {
    await db.query(
      `INSERT INTO "Lead" ("id","code","name","phone","status") VALUES ('test-dup','LD-TEST-0001','测试','13910000001','FOLLOWING')`,
    );
    console.log('  ✗ 重复有效线索竟然插入成功，唯一索引失效');
  } catch (e) {
    console.log('  ✓ 重复有效线索被拒绝（唯一索引生效）');
  }
  // 清理残留
  await db.exec(`DELETE FROM "Lead" WHERE "id" = 'test-dup'`).catch(() => {});

  console.log('\n★ 看板漏斗统计（按状态跃迁时间）');
  const funnel = await db.query<{ toStatus: string; n: number }>(
    `SELECT "toStatus", COUNT(*)::int AS n
       FROM "StatusChangeLog"
      WHERE "bizType" = 'LEAD' AND "action" = 'CONVERT_LEAD'
      GROUP BY "toStatus"`,
  );
  console.log(`  转商机事件：${funnel.rows[0]?.n ?? 0} 条（应为 2）`);

  console.log('\n演示账号：');
  const users = await db.query<{ employeeNo: string; name: string; role: string; deptName: string }>(
    `SELECT u."employeeNo", u."name", u."role", d."name" AS "deptName"
       FROM "User" u JOIN "Dept" d ON d."id" = u."deptId"
      ORDER BY u."employeeNo"`,
  );
  for (const u of users.rows) {
    console.log(`  ${u.employeeNo}  ${u.name}  ${u.role.padEnd(15)} ${u.deptName}`);
  }

  await db.close();
}

main().catch((e) => {
  console.error('检查失败：', e);
  process.exit(1);
});