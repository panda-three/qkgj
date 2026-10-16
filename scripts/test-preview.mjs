/**
 * 预览页冒烟测试：用 jsdom 真实执行页面脚本，
 * 确认没有 "Cannot set properties of null" 一类的初始化崩溃，
 * 并验证核心交互（排序、筛选、选择、弹窗）能正常工作。
 *
 * 运行：node scripts/test-preview.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd(), 'ui-compare/redesign');
const { JSDOM, VirtualConsole } = require('jsdom');

/**
 * 起一个临时静态服务器。
 * jsdom 的 resources:'usable' 会真的发起 HTTP 请求去取 <script src>，
 * 用 file:// 路径它取不到；起个本地服务最接近真实浏览器环境。
 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = normalize(urlPath === '/' ? '/leads.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, rel);
    if (!file.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = await new Promise((r) => {
  server.listen(0, '127.0.0.1', () => r(server.address().port));
});
const base = `http://127.0.0.1:${port}`;

const errors = [];
const warns = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));
vc.on('warn', (...a) => warns.push(a.join(' ')));

const html = readFileSync(resolve(root, 'leads.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  // 必须开启 resources 才会真正加载 <script src> 指向的外部脚本，
  // 否则 compare.js 根本不会执行，测试会全部误报
  resources: 'usable',
  pretendToBeVisual: true,
  url: `${base}/leads.html`, // 走本地服务器，外部脚本才能加载
  virtualConsole: vc,
});

const { window } = dom;
const doc = window.document;

// 页面初始化是异步的（等数据就绪），轮询等待真正渲染完成，
// 而不是固定 sleep —— 后者在慢机器上会误报失败
async function waitFor(predicate, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

const rendered = await waitFor(() => doc.querySelectorAll('#leadBody tr').length > 0);
if (!rendered) {
  console.log('  ! 页面在 5 秒内未渲染出数据行，后续断言可能失真');
  console.log(`    调试：sidebar 菜单 ${doc.querySelectorAll('.nav-item').length} 项`);
  console.log(`    调试：tbody 行数 ${doc.querySelectorAll('#leadBody tr').length}`);
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++; }
}

console.log('═'.repeat(52));
console.log('  预览页冒烟测试');
console.log('═'.repeat(52));

/* ---------- 1. 初始化无崩溃 ---------- */
console.log('\n1. 初始化');
check('页面脚本执行无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));

/* ---------- 2. 外壳渲染 ---------- */
console.log('\n2. 布局外壳');
const sidebarItems = doc.querySelectorAll('.nav-item').length;
check('侧栏菜单已渲染', sidebarItems >= 5, `实际 ${sidebarItems} 项`);
check('侧栏当前项高亮', !!doc.querySelector('.nav-item.active'));
check('顶栏已渲染', !!doc.querySelector('.topbar, header'));
check('汉堡按钮存在（移动端）', !!doc.querySelector('.hamburger'));
check('用户头像存在', !!doc.querySelector('.user-avatar'));
check('角色切换器存在', !!doc.querySelector('[data-role]'));

/* ---------- 3. 数据渲染 ---------- */
console.log('\n3. 列表数据');
const rows = doc.querySelectorAll('#leadBody tr');
check('表格已渲染数据行', rows.length > 0, `实际 ${rows.length} 行`);
const cards = doc.querySelectorAll('.mobile-item');
check('移动端卡片已渲染', cards.length > 0, `实际 ${cards.length} 张`);

const tabs = doc.querySelectorAll('.quick-tab');
check('快捷页签已渲染', tabs.length === 7, `实际 ${tabs.length} 个`);
const badgeAll = doc.querySelector('.quick-tab .badge-count');
check('页签角标显示数量', !!badgeAll && /\d/.test(badgeAll.textContent));

/* ---------- 4. 排序是真实的 ---------- */
console.log('\n4. 排序');
function firstColName() {
  const r = doc.querySelector('#leadBody tr');
  return r ? r.querySelector('.cell-main').textContent.trim() : '';
}
const beforeSort = firstColName();
const sortBtns = doc.querySelectorAll('[data-sort]');
check('排序按钮存在', sortBtns.length >= 4, `实际 ${sortBtns.length} 个`);

// 点"创建时间"排序
const createdBtn = Array.from(sortBtns).find((b) => b.dataset.sort === 'createdAt');
if (createdBtn) {
  createdBtn.click();
  await new Promise((r) => setTimeout(r, 50));
  const afterSort = firstColName();
  check('点击排序后顺序发生变化', beforeSort !== afterSort, `${beforeSort} → ${afterSort}`);
}

// 点同一列两次应反转
  if (createdBtn) {
    const midName = firstColName();
    createdBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    check('重复点击切换升降序', midName !== firstColName());
  }

/* ---------- 5. 筛选 ---------- */
console.log('\n5. 筛选');
const kwInput = doc.querySelector('#kwInput');
const firstLeadName = doc.querySelector('#leadBody .cell-main')?.textContent.trim() || '';
if (kwInput) {
  kwInput.value = firstLeadName.slice(0, 2);
  doc.querySelector('#btnSearch').click();
  await new Promise((r) => setTimeout(r, 50));
  const after = doc.querySelectorAll('#leadBody tr').length;
  check('关键词筛选生效', after >= 1 && after <= rows.length, `从 ${rows.length} 筛选到 ${after}`);
}

doc.querySelector('#btnReset').click();
await new Promise((r) => setTimeout(r, 50));
check('重置后恢复全量', doc.querySelectorAll('#leadBody tr').length === rows.length);

/* ---------- 6. 页签筛选 ---------- */
console.log('\n6. 快捷页签');
const pseudoTab = Array.from(doc.querySelectorAll('.quick-tab')).find((t) => t.dataset.q === 'PSEUDO');
if (pseudoTab) {
  pseudoTab.click();
  await new Promise((r) => setTimeout(r, 50));
  const badges = doc.querySelectorAll('#leadBody .tag');
  const allPseudo = Array.from(badges).every((b) => b.textContent.includes('伪线索'));
  check('切到伪线索页签后仅显示伪线索', allPseudo && badges.length > 0, `实际 ${badges.length} 行`);
}

// 切回全部
const allTab = Array.from(doc.querySelectorAll('.quick-tab')).find((t) => t.dataset.q === '');
if (allTab) { allTab.click(); await new Promise((r) => setTimeout(r, 50)); }

/* ---------- 7. 选择 ---------- */
console.log('\n7. 批量选择');
const firstCheck = doc.querySelector('#leadBody input[type=checkbox]');
if (firstCheck) {
  firstCheck.click();
  await new Promise((r) => setTimeout(r, 50));
  const bar = doc.querySelector('#batchBar');
  check('选中后批量条出现', bar && !bar.hidden);
  check('批量条显示选中数', doc.querySelector('#batchCount')?.textContent === '1');
  doc.querySelector('#btnCancelBatch').click();
  await new Promise((r) => setTimeout(r, 50));
  check('取消选择后批量条隐藏', doc.querySelector('#batchBar').hidden);
}

/* ---------- 8. 手机号脱敏 ---------- */
console.log('\n8. 手机号脱敏');
const phoneCells = doc.querySelectorAll('[data-phone]');
check('手机号已脱敏显示', phoneCells.length > 0 && /\*{4}/.test(phoneCells[0].textContent),
  `实际 "${phoneCells[0]?.textContent}"`);
const revealBtn = doc.querySelector('[data-reveal]');
if (revealBtn) {
  revealBtn.click();
  await new Promise((r) => setTimeout(r, 50));
  const txt = doc.querySelector('[data-phone]').textContent;
  check('点击后显示完整号码', !/\*{4}/.test(txt), `实际 "${txt}"`);
  check('查看后有留痕提示', !!doc.querySelector('.toast'));
}

/* ---------- 9. 弹窗 ---------- */
console.log('\n9. 弹窗');
const createBtn = doc.querySelector('[data-open="create"]');
if (createBtn) {
  createBtn.click();
  await new Promise((r) => setTimeout(r, 80));
  const modal = doc.querySelector('#createModal');
  check('新建线索弹窗打开', modal && !modal.hidden);
  doc.querySelector('#createModal [data-close]').click();
  await new Promise((r) => setTimeout(r, 50));
  check('弹窗可关闭', doc.querySelector('#createModal').hidden);
}

/* ---------- 10. 移动端抽屉 ---------- */
console.log('\n10. 移动端导航');
const hamburger = doc.querySelector('.hamburger');
if (hamburger) {
  hamburger.click();
  await new Promise((r) => setTimeout(r, 50));
  check('汉堡按钮可唤起侧栏', doc.querySelector('#sidebar').classList.contains('open'));
  const closeBtn = doc.querySelector('.sidebar-close');
  if (closeBtn) {
    closeBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    check('侧栏可关闭', !doc.querySelector('#sidebar').classList.contains('open'));
  }
}

/* ---------- 11. 分页 ---------- */
console.log('\n11. 分页');
const pageBtns = doc.querySelectorAll('.page-btn');
check('分页按钮已渲染', pageBtns.length >= 2, `实际 ${pageBtns.length} 个`);
check('页码信息显示', /\d/.test(doc.querySelector('#pageInfo')?.textContent || ''));

/* ---------- 汇总 ---------- */
console.log('\n' + '═'.repeat(52));
console.log(`  通过 ${pass}　失败 ${fail}`);
if (warns.length) console.log(`  警告 ${warns.length} 条（元素缺失提示）`);
if (errors.length) {
  console.log('\n  运行时错误：');
  errors.slice(0, 5).forEach((e) => console.log(`    · ${e.slice(0, 160)}`));
}
console.log('═'.repeat(52));

server.close();
dom.window.close();
process.exit(fail > 0 ? 1 : 0);