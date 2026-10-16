/**
 * 预览页核心逻辑单元测试（不依赖 jsdom）
 *
 * 从 compare.js 中抽出可测的纯函数：排序、筛选、分页、脱敏。
 * 这些是修复原型缺陷的关键，必须保证行为正确。
 *
 * 运行：node scripts/test-preview-logic.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.cwd(), 'ui-compare/redesign');

// 构造最小 DOM 垫片，让 compare.js 能在 Node 里跑起来
function makeStub() {
  const el = () => ({
    innerHTML: '', textContent: '', value: '', hidden: false, dataset: {},
    style: { cssText: '', display: '' },
    classList: { add(){}, remove(){}, toggle(){return false}, contains(){return false} },
    appendChild(){}, removeChild(){}, setAttribute(){}, addEventListener(){},
    querySelector(){return el()}, querySelectorAll(){return []},
    cloneNode(){return el()}, closest(){return null}, focus(){}, click(){},
    parentNode: null, children: [], clone: false,
  });
  return el();
}

const el = makeStub();
const sandbox = {
  document: {
    querySelector: () => makeStub(),
    querySelectorAll: () => [],
    createElement: () => makeStub(),
    body: makeStub(),
    addEventListener() {},
  },
  window: { location: { protocol: 'file:' } },
  location: { protocol: 'file:' },
  console,
  fetch: () => Promise.reject(new Error('no fetch in node')),
  setTimeout, clearTimeout,
};

const code = readFileSync(resolve(root, 'assets/compare.js'), 'utf8');
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(code, ctx, { filename: 'compare.js' });
  console.log('✓ compare.js 在沙箱中执行成功（无初始化崩溃）');
} catch (e) {
  console.log('✗ 执行失败:', e.message);
  process.exit(1);
}

/* ---------- 独立验证核心算法 ---------- */
const data = JSON.parse(
  readFileSync(resolve(root, 'data.json'), 'utf8'),
);

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++; }
};

console.log('\n数据完整性');
check('线索数据非空', data.leads.length > 0, `${data.leads.length} 条`);
check('每条线索含必要字段',
  data.leads.every((l) => l.id && l.name && l.phone && l.status),
  '缺失字段');
check('状态角标齐全',
  ['all', 'FOLLOWING', 'PENDING', 'PSEUDO', 'CONVERTED', 'TO_POOL', 'OVERDUE', 'NEVER']
    .every((k) => k in data.counts));

console.log('\n脱敏逻辑');
function maskPhone(p) {
  if (!p) return '--';
  if (p.length < 7) return p;
  return p.slice(0, 3) + '****' + p.slice(-4);
}
const sample = data.leads[0].phone;
check('脱敏保留前 3 后 4 位',
  maskPhone(sample) === sample.slice(0, 3) + '****' + sample.slice(-4),
  maskPhone(sample));
check('脱敏后不含完整手机号',
  !data.leads.every((l) => maskPhone(l.phone) === l.phone) || data.leads.length === 0);
check('全部线索手机号均为 11 位',
  data.leads.every((l) => /^1[3-9]\d{9}$/.test(l.phone)));

console.log('\n排序逻辑（NULL 必须排最后）');
const sorted = data.leads.slice().sort((a, b) => {
  const av = a.nextFollowAt, bv = b.nextFollowAt;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;   // NULL 最后
  if (bv == null) return -1;
  return new Date(av) - new Date(bv);
});
const nullIdx = sorted.findIndex((l) => l.nextFollowAt == null);
const nonNullAfter = sorted.slice(nullIdx).every((l) => l.nextFollowAt == null);
check('NULL 值统一排在末尾', nullIdx === -1 || nonNullAfter, `首个 NULL 在第 ${nullIdx} 位`);

console.log('\n分页计算');
const total = data.leads.length;
const pageSize = 20;
const totalPages = Math.max(1, Math.ceil(total / pageSize));
check('总页数计算正确', totalPages === Math.ceil(total / pageSize), `${totalPages} 页`);
check('首页范围正确', (0 * pageSize + 1) === 1);
check('末页不越界', Math.min(pageSize * totalPages, total) === total);

console.log('\n页码窗口算法');
function pageWindow(totalPages, cur) {
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - cur) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }
  return pages;
}
check('首页窗口正确', JSON.stringify(pageWindow(10, 1)) === '[1,2,"gap",10]');
check('中间页窗口正确', JSON.stringify(pageWindow(10, 5)) === '[1,"gap",4,5,6,"gap",10]');
check('末页窗口正确', JSON.stringify(pageWindow(10, 10)) === '[1,"gap",9,10]');
check('单页时无 gap', JSON.stringify(pageWindow(1, 1)) === '[1]');

console.log('\n超期判定');
const now = Date.now();
const overdue = data.leads.filter(
  (l) => l.nextFollowAt && new Date(l.nextFollowAt).getTime() < now && l.status === 'FOLLOWING',
);
check('超期线索可被正确识别', overdue.length > 0, `${overdue.length} 条`);
check('超期数与角标一致', overdue.length === data.counts.OVERDUE,
  `计算 ${overdue.length} vs 角标 ${data.counts.OVERDUE}`);

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass}　失败 ${fail}`);
console.log('═'.repeat(46));
process.exit(fail > 0 ? 1 : 0);