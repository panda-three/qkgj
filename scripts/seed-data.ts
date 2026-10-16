/**
 * 演示数据 seed —— 本地初始化和云端运行时共用
 *
 * 幂等：全部 INSERT 使用 ON CONFLICT ... DO NOTHING，
 * 重复执行不会产生重复数据，可直接用于 Serverless 冷启动初始化。
 */
import { hashPassword } from '../src/server/pglite';

/** 业务编号：LD-20261011-0001 */
export function code(prefix: string, seq: number, date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

/**
 * 写入演示数据。db 只需提供 query(sql, params) 接口，
 * PGlite 与 pg Pool 的签名一致，可通用。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seed(db: any): Promise<void> {
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);

  /* ---------- 部门树 ---------- */
  const depts = [
    ['d-root', 'HQ', '总部', '/root/', null, 1],
    ['d-op', 'OPERATION', '运营中心', '/root/operation/', 'd-root', 1],
    ['d-sales', 'SALES_EAST', '华东销售部', '/root/sales/east/', 'd-root', 2],
    ['d-team-a', 'SALES_EAST_A', '一组', '/root/sales/east/a/', 'd-sales', 1],
    ['d-team-b', 'SALES_EAST_B', '二组', '/root/sales/east/b/', 'd-sales', 2],
  ];
  for (const [id, code_, name, path, parentId, sortNo] of depts) {
    await q(
      `INSERT INTO "Dept" ("id","code","name","path","parentId","sortNo")
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("id") DO NOTHING`,
      [id, code_, name, path, parentId, sortNo],
    );
  }

  /* ---------- 账号 ---------- */
  const password = hashPassword('Qingke@2026');
  const users = [
    ['u-1', 'A0001', '张启明', '13800000001', 'd-op', 'SUPER_ADMIN'],
    ['u-2', 'A0002', '李文静', '13800000002', 'd-sales', 'SALES_MANAGER'],
    ['u-3', 'A0003', '王小雨', '13800000003', 'd-team-a', 'SALES'],
    ['u-4', 'A0004', '陈志强', '13800000004', 'd-team-a', 'SALES'],
    ['u-5', 'A0005', '刘思彤', '13800000005', 'd-team-b', 'SALES'],
    ['u-6', 'A0006', '赵磊', '13800000006', 'd-team-b', 'SALES'],
  ];
  for (const [id, no, name, phone, deptId, role] of users) {
    await q(
      `INSERT INTO "User" ("id","employeeNo","name","phone","deptId","role","passwordHash","mustChangePwd")
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) ON CONFLICT ("id") DO NOTHING`,
      [id, no, name, phone, deptId, role, password],
    );
  }
  await q(`UPDATE "Dept" SET "leaderId"='u-1' WHERE "id"='d-op'`);
  await q(`UPDATE "Dept" SET "leaderId"='u-2' WHERE "id"='d-sales'`);

  /* ---------- 渠道 ---------- */
  const channels = [
    ['ch-1', '百度SEM', 'PAID_AD', 48000],
    ['ch-2', '抖音信息流', 'PAID_AD', 62000],
    ['ch-3', '知乎内容', 'CONTENT', 12000],
    ['ch-4', '老学员转介绍', 'REFERRAL', 5000],
    ['ch-5', '职教机构合作', 'CROSS', 15000],
    ['ch-6', '自然流量', 'ORGANIC', 0],
  ];
  for (const [id, name, type, cost] of channels) {
    await q(
      `INSERT INTO "Channel" ("id","name","type","cost","ownerId")
       VALUES ($1,$2,$3,$4,'u-2') ON CONFLICT ("id") DO NOTHING`,
      [id, name, type, cost],
    );
  }

  /* ---------- 课程 ---------- */
  const courses = [
    ['c-1', 'C001', 'Python 程序设计入门', 'VOCATIONAL', 'LIVE', 4800],
    ['c-2', 'C002', '前端开发就业班', 'VOCATIONAL', 'HYBRID', 12800],
    ['c-3', 'C003', '人工智能应用基础', 'ADULT_EDU', 'RECORDED', 3600],
    ['c-4', 'C004', '数据分析师训练营', 'VOCATIONAL', 'LIVE', 8800],
    ['c-5', 'C005', '成人本科学历提升', 'ADULT_EDU', 'OFFLINE', 6800],
    ['c-6', 'C006', 'Office 办公效率课', 'INTEREST', 'RECORDED', 999],
    ['c-7', 'C007', '少儿编程启蒙', 'K12', 'LIVE', 2980],
    ['c-8', 'C008', 'AI 提示工程实战', 'VOCATIONAL', 'LIVE', 5980],
    ['c-9', 'C009', '电商运营实战', 'VOCATIONAL', 'HYBRID', 7680],
    ['c-10', 'C010', '职业资格考证辅导', 'ADULT_EDU', 'OFFLINE', 3280],
    ['c-11', 'C011', '短视频运营实战', 'INTEREST', 'RECORDED', 1980],
    ['c-12', 'C012', '企业管理进阶课', 'ADULT_EDU', 'LIVE', 15800],
  ];
  for (const [i, row] of courses.entries()) {
    const [id, code_, name, category, mode, price] = row as [
      string, string, string, string, string, number,
    ];
    await q(
      `INSERT INTO "Course" ("id","code","name","category","mode","price","cost","status","coverIndex")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ON',$8) ON CONFLICT ("id") DO NOTHING`,
      [id, code_, name, category, mode, price, price * 0.45, i],
    );
  }

  /* ---------- 线索 ---------- */
  const leads = [
    // id, name, phone, gender, channel, course, status, ownerId, days, followCount
    ['l-1', '周敏', '13910000001', 'FEMALE', 'ch-2', 'c-2', 'FOLLOWING', 'u-3', 3, 2],
    ['l-2', '吴建国', '13910000002', 'MALE', 'ch-1', 'c-4', 'FOLLOWING', 'u-3', 8, 3],
    ['l-3', '郑雅雯', '13910000003', 'FEMALE', 'ch-3', 'c-3', 'PENDING', null, 1, 0],
    ['l-4', '孙浩然', '13910000004', 'MALE', 'ch-4', 'c-8', 'FOLLOWING', 'u-4', 5, 1],
    ['l-5', '林巧云', '13910000005', 'FEMALE', 'ch-2', 'c-2', 'FOLLOWING', 'u-4', 12, 4],
    ['l-6', '黄志远', '13910000006', 'MALE', 'ch-5', 'c-5', 'TO_POOL', null, 20, 2],
    ['l-7', '马丽娟', '13910000007', 'FEMALE', 'ch-6', 'c-1', 'PSEUDO', 'u-5', 15, 1],
    ['l-8', '高鹏飞', '13910000008', 'MALE', 'ch-1', 'c-12', 'TO_POOL', null, 2, 0],
    ['l-9', '许静怡', '13910000009', 'FEMALE', 'ch-3', 'c-6', 'FOLLOWING', 'u-5', 4, 2],
    ['l-10', '罗天宇', '13910000010', 'MALE', 'ch-2', 'c-9', 'FOLLOWING', 'u-5', 9, 3],
    ['l-11', '谭思琪', '13910000011', 'FEMALE', 'ch-4', 'c-3', 'CONVERTED', 'u-3', 22, 5],
    ['l-12', '邓伟东', '13910000012', 'MALE', 'ch-1', 'c-4', 'CONVERTED', 'u-4', 30, 6],
  ];

  const deptOf: Record<string, string> = {
    'u-3': 'd-team-a',
    'u-4': 'd-team-a',
    'u-5': 'd-team-b',
  };

  for (const [i, l] of leads.entries()) {
    const [id, name, phone, gender, ch, course, status, ownerId, days, fc] = l as [
      string, string, string, string, string, string, string, string | null, number, number,
    ];
    const createdAt = daysAgo(days);
    const lastFollowAt = fc > 0 ? daysAgo(Math.max(0, days - fc)) : null;

    // 下次跟进时间覆盖三种场景，让"超期未跟进"筛选有真实数据：
    // 已超期 / 今天或明天到期 / 未设置
    const nextFollowAt =
      status !== 'FOLLOWING'
        ? null
        : i % 3 === 0
          ? daysAgo(2)          // 已超期 2 天
          : i % 3 === 1
            ? daysAgo(-1)       // 明天到期
            : null;              // 未设下次跟进

    await q(
      `INSERT INTO "Lead"
       ("id","code","name","phone","gender","sourceChannelId","intentCourseId","status",
        "ownerId","deptId","followCount","lastFollowAt","nextFollowAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT ("id") DO NOTHING`,
      [
        id, code('LD', i + 1), name, phone, gender, ch, course, status,
        ownerId, ownerId ? deptOf[ownerId] : null, fc, lastFollowAt,
        nextFollowAt, createdAt,
      ],
    );

    // 状态变更日志（看板统计依据）
    await q(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById","changedAt")
       VALUES ($1,'LEAD',$2,NULL,'PENDING','CREATE',$3,$4)`,
      [`scl-l${i}-1`, id, ownerId ?? 'u-1', createdAt],
    );
    if (status !== 'PENDING') {
      await q(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById","changedAt")
         VALUES ($1,'LEAD',$2,'PENDING',$3,$4,$5,$6)`,
        [`scl-l${i}-2`, id, status, status === 'FOLLOWING' ? 'ASSIGN' : status, ownerId ?? 'u-1', createdAt],
      );
    }

    // 已转商机的线索，必须有 CONVERT_LEAD 日志，
    // 否则看板漏斗按状态跃迁时间统计时会漏数（BR-D04）
    if (status === 'CONVERTED') {
      await q(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById","changedAt")
         VALUES ($1,'LEAD',$2,'FOLLOWING','CONVERTED','CONVERT_LEAD','种子数据：已转为商机',$3,$4)`,
        [`scl-l${i}-3`, id, ownerId ?? 'u-1', createdAt],
      );
    }

    if (ownerId) {
      await q(
        `INSERT INTO "OwnershipHistory" ("id","bizType","bizId","toOwnerId","action","changedById","changedAt")
         VALUES ($1,'LEAD',$2,$3,'ASSIGN','u-2',$4)`,
        [`own-l${i}`, id, ownerId, createdAt],
      );
    }

    for (let k = 0; k < fc; k += 1) {
      await q(
        `INSERT INTO "FollowUp" ("id","bizType","bizId","method","result","content","nextFollowAt","createdById","createdAt")
         VALUES ($1,'LEAD',$2,$3,$4,$5,$6,$7,$8)`,
        [
          `fu-l${i}-${k}`, id, k % 2 === 0 ? 'PHONE' : 'WECHAT',
          ['INTERESTED', 'WECHAT_ADDED', 'OBSERVE'][k % 3],
          `第 ${k + 1} 次沟通，介绍了课程大纲与上课安排，客户表示${k === 0 ? '有兴趣进一步了解' : '会考虑后再决定'}。`,
          daysAgo(-(k + 1)), ownerId ?? 'u-1', daysAgo(days - k),
        ],
      );
    }
  }

  /* ---------- 商机 ---------- */
  const opps = [
    ['o-1', '周敏-前端开发就业班', '周敏', '13910000001', 'l-11', 'c-2', 12800, 'NEGOTIATING', 'u-3', 'd-team-a', 6],
    ['o-2', '吴建国-数据分析师训练营', '吴建国', '13910000002', 'l-12', 'c-4', 8800, 'FOLLOWING', 'u-4', 'd-team-a', 10],
    ['o-3', '孙浩然-AI提示工程实战', '孙浩然', '13910000004', null, 'c-8', 5980, 'FOLLOWING', 'u-4', 'd-team-a', 4],
    ['o-4', '郑雅雯-人工智能应用基础', '郑雅雯', '13910000013', null, 'c-3', 3600, 'WON', 'u-3', 'd-team-a', 18],
    ['o-5', '林巧云-前端开发就业班', '林巧云', '13910000005', null, 'c-2', 12800, 'LOST', 'u-4', 'd-team-a', 25],
  ];

  for (const [i, o] of opps.entries()) {
    const [id, name, cname, phone, leadId, course, amount, stage, ownerId, deptId, days] = o as [
      string, string, string, string, string | null, string, number, string, string, string, number,
    ];
    const createdAt = daysAgo(days);

    await q(
      `INSERT INTO "Opportunity"
       ("id","code","name","customerName","phone","courseId","amount","expectedCloseDate",
        "stage","stageEnteredAt","ownerId","deptId","sourceChannelId","sourceLeadId",
        "lostReason","lostRemark","wonAt","wonAmount","wonDate","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT ("id") DO NOTHING`,
      [
        id, code('OP', i + 1), name, cname, phone, course, amount, daysAgo(-15),
        stage, daysAgo(stage === 'NEGOTIATING' ? 6 : 2), ownerId, deptId, 'ch-2', leadId,
        stage === 'LOST' ? 'OVER_BUDGET' : null,
        stage === 'LOST' ? '客户预算不足，建议下季度再联系' : null,
        stage === 'WON' ? daysAgo(3) : null,
        stage === 'WON' ? amount : null,
        stage === 'WON' ? daysAgo(3) : null,
        createdAt,
      ],
    );

    await q(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById","changedAt")
       VALUES ($1,'OPPORTUNITY',$2,NULL,'FOLLOWING','CREATE',$3,$4)`,
      [`scl-o${i}-1`, id, ownerId, createdAt],
    );
    if (stage !== 'FOLLOWING') {
      await q(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById","changedAt")
         VALUES ($1,'OPPORTUNITY',$2,'FOLLOWING',$3,$4,$5,$6)`,
        [`scl-o${i}-2`, id, stage, stage, ownerId, daysAgo(Math.max(0, days - 1))],
      );
    }

    await q(
      `INSERT INTO "FollowUp" ("id","bizType","bizId","method","content","nextPlan","createdById","createdAt")
       VALUES ($1,'OPPORTUNITY',$2,'PHONE',$3,'下次跟进确认意向',$4,$5)`,
      [
        `fu-o${i}`, id,
        `与客户沟通了课程安排与价格方案，${stage === 'NEGOTIATING' ? '客户在对比优惠力度，预计本周内确认' : '客户表示需要再考虑一下'}。`,
        ownerId, daysAgo(Math.min(days, 3)),
      ],
    );
  }

  /* ---------- 客户 ---------- */
  const customers = [
    ['cu-1', '郑雅雯', '13910000013', 'FEMALE', 'c-3', 3600, 'ACTIVE', 'u-3', 'd-team-a', 'o-4', 3, 30],
    ['cu-2', '许静怡', '13910000009', 'FEMALE', 'c-6', 999, 'ACTIVE', 'u-5', 'd-team-b', null, 12, 15],
    ['cu-3', '罗天宇', '13910000010', 'MALE', 'c-9', 7680, 'COMPLETED', 'u-5', 'd-team-b', null, 40, -5],
  ];

  for (const [i, c] of customers.entries()) {
    const [id, name, phone, gender, course, amount, status, ownerId, deptId, oppId, dealDays, svcDays] =
      c as [string, string, string, string, string, number, string, string, string, string | null, number, number];

    await q(
      `INSERT INTO "Customer"
       ("id","code","name","phone","gender","courseId","amount","dealDate","status",
        "ownerId","deptId","sourceChannelId","sourceOppId","serviceStartDate","serviceExpireDate","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ch-2',$12,$13,$14,$15)
       ON CONFLICT ("id") DO NOTHING`,
      [
        id, code('CU', i + 1), name, phone, gender, course, amount, daysAgo(dealDays),
        status, ownerId, deptId, oppId, daysAgo(dealDays), daysAgo(-svcDays), daysAgo(dealDays),
      ],
    );

    await q(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById","changedAt")
       VALUES ($1,'CUSTOMER',$2,NULL,'ACTIVE','CONVERT_CUSTOMER',$3,$4)`,
      [`scl-cu${i}`, id, ownerId, daysAgo(dealDays)],
    );

    await q(
      `INSERT INTO "ServiceRecord" ("id","customerId","type","serviceDate","duration","staffId","content","rating","createdById","createdAt")
       VALUES ($1,$2,$3,$4,90,$5,$6,5,$5,$7)`,
      [
        `sr-${i}`, id, status === 'COMPLETED' ? 'LESSON' : 'TRIAL', daysAgo(dealDays),
        ownerId, '完成试听课程，讲解了课程大纲与实战案例，客户反馈良好。', daysAgo(dealDays),
      ],
    );
  }

  /* ---------- 系统参数 ---------- */
  const configs = [
    ['LEAD_OVERDUE_HOURS', '24', '线索超时未跟进阈值（小时）'],
    ['OPP_FOLLOWING_LIMIT_DAYS', '3', '商机跟进中阶段停留超期阈值（天）'],
    ['OPP_NEGOTIATING_LIMIT_DAYS', '7', '商机谈判中阶段停留超期阈值（天）'],
    ['POOL_RECYCLE_DAYS', '15', '公海数据自动回收天数'],
    ['CUSTOMER_EXPIRE_WARN_DAYS', '30', '客户到期提醒提前天数'],
    ['DASHBOARD_CACHE_SECONDS', '300', '看板缓存秒数'],
    ['BATCH_SYNC_LIMIT', '500', '批量操作同步执行上限'],
    ['LOGIN_FAIL_LIMIT', '5', '登录失败锁定次数'],
    ['LOGIN_LOCK_MINUTES', '30', '登录失败锁定分钟数'],
    ['SESSION_TIMEOUT_MINUTES', '120', '会话超时分钟数'],
  ];
  for (const [k, v, d] of configs) {
    await q(
      `INSERT INTO "SystemConfig" ("id","key","value","desc")
       VALUES ($1,$2,$3,$4) ON CONFLICT ("key") DO NOTHING`,
      [`cfg-${k}`, k, v, d],
    );
  }

  /* ---------- 角色权限 ---------- */
  const perms: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    SALES_MANAGER: [
      'lead:view', 'lead:create', 'lead:edit', 'lead:follow', 'lead:assign', 'lead:pseudo', 'lead:export',
      'opp:view', 'opp:create', 'opp:edit', 'opp:follow', 'opp:assign', 'opp:pool', 'opp:convert',
      'customer:view', 'customer:create', 'customer:edit', 'customer:follow',
      'resource:view', 'system:dept:view', 'system:account:view', 'system:log:view',
    ],
    SALES: [
      'lead:view', 'lead:create', 'lead:edit', 'lead:follow', 'lead:pseudo',
      'opp:view', 'opp:create', 'opp:edit', 'opp:follow', 'opp:pool', 'opp:convert',
      'customer:view', 'customer:edit', 'customer:follow',
      'resource:view',
    ],
  };
  let n = 0;
  for (const [role, keys] of Object.entries(perms)) {
    for (const permKey of keys) {
      await q(
        `INSERT INTO "RolePerm" ("id","role","permKey","allowed")
         VALUES ($1,$2,$3,TRUE) ON CONFLICT ("role","permKey") DO NOTHING`,
        [`perm-${role}-${permKey}`, role, permKey],
      );
      n += 1;
    }
  }
}
