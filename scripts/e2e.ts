/**
 * 端到端核心链路验证
 *
 * 沙箱环境无法常驻运行 Next.js dev server（worker 进程会被杀），
 * 因此这里直接调用领域服务层，验证 PRD 的关键业务规则是否正确实现。
 *
 * 运行：node node_modules/tsx/dist/cli.mjs scripts/e2e.ts
 */

import { query, queryOne, transaction } from '../src/server/db';
import { createSessionToken, verifySessionToken } from '../src/lib/auth/session';
import { convertLeadToOpportunity, convertOpportunityToCustomer } from '../src/server/services/convert';
import { claimPoolItem, returnToPool } from '../src/server/services/pool';
import { createLead, appendFollowUp, markPseudo } from '../src/server/services/lead';
import { buildDataScope, getVisibleDeptIds } from '../src/lib/data-scope/scope';
import { hashPassword } from '../src/server/pglite';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ✓ ${name}`);
    pass += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    fail += 1;
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  console.log('═'.repeat(56));
  console.log('  轻客管家 · 核心链路验证');
  console.log('═'.repeat(56));

  /* ---------- 1. 会话签发与校验 ---------- */
  section('1. 会话鉴权');
  const token = await createSessionToken({
    userId: 'u-3',
    name: '王小雨',
    role: 'SALES',
    deptId: 'd-team-a',
    deptName: '一组',
    employeeNo: 'A0003',
  });
  const decoded = await verifySessionToken(token);
  check('JWT 签发后可正确解析', decoded?.userId === 'u-3');
  check('JWT 载荷包含角色与部门', decoded?.role === 'SALES' && decoded?.deptId === 'd-team-a');
  const bogus = await verifySessionToken('invalid.token.here');
  check('伪造 token 被拒绝', bogus === null);

  /* ---------- 2. 密码校验 ---------- */
  section('2. 登录密码');
  const stored = await queryOne<{ passwordHash: string }>(
    `SELECT "passwordHash" FROM "User" WHERE "employeeNo" = 'A0001'`,
  );
  check(
    '演示密码 Qingke@2026 哈希匹配',
    stored?.passwordHash === hashPassword('Qingke@2026'),
  );
  check(
    '错误密码哈希不匹配',
    stored?.passwordHash !== hashPassword('wrong-password'),
  );

  /* ---------- 3. 数据权限隔离 ---------- */
  section('3. 数据权限隔离（PRD 规则 3）');

  const salesUser = { userId: 'u-3', role: 'SALES', deptId: 'd-team-a', deptName: '一组', name: '王小雨', employeeNo: 'A0003' };
  const managerUser = { userId: 'u-2', role: 'SALES_MANAGER', deptId: 'd-sales', deptName: '华东销售部', name: '李文静', employeeNo: 'A0002' };
  const adminUser = { userId: 'u-1', role: 'SUPER_ADMIN', deptId: 'd-op', deptName: '运营中心', name: '张启明', employeeNo: 'A0001' };

  const salesScope = await buildDataScope(salesUser, 1, { isLead: true });
  const salesRows = await query<{ id: string }>(
    `SELECT "id" FROM "Lead" l WHERE ${salesScope.sql} AND "isDeleted" = FALSE`,
    salesScope.params,
  );

  // 顾问可见集合 = 本人名下 + 公海。用 SQL 独立算出期望值，避免依赖固定数字
  // （前面的用例会累积测试数据，固定断言会误报）
  const expectedSales = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "Lead"
      WHERE "isDeleted" = FALSE
        AND ("ownerId" = 'u-3' OR "status" = 'TO_POOL')`,
  );
  check(
    `顾问仅见本人+公海（${salesRows.length} 条）`,
    salesRows.length === expectedSales?.n,
    `SQL 口径算出 ${expectedSales?.n} 条`,
  );

  // 关键断言：顾问看不到其他顾问名下的数据
  const leaked = await query<{ id: string; ownerId: string }>(
    `SELECT "id","ownerId" FROM "Lead" l
      WHERE ${salesScope.sql} AND "isDeleted" = FALSE
        AND "ownerId" IS NOT NULL AND "ownerId" <> 'u-3'`,
    salesScope.params,
  );
  check(
    '顾问查询结果中不含任何他人数据（越权防线）',
    leaked.length === 0,
    `泄漏 ${leaked.length} 条`,
  );

  const mgrDepts = await getVisibleDeptIds('d-sales');
  check(
    `主管可见本部门+子孙（${mgrDepts.length} 个部门）`,
    mgrDepts.includes('d-sales') && mgrDepts.includes('d-team-a') && mgrDepts.includes('d-team-b'),
  );
  const mgrScope = await buildDataScope(managerUser, 1, { isLead: true });
  const mgrRows = await query<{ id: string }>(
    `SELECT "id" FROM "Lead" l WHERE ${mgrScope.sql} AND "isDeleted" = FALSE`,
    mgrScope.params,
  );
  check(
    `主管可见范围更大（${mgrRows.length} 条 ≥ 顾问 ${salesRows.length} 条）`,
    mgrRows.length >= salesRows.length,
  );
  // 主管能看到下属部门的数据。
  // 不依赖种子数据的具体分布，直接构造一条二组的线索来验证。
  // 注意占位符编号：scope.sql 已占用 $1~$N，追加的参数必须从 N+1 开始
  const teamBLeadId = `mgrtest-${Date.now()}`;
  await query(
    `INSERT INTO "Lead" ("id","code","name","phone","status","ownerId","deptId")
     VALUES ($1,$2,'二组测试线索',$3,'FOLLOWING','u-5','d-team-b')`,
    [teamBLeadId, `LD-MT-${Date.now()}`, `134${Date.now().toString().slice(-8)}`],
  );

  const mgrNext = mgrScope.params.length + 1;
  const mgrSeesTeamB = await query<{ id: string }>(
    `SELECT "id" FROM "Lead" l
      WHERE ${mgrScope.sql} AND "isDeleted" = FALSE AND "id" = $${mgrNext}`,
    [...mgrScope.params, teamBLeadId],
  );
  check('主管可见下属部门（二组）数据', mgrSeesTeamB.length === 1);

  // 反向验证：顾问不应看到这条二组线索
  const salesNext = salesScope.params.length + 1;
  const salesSeesTeamB = await query<{ id: string }>(
    `SELECT "id" FROM "Lead" l
      WHERE ${salesScope.sql} AND "isDeleted" = FALSE AND "id" = $${salesNext}`,
    [...salesScope.params, teamBLeadId],
  );
  check('顾问不可见他人部门数据（同级部门隔离）', salesSeesTeamB.length === 0);

  await query(`DELETE FROM "Lead" WHERE "id" = $1`, [teamBLeadId]);

  const adminScope = await buildDataScope(adminUser, 1, { isLead: true });
  check('超管权限条件为全放行', adminScope.sql === 'TRUE');

  /* ---------- 4. 手机号唯一（BR-L01/L03） ---------- */
  section('4. 手机号唯一约束');
  const testPhone = `139${Date.now().toString().slice(-8)}`;
  await query(
    `INSERT INTO "Lead" ("id","code","name","phone","status") VALUES ($1,$2,'测试A',$3,'FOLLOWING')`,
    [`t-${Date.now()}`, `LD-T-${Date.now()}`, testPhone],
  );
  let dupBlocked = false;
  try {
    await query(
      `INSERT INTO "Lead" ("id","code","name","phone","status") VALUES ($1,$2,'测试B',$3,'FOLLOWING')`,
      [`t2-${Date.now()}`, `LD-T2-${Date.now()}`, testPhone],
    );
  } catch {
    dupBlocked = true;
  }
  check('同手机号重复有效线索被拒绝（BR-L01）', dupBlocked);

  // 伪线索同手机号应可插入（待确认问题 4）
  let pseudoAllowed = true;
  try {
    await query(
      `INSERT INTO "Lead" ("id","code","name","phone","status") VALUES ($1,$2,'测试C',$3,'PSEUDO')`,
      [`t3-${Date.now()}`, `LD-T3-${Date.now()}`, testPhone],
    );
  } catch {
    pseudoAllowed = false;
  }
  check('已存在有效线索时，伪线索仍可录入', pseudoAllowed);

  // 清理
  await query(`DELETE FROM "Lead" WHERE "phone" = $1`, [testPhone]);

  /* ---------- 5. 新建线索（BR-L02/L04） ---------- */
  section('5. 新建线索');
  const newLead = await createLead(
    {
      name: '测试用户',
      phone: `138${Date.now().toString().slice(-8)}`,
      sourceChannelId: 'ch-1',
      intentCourseId: 'c-1',
      ownerId: 'u-4', // 顾问试图指定他人
    },
    salesUser,
  );
  const created = await queryOne<{ ownerId: string; status: string; deptId: string }>(
    `SELECT "ownerId","status","deptId" FROM "Lead" WHERE "id" = $1`,
    [newLead.id],
  );
  check(
    'BR-L02 顾问新建线索归属人强制为本人',
    created?.ownerId === 'u-3',
    `实际 ownerId=${created?.ownerId}`,
  );
  check('BR-L04 有归属人时状态为待跟进', created?.status === 'FOLLOWING');

  /* ---------- 6. 跟进记录（仅追加） ---------- */
  section('6. 跟进记录');
  const beforeCount = await queryOne<{ n: number }>(
    `SELECT "followCount" FROM "Lead" WHERE "id" = $1`,
    [newLead.id],
  );
  await appendFollowUp(
    {
      bizType: 'LEAD',
      bizId: newLead.id,
      method: 'PHONE',
      result: 'INTERESTED',
      content: '第一次电话沟通，客户对课程内容感兴趣，约了周末试听。',
      nextFollowAt: new Date(Date.now() + 86400000).toISOString(),
    },
    salesUser,
  );
  const afterCount = await queryOne<{ n: number; lastFollowAt: Date | null }>(
    `SELECT "followCount" AS n, "lastFollowAt" FROM "Lead" WHERE "id" = $1`,
    [newLead.id],
  );
  check('跟进次数 +1', afterCount?.n === (beforeCount?.n ?? 0) + 1);
  check('最后跟进时间已更新', afterCount?.lastFollowAt !== null);

  const todo = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "Todo" WHERE "bizId" = $1 AND "doneAt" IS NULL`,
    [newLead.id],
  );
  check('设置了下次跟进时间则生成待办', (todo?.n ?? 0) >= 1);

  /* ---------- 7. 转商机（原子操作 BR-C01~C05） ---------- */
  section('7. 转商机（核心原子操作）');
  const oppResult = await convertLeadToOpportunity(
    {
      leadId: newLead.id,
      name: '测试用户-Python入门',
      customerName: '测试用户',
      phone: (await queryOne<{ phone: string }>(`SELECT "phone" FROM "Lead" WHERE "id" = $1`, [newLead.id]))!.phone,
      courseId: 'c-1',
      amount: 4800,
      expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      stage: 'FOLLOWING',
    },
    salesUser,
  );
  check('转商机成功并返回商机编号', !!oppResult.code, `编号 ${oppResult.code}`);

  const afterConv = await queryOne<{
    status: string; convertedOppId: string | null; conversionDays: number | null;
  }>(`SELECT "status","convertedOppId","conversionDays" FROM "Lead" WHERE "id" = $1`, [newLead.id]);
  check('线索状态转为已转商机（BR-C02）', afterConv?.status === 'CONVERTED');
  check('建立双向关联（BR-C03）', afterConv?.convertedOppId === oppResult.id);
  check('记录转化耗时（BR-C05）', afterConv?.conversionDays !== null);

  // 重复转化应被拒绝（BR-C04）
  let repeatBlocked = false;
  try {
    await convertLeadToOpportunity(
      {
        leadId: newLead.id,
        name: '重复转化',
        customerName: 'x',
        phone: '13900000000',
        courseId: 'c-1',
        amount: 100,
        expectedCloseDate: new Date().toISOString(),
        stage: 'FOLLOWING',
      },
      salesUser,
    );
  } catch {
    repeatBlocked = true;
  }
  check('同一线索不可重复转化（BR-C04）', repeatBlocked);

  /* ---------- 8. 公海池并发领取（BR-H03） ---------- */
  section('8. 公海池并发领取');
  // 构造一个公海线索
  const poolPhone = `137${Date.now().toString().slice(-8)}`;
  await query(
    `INSERT INTO "Lead" ("id","code","name","phone","status","ownerId")
     VALUES ($1,$2,'公海测试',$3,'TO_POOL',NULL)`,
    [`pool-${Date.now()}`, `LD-P-${Date.now()}`, poolPhone],
  );
  const poolLead = await queryOne<{ id: string }>(
    `SELECT "id" FROM "Lead" WHERE "phone" = $1`,
    [poolPhone],
  );

  // 两个顾问并发领取同一条
  const [r1, r2] = await Promise.all([
    claimPoolItem({ bizType: 'LEAD', ids: [poolLead!.id], user: salesUser }),
    claimPoolItem({ bizType: 'LEAD', ids: [poolLead!.id], user: managerUser }),
  ]);
  const totalSuccess = r1.success.length + r2.success.length;
  check(
    `并发领取有且仅有一人成功（${totalSuccess} 人成功）`,
    totalSuccess === 1,
    `${r1.success.length} + ${r2.success.length}`,
  );

  const claimed = await queryOne<{ ownerId: string; status: string }>(
    `SELECT "ownerId","status" FROM "Lead" WHERE "id" = $1`,
    [poolLead!.id],
  );
  check('领取后状态为待跟进', claimed?.status === 'FOLLOWING');
  check('领取后归属人非空', claimed?.ownerId !== null);

  /* ---------- 9. 踢回公海 ---------- */
  section('9. 踢回公海');
  await returnToPool({
    bizType: 'LEAD',
    bizId: poolLead!.id,
    reason: 'LONG_NO_FOLLOW',
    remark: '测试',
    user: salesUser,
  });
  const returned = await queryOne<{ ownerId: string | null; status: string }>(
    `SELECT "ownerId","status" FROM "Lead" WHERE "id" = $1`,
    [poolLead!.id],
  );
  check('踢回后归属人清空（BR-H01）', returned?.ownerId === null);
  check('踢回后状态为公海池', returned?.status === 'TO_POOL');

  const history = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "OwnershipHistory" WHERE "bizId" = $1`,
    [poolLead!.id],
  );
  check('归属轨迹完整保留（BR-H05）', (history?.n ?? 0) >= 2);

  /* ---------- 10. 标记伪线索（BR-P01/P03） ---------- */
  section('10. 标记伪线索');
  const pseudoPhone = `136${Date.now().toString().slice(-8)}`;
  await query(
    `INSERT INTO "Lead" ("id","code","name","phone","status","ownerId","followCount")
     VALUES ($1,$2,'伪线索测试',$3,'FOLLOWING','u-3',3)`,
    [`ps-${Date.now()}`, `LD-PS-${Date.now()}`, pseudoPhone],
  );
  const psLead = await queryOne<{ id: string }>(`SELECT "id" FROM "Lead" WHERE "phone" = $1`, [pseudoPhone]);
  await query(
    `INSERT INTO "FollowUp" ("id","bizType","bizId","method","content","createdById")
     VALUES ($1,'LEAD',$2,'PHONE','这是一条标记伪线索前就已存在的历史跟进记录，用于验证 BR-P03 不物理删除跟进记录。', 'u-3')`,
    [`fu-ps-${Date.now()}`, psLead!.id],
  );
  await markPseudo({ leadId: psLead!.id, reason: 'INVALID_NUMBER' }, salesUser);

  const psAfter = await queryOne<{ status: string }>(`SELECT "status" FROM "Lead" WHERE "id" = $1`, [psLead!.id]);
  check('标记后状态为伪线索', psAfter?.status === 'PSEUDO');

  // BR-P03：标记伪线索后，跟进记录必须仍然存在（不能被物理删除）
  const keptFollowUps = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "FollowUp" WHERE "bizId" = $1`,
    [psLead!.id],
  );
  check('保留历史跟进记录（BR-P03）', (keptFollowUps?.n ?? 0) >= 1, `实际 ${keptFollowUps?.n} 条`);

  /* ---------- 11. 转客户 ---------- */
  section('11. 转客户');

  // 先验证查重：同手机号+姓名 已存在客户时必须拦截（PRD 4.3.5）
  const dupOpp = await queryOne<{ id: string; phone: string; customerName: string }>(
    `SELECT o."id", o."phone", o."customerName" FROM "Opportunity" o
      WHERE o."stage" = 'WON'
        AND EXISTS (SELECT 1 FROM "Customer" c
                     WHERE c."phone" = o."phone" AND c."name" = o."customerName" AND c."isDeleted" = FALSE)
      LIMIT 1`,
  );
  if (dupOpp) {
    let dupBlocked = false;
    try {
      await convertOpportunityToCustomer({ oppId: dupOpp.id }, managerUser);
    } catch (e) {
      dupBlocked = (e as { status?: number }).status === 409;
    }
    check('手机号+姓名 重复时拦截并提示合并（PRD 4.3.5）', dupBlocked);
  }

  // 构造一个全新的商机用于正常转客户
  const convertPhone = `135${Date.now().toString().slice(-8)}`;
  const tmpOppId = `tmp-opp-${Date.now()}`;
  await query(
    `INSERT INTO "Opportunity"
     ("id","code","name","customerName","phone","courseId","amount","expectedCloseDate","stage","stageEnteredAt",
      "ownerId","deptId","sourceChannelId","wonAt","wonAmount","wonDate")
     VALUES ($1,$2,'新转化测试','新客户姓名',$3,'c-1',8800,NOW(),'WON',NOW(),'u-3','d-team-a','ch-1',NOW(),8800,NOW())`,
    [tmpOppId, `OP-T-${Date.now()}`, convertPhone],
  );

  const cust = await convertOpportunityToCustomer({ oppId: tmpOppId }, salesUser);
  check('转客户成功', !!cust.code, `客户编号 ${cust.code}`);

  const custRow = await queryOne<{ sourceOppId: string; amount: number; status: string }>(
    `SELECT "sourceOppId","amount","status" FROM "Customer" WHERE "id" = $1`,
    [cust.id],
  );
  check('客户与商机建立永久关联（BR-T01）', custRow?.sourceOppId === tmpOppId);
  check('客户初始状态为正常在读', custRow?.status === 'ACTIVE');
  check('继承成交金额（渠道 ROI 归集基础）', custRow?.amount === 8800);

  // 未赢单的商机不允许转客户
  const notWon = await queryOne<{ id: string }>(`SELECT "id" FROM "Opportunity" WHERE "stage" = 'FOLLOWING' LIMIT 1`);
  if (notWon) {
    let wonBlocked = false;
    try {
      await convertOpportunityToCustomer({ oppId: notWon.id }, salesUser);
    } catch (e) {
      wonBlocked = (e as { status?: number }).status === 400;
    }
    check('未赢单的商机不允许转客户', wonBlocked);
  }

  // 清理
  await query(`DELETE FROM "Customer" WHERE "id" = $1`, [cust.id]);
  await query(`DELETE FROM "Opportunity" WHERE "id" = $1`, [tmpOppId]);

  /* ---------- 12. 看板漏斗（BR-D03/D04） ---------- */
  section('12. 看板统计口径');
  const funnel = await queryOne<{ converted: number; total: number }>(
    `SELECT
       (SELECT COUNT(*) FROM "StatusChangeLog" WHERE "bizType"='LEAD' AND "action"='CONVERT_LEAD')::int AS converted,
       (SELECT COUNT(*) FROM "Lead" WHERE "isDeleted"=FALSE AND "status" <> 'PSEUDO')::int AS total`,
  );
  check('转商机数按状态跃迁统计（BR-D04）', (funnel?.converted ?? 0) >= 3, `实际 ${funnel?.converted}`);

  const { formatRate } = await import('../src/lib/utils/format');
  check('分母为 0 时显示 -- 而非 0（BR-D03）', formatRate(0, 0) === '--');
  check('正常转化率计算', formatRate(3, 12) === '25.0%');

  /* ---------- 清理测试数据 ---------- */
  await query(`DELETE FROM "Lead" WHERE "phone" IN ($1,$2,$3)`, [testPhone, poolPhone, pseudoPhone]);

  /* ---------- 汇总 ---------- */
  console.log('\n' + '═'.repeat(56));
  console.log(`  通过 ${pass}　失败 ${fail}`);
  console.log('═'.repeat(56));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\n验证过程出错：', e);
  process.exit(1);
});
