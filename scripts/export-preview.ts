/**
 * 导出预览数据：把数据库中的真实数据导出为 JSON，
 * 供 ui-compare/redesign/ 下的静态预览页消费。
 *
 * 这样即使沙箱内无法启动 Next.js，也能看到改造后的真实界面效果。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb } from '../src/server/db';

/** 需要内联数据的页面 */
const PAGES_WITH_DATA = ['leads.html', 'opportunities.html', 'customers.html', 'pool.html'];

async function main() {
  const db = getDb();
  await db.waitReady;

  const leads = await db.query(`
    SELECT l."id", l."code", l."name", l."phone", l."status",
           l."followCount", l."lastFollowAt", l."nextFollowAt", l."createdAt",
           l."ownerId", l."deptId", l."sourceChannelId", l."intentCourseId",
           u."name" AS "ownerName", d."name" AS "deptName",
           ch."name" AS "channelName", c."name" AS "courseName"
      FROM "Lead" l
      LEFT JOIN "User" u ON u."id" = l."ownerId"
      LEFT JOIN "Dept" d ON d."id" = l."deptId"
      LEFT JOIN "Channel" ch ON ch."id" = l."sourceChannelId"
      LEFT JOIN "Course" c ON c."id" = l."intentCourseId"
     WHERE l."isDeleted" = FALSE
     ORDER BY l."createdAt" DESC
  `);

  const opps = await db.query(`
    SELECT o."id", o."code", o."name", o."customerName", o."phone", o."amount",
           o."stage", o."expectedCloseDate", o."stageEnteredAt",
           u."name" AS "ownerName", c."name" AS "courseName"
      FROM "Opportunity" o
      LEFT JOIN "User" u ON u."id" = o."ownerId"
      LEFT JOIN "Course" c ON c."id" = o."courseId"
     WHERE o."isDeleted" = FALSE
     ORDER BY o."createdAt" DESC
  `);

  const customers = await db.query(`
    SELECT cu."id", cu."code", cu."name", cu."phone", cu."status", cu."amount",
           cu."dealDate", cu."serviceExpireDate",
           u."name" AS "ownerName", c."name" AS "courseName"
      FROM "Customer" cu
      LEFT JOIN "User" u ON u."id" = cu."ownerId"
      LEFT JOIN "Course" c ON c."id" = cu."courseId"
     WHERE cu."isDeleted" = FALSE
     ORDER BY cu."dealDate" DESC
  `);

  const followUps = await db.query(`
    SELECT "id", "bizType", "bizId", "method", "result", "content", "nextPlan", "createdAt"
      FROM "FollowUp"
     ORDER BY "createdAt" DESC
     LIMIT 40
  `);

  const counts = await db.query<Record<string, number>>(`
    SELECT COUNT(*) FILTER (WHERE "status" <> 'PSEUDO')::int AS "all",
           COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS "PENDING",
           COUNT(*) FILTER (WHERE "status" = 'FOLLOWING')::int AS "FOLLOWING",
           COUNT(*) FILTER (WHERE "status" = 'PSEUDO')::int AS "PSEUDO",
           COUNT(*) FILTER (WHERE "status" = 'CONVERTED')::int AS "CONVERTED",
           COUNT(*) FILTER (WHERE "status" = 'TO_POOL')::int AS "TO_POOL",
           COUNT(*) FILTER (
             WHERE "nextFollowAt" IS NOT NULL
               AND "nextFollowAt" < NOW()
               AND "status" = 'FOLLOWING'
           )::int AS "OVERDUE",
           COUNT(*) FILTER (WHERE "lastFollowAt" IS NULL AND "followCount" = 0)::int AS "NEVER"
      FROM "Lead" WHERE "isDeleted" = FALSE
  `);

  const data = {
    exportedAt: new Date().toISOString(),
    leads: leads.rows,
    opportunities: opps.rows,
    customers: customers.rows,
    followUps: followUps.rows,
    counts: counts.rows[0] ?? {},
  };

  const outDir = resolve(process.cwd(), 'ui-compare/redesign');
  mkdirSync(outDir, { recursive: true });

  const json = JSON.stringify(data, null, 2);
  writeFileSync(resolve(outDir, 'data.json'), json, 'utf8');

// 把数据内联进各 HTML —— 浏览器用 file:// 协议打开时会拦截本地 JSON 的 fetch，
// 内联后双击即可查看，无需起本地服务器。
// 先清掉上一轮内联的数据块，避免反复导出时无限累积。
const MARKER = '<script src="assets/compare.js"></script>';

for (const fileName of PAGES_WITH_DATA) {
  const htmlPath = resolve(outDir, fileName);
  if (!existsSync(htmlPath)) {
    console.warn(`  ! 跳过 ${fileName}（文件不存在）`);
    continue;
  }

  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/\s*<script>window\.__QK_DATA__ = [\s\S]*?;<\/script>\n/, '\n');

  if (!html.includes(MARKER)) {
    console.warn(`  ! 跳过 ${fileName}（未找到注入点）`);
    continue;
  }

  html = html.replace(MARKER, `<script>window.__QK_DATA__ = ${json};</script>\n${MARKER}`);
  writeFileSync(htmlPath, html, 'utf8');
  console.log(`  ${fileName}  已内联数据`);
}

console.log(`✓ 已导出预览数据 → ui-compare/redesign/`);
console.log(`  data.json    ${(json.length / 1024).toFixed(1)} KB`);
console.log(`  线索 ${data.leads.length} 条 · 商机 ${data.opportunities.length} 个 · 客户 ${data.customers.length} 个 · 跟进 ${data.followUps.length} 条`);

await db.close();
}

main().catch((e) => {
  console.error('导出失败：', e);
  process.exit(1);
});