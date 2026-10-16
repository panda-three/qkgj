/* ==========================================================================
   轻客管家 · 原型共享脚本
   负责：图标库 / 布局注入 / 角色切换 / 弹窗抽屉 / Toast / 图表渲染 / 通用交互
   ========================================================================== */

/* ---------- 1. 图标库（线性图标，24x24 stroke） ---------- */
const ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  leads: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  opportunity: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  customer: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/>',
  pool: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  course: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/>',
  activity: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  channel: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  tree: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v4M5 17v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  log: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  board: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  more: '<circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  trendUp: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  trendingDown: '<path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  award: '<circle cx="12" cy="8" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  pieChart: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  barChart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  drag: '<circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>',
};

/**
 * hydrateIcons(root) — 把 <span data-icon="name" data-size="16"></span>
 * 填充为对应 SVG，用于静态 HTML 中声明图标。
 */
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon, +(el.dataset.size || 16), +(el.dataset.stroke || 2));
    el.removeAttribute('data-icon');
  });
}

/** 生成图标 SVG 字符串 */
function icon(name, size = 18, strokeWidth = 2) {
  const d = ICONS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round"
    stroke-linejoin="round">${d}</svg>`;
}

/* ---------- 2. 角色与权限模型 ---------- */
const ROLES = {
  SUPER_ADMIN: { key: 'SUPER_ADMIN', name: '超级管理员', short: '超管', user: '张启明', dept: '总部 · 运营中心', avatar: '张', cls: 'avatar-a' },
  SALES_MANAGER: { key: 'SALES_MANAGER', name: '销售主管', short: '主管', user: '李文静', dept: '华东销售部', avatar: '李', cls: 'avatar-b' },
  SALES: { key: 'SALES', name: '销售顾问', short: '顾问', user: '王小雨', dept: '华东销售部 · 一组', avatar: '王', cls: 'avatar-c' },
};

/** 各角色可访问的菜单（前端演示用，实际以后端为准） */
const ROLE_MENU = {
  SUPER_ADMIN: ['dashboard', 'leads', 'opportunity', 'customer', 'pool', 'resource', 'system'],
  SALES_MANAGER: ['dashboard', 'leads', 'opportunity', 'customer', 'pool', 'resource', 'system'],
  SALES: ['dashboard', 'leads', 'opportunity', 'customer', 'pool', 'resource'],
};

/** 权限点控制：data-perm="assign" data-min="SALES_MANAGER" */
function checkPerm(el, roleKey) {
  const min = el.dataset.min;
  if (!min) return true;
  const order = ['SALES', 'SALES_MANAGER', 'SUPER_ADMIN'];
  return order.indexOf(roleKey) >= order.indexOf(min);
}

function applyPerms(root, roleKey) {
  (root || document).querySelectorAll('[data-min]').forEach(el => {
    const ok = checkPerm(el, roleKey);
    el.classList.toggle('u-hidden', !ok);
  });
}

/* ---------- 3. 布局注入 ---------- */
const MENU = [
  {
    label: '业务主链路',
    items: [
      { key: 'dashboard', text: '数据看板', icon: 'dashboard', href: 'dashboard.html' },
      { key: 'leads', text: '线索管理', icon: 'leads', href: 'leads.html', badge: 12, badgeType: 'danger' },
      { key: 'opportunity', text: '商机管理', icon: 'opportunity', href: 'opportunities.html' },
      { key: 'customer', text: '客户管理', icon: 'customer', href: 'customers.html' },
      { key: 'pool', text: '公海池', icon: 'pool', href: 'pool.html', badge: 8, badgeType: 'warning' },
    ],
  },
  {
    label: '资源与配置',
    items: [
      { key: 'resource', text: '资源管理', icon: 'course', href: 'resources.html' },
      { key: 'system', text: '系统管理', icon: 'settings', href: 'system.html' },
    ],
  },
];

function renderSidebar(activeKey) {
  const roleKey = currentRole();
  const allow = ROLE_MENU[roleKey];
  const wrap = document.getElementById('sidebar');
  if (!wrap) return;

  let html = `
    <div class="sidebar-brand">
      <div class="sidebar-logo">${icon('layers', 17, 2.2)}</div>
      <div>
        <div class="brand-name">轻客管家</div>
        <div class="brand-sub">QINGKE CRM</div>
      </div>
    </div>
    <nav class="sidebar-nav">`;

  MENU.forEach(group => {
    const items = group.items.filter(i => allow.includes(i.key));
    if (!items.length) return;
    html += `<div class="nav-group-label">${group.label}</div>`;
    items.forEach(item => {
      const active = item.key === activeKey ? ' active' : '';
      const badge = item.badge
        ? `<span class="badge-count ${item.badgeType === 'warning' ? 'is-brand' : ''} nav-badge">${item.badge}</span>`
        : '';
      html += `<a class="nav-item${active}" href="${item.href}" data-nav="${item.key}">
        <span class="nav-icon">${icon(item.icon, 17)}</span>
        <span class="nav-text">${item.text}</span>${badge}
      </a>`;
    });
  });

  html += `</nav>
    <div class="sidebar-foot">
      <a class="btn" href="index.html">
        ${icon('grid', 17)}<span>原型总览</span>
      </a>
    </div>`;
  wrap.innerHTML = html;
}

function renderTopbar(cfg = {}) {
  const role = ROLES[currentRole()];
  const wrap = document.getElementById('topbar');
  if (!wrap) return;

  const crumbs = (cfg.breadcrumb || []).map((c, i, arr) =>
    i === arr.length - 1
      ? `<span class="current">${c.text}</span>`
      : `<a href="${c.href || '#'}">${c.text}</a><span class="sep">/</span>`
  ).join('');

  wrap.innerHTML = `
    <div class="topbar-left">
      <button class="icon-btn only-mobile" id="btnToggleSidebar" title="菜单">${icon('menu', 20)}</button>
      <nav class="breadcrumb hide-mobile">${crumbs}</nav>
    </div>
    <div class="topbar-right">
      <div class="topbar-search hide-mobile">
        <span class="search-icon">${icon('search', 15)}</span>
        <input class="input" id="globalSearch" placeholder="搜索客户、手机号、商机…" />
      </div>
      <div class="role-switch" id="roleSwitch" title="原型演示：切换角色查看权限差异">
        <span class="role-dot"></span>
        <span id="roleSwitchText">${role.name}</span>
        ${icon('chevronDown', 13)}
      </div>
      <button class="icon-btn has-dot" id="btnNotify" title="通知">${icon('bell', 19)}</button>
      <div class="v-divider hide-mobile" style="height:22px"></div>
      <div class="user-menu" id="userMenu">
        <span class="avatar ${role.cls}">${role.avatar}</span>
        <div class="user-meta hide-mobile">
          <div class="user-name">${role.user}</div>
          <div class="user-role">${role.name}</div>
        </div>
        ${icon('chevronDown', 13, 2.5)}
      </div>
    </div>`;

  bindRoleSwitch();
  bindUserMenu();
  bindNotify();
  bindGlobalSearch();
  bindSidebarToggle();
}

function bindSidebarToggle() {
  const btn = document.getElementById('btnToggleSidebar');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('is-open');
  });
}

function bindGlobalSearch() {
  const input = document.getElementById('globalSearch');
  if (!input) return;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      toast('info', `原型演示：全局搜索「${input.value.trim()}」`);
    }
  });
}

function bindRoleSwitch() {
  const el = document.getElementById('roleSwitch');
  if (!el) return;
  el.addEventListener('click', e => {
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    closeAllDropdowns();
    const items = Object.values(ROLES).map(r2 =>
      `<div class="dropdown-item ${r2.key === currentRole() ? 'is-active' : ''}" data-role="${r2.key}">
        <span class="avatar avatar-sm ${r2.cls}" style="width:20px;height:20px;font-size:10px">${r2.avatar}</span>
        <div style="line-height:1.25">
          <div>${r2.name}</div>
          <div style="font-size:11px;color:var(--ink-400)">${r2.user} · ${r2.dept}</div>
        </div>
      </div>`).join('');
    openDropdown(`<div class="dropdown-label">切换角色（演示权限差异）</div>${items}`, r.left, r.bottom + 6, 250);
  });
}

function bindUserMenu() {
  const el = document.getElementById('userMenu');
  if (!el) return;
  el.addEventListener('click', e => {
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    closeAllDropdowns();
    openDropdown(`
      <div class="dropdown-label">${ROLES[currentRole()].user} · ${ROLES[currentRole()].dept}</div>
      <div class="dropdown-item">${icon('user', 15)}个人设置</div>
      <div class="dropdown-item">${icon('shield', 15)}我的权限（${ROLES[currentRole()].name}）</div>
      <div class="dropdown-item">${icon('key', 15)}修改密码</div>
      <div class="dropdown-divider"></div>
      <div class="dropdown-item" onclick="location.href='login.html'">${icon('lock', 15)}退出登录</div>
    `, r.right - 180, r.bottom + 6, 180);
  });
}

function bindNotify() {
  const el = document.getElementById('btnNotify');
  if (!el) return;
  el.addEventListener('click', e => {
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    closeAllDropdowns();
    openDropdown(`
      <div class="dropdown-label">通知中心</div>
      <div class="dropdown-item">${icon('alert', 15)}<span style="color:var(--danger-500)">3 条线索已超期 24h 未跟进</span></div>
      <div class="dropdown-item">${icon('clock', 15)}2 个商机阶段停留超阈值</div>
      <div class="dropdown-item">${icon('user', 15)}新员工「陈思远」申请分配</div>
      <div class="dropdown-divider"></div>
      <div class="dropdown-item u-link" style="justify-content:center;color:var(--brand-600)">查看全部通知</div>
    `, r.right - 240, r.bottom + 6, 240);
  });
}

/* ---------- 4. 角色状态 ---------- */
function currentRole() {
  return localStorage.getItem('qk_role') || 'SALES_MANAGER';
}
function setRole(key) {
  localStorage.setItem('qk_role', key);
  const active = document.querySelector('.nav-item.active');
  const activeKey = active ? active.dataset.nav : 'dashboard';
  renderSidebar(activeKey);
  renderTopbar({ breadcrumb: currentBreadcrumb });
  document.querySelectorAll('[data-min]').forEach(el => applyPerms(el, key));
  const r = ROLES[key];
  toast('success', `已切换为「${r.name}」视角，页面元素与操作权限已同步调整`);
}

/* ---------- 5. 下拉菜单 ---------- */
let activeDropdown = null;
function closeAllDropdowns() {
  if (activeDropdown) { activeDropdown.remove(); activeDropdown = null; }
}
function openDropdown(html, left, top, minWidth = 180) {
  closeAllDropdowns();
  const dd = document.createElement('div');
  dd.className = 'dropdown';
  dd.style.left = left + 'px';
  dd.style.top = top + 'px';
  dd.style.minWidth = minWidth + 'px';
  dd.innerHTML = html;
  document.body.appendChild(dd);
  // 防止超出右边界
  const rect = dd.getBoundingClientRect();
  if (rect.right > window.innerWidth - 12) {
    dd.style.left = Math.max(12, window.innerWidth - rect.width - 12) + 'px';
  }
  dd.querySelectorAll('[data-role]').forEach(item => {
    item.addEventListener('click', () => { setRole(item.dataset.role); closeAllDropdowns(); });
  });
  activeDropdown = dd;
  setTimeout(() => document.addEventListener('click', closeAllDropdownsOnce), 0);
  return dd;
}
function closeAllDropdownsOnce() {
  closeAllDropdowns();
  document.removeEventListener('click', closeAllDropdownsOnce);
}

document.addEventListener('click', closeAllDropdowns);

/* ---------- 6. Toast ---------- */
function toast(type, msg, duration = 2600) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const icons = {
    success: 'checkCircle', error: 'xCircle', warning: 'alert', info: 'info',
  };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icon(icons[type] || 'info', 18)}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

/* ---------- 7. 弹窗 ---------- */
/**
 * openModal({ title, sub, body, footer, size, onMount })
 * body/footer 支持 HTML 字符串
 */
function openModal(cfg) {
  closeModal();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'modalMask';
  mask.innerHTML = `
    <div class="modal ${cfg.size ? 'modal-' + cfg.size : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>
          <div class="modal-title">${cfg.title || ''}</div>
          ${cfg.sub ? `<div class="modal-sub">${cfg.sub}</div>` : ''}
        </div>
        <button class="modal-close" data-modal-close>${icon('close', 18)}</button>
      </div>
      <div class="modal-body">${cfg.body || ''}</div>
      ${cfg.footer ? `<div class="modal-foot">${cfg.footer}</div>` : ''}
    </div>`;
  document.body.appendChild(mask);
  document.body.style.overflow = 'hidden';

  mask.addEventListener('click', e => {
    if (e.target === mask || e.target.closest('[data-modal-close]')) closeModal();
  });
  if (cfg.onMount) cfg.onMount(mask);
  return mask;
}
function closeModal() {
  const m = document.getElementById('modalMask');
  if (m) m.remove();
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDrawer(); }
});

/* 确认弹窗 */
function confirmModal(cfg) {
  openModal({
    title: cfg.title || '操作确认',
    size: 'sm',
    body: `<div class="alert alert-${cfg.tone || 'warning'}">
             <span class="alert-icon">${icon(cfg.tone === 'danger' ? 'alert' : 'info', 17)}</span>
             <div>${cfg.message}</div>
           </div>${cfg.extra || ''}`,
    footer: `<button class="btn" data-modal-close>取消</button>
             <button class="btn ${cfg.okType === 'danger' ? 'btn-danger' : 'btn-primary'}" id="confirmOk">${cfg.okText || '确定'}</button>`,
    onMount: mask => {
      mask.querySelector('#confirmOk').addEventListener('click', () => {
        closeModal();
        cfg.onOk && cfg.onOk();
      });
    },
  });
}

/* ---------- 8. 抽屉 ---------- */
function openDrawer(cfg) {
  closeDrawer();
  const mask = document.createElement('div');
  mask.className = 'drawer-mask';
  mask.id = 'drawerMask';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.id = 'appDrawer';
  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <div class="modal-title">${cfg.title || ''}</div>
        ${cfg.sub ? `<div class="modal-sub">${cfg.sub}</div>` : ''}
      </div>
      <button class="modal-close" data-drawer-close>${icon('close', 18)}</button>
    </div>
    <div class="drawer-body">${cfg.body || ''}</div>
    ${cfg.footer ? `<div class="drawer-foot">${cfg.footer}</div>` : ''}`;
  document.body.appendChild(mask);
  document.body.appendChild(drawer);
  mask.addEventListener('click', closeDrawer);
  drawer.querySelectorAll('[data-drawer-close]').forEach(b => b.addEventListener('click', closeDrawer));
  if (cfg.onMount) cfg.onMount(drawer);
  return drawer;
}
function closeDrawer() {
  const m = document.getElementById('drawerMask');
  const d = document.getElementById('appDrawer');
  if (m) m.remove();
  if (d) d.remove();
}

/* ---------- 9. 表单交互：单选卡片组 ---------- */
function bindRadioCards(root) {
  (root || document).querySelectorAll('[data-radio-group]').forEach(group => {
    group.addEventListener('click', e => {
      const card = e.target.closest('[data-radio-value]');
      if (!card || card.classList.contains('is-disabled')) return;
      group.querySelectorAll('[data-radio-value]').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const input = group.querySelector('input');
      if (input) input.value = card.dataset.radioValue;
      group.dispatchEvent(new CustomEvent('radiochange', {
        detail: { name: group.dataset.radioGroup, value: card.dataset.radioValue }, bubbles: true,
      }));
    });
  });
}

/* ---------- 10. Tab 切换 ---------- */
function bindTabs(root) {
  (root || document).querySelectorAll('[data-tabs]').forEach(tabWrap => {
    const key = tabWrap.dataset.tabs;
    tabWrap.addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      const panelWrap = document.querySelector(`[data-tab-panels="${key}"]`) ||
                        document.getElementById(`panels-${key}`);
      tabWrap.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (panelWrap) {
        panelWrap.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`panel-${key}-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');
      }
    });
  });
}

/* ---------- 11. 视图切换（列表 / 看板） ---------- */
function bindViewSwitch(el, onChange) {
  if (!el) return;
  el.addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    el.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    onChange && onChange(btn.dataset.view);
  });
}

/* ---------- 12. 表格全选 ---------- */
function bindSelectAll(scope) {
  // 「全选」复选框位于 thead，可能在 scope（如 tbody）之外，需向上回溯查找
  const root = scope || document;
  const all = root.querySelector('[data-check-all]')
    || (root.closest ? (root.closest('table') || document).querySelector('[data-check-all]') : null)
    || document.querySelector('[data-check-all]');
  if (!all) return;
  const rows = () => root.querySelectorAll('[data-check-row]');
  all.addEventListener('change', () => {
    rows().forEach(r => {
      r.checked = all.checked;
      r.closest('tr').classList.toggle('is-selected', all.checked);
    });
    updateBatchBar(scope);
  });
  rows().forEach(r => {
    r.addEventListener('change', () => {
      r.closest('tr').classList.toggle('is-selected', r.checked);
      const list = Array.from(rows());
      all.checked = list.length > 0 && list.every(x => x.checked);
      updateBatchBar(scope);
    });
  });
}
function getCheckedIds(scope) {
  return Array.from((scope || document).querySelectorAll('[data-check-row]:checked'))
    .map(r => r.dataset.checkRow);
}
function updateBatchBar(scope) {
  // 批量条常位于表格容器之外（如 card-head 下），因此始终在整页查找
  const ids = getCheckedIds(scope);
  document.querySelectorAll('[data-batch-count]').forEach(el => {
    el.textContent = ids.length;
  });
  document.querySelectorAll('[data-batch-bar]').forEach(el => {
    el.classList.toggle('u-hidden', ids.length === 0);
  });
}

/* ---------- 13. 手机号脱敏与查看 ---------- */
function maskPhone(phone) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}
function bindPhoneEyes(root) {
  (root || document).querySelectorAll('[data-phone]').forEach(el => {
    const btn = el.querySelector('.eye-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const full = el.dataset.phone;
      const span = el.querySelector('.phone-text');
      const revealed = span.textContent === full;
      span.textContent = revealed ? maskPhone(full) : full;
      btn.innerHTML = icon(revealed ? 'eyeOff' : 'eye', 14);
      if (!revealed) {
        toast('warning', '查看完整手机号已记录至操作日志');
      }
    });
  });
}

/* ---------- 14. 图表：SVG 折线（双轴） ---------- */
/**
 * lineChart(el, { labels, series:[{name,color,data,axis}], height })
 */
function lineChart(el, cfg) {
  const W = 720, H = cfg.height || 240;
  const pad = { t: 16, r: 46, b: 30, l: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const labels = cfg.labels;
  const n = labels.length;

  let maxL = 0, maxR = 0;
  cfg.series.forEach(s => {
    s.data.forEach(v => {
      if (s.axis === 'right') maxR = Math.max(maxR, v);
      else maxL = Math.max(maxL, v);
    });
  });
  maxL = niceMax(maxL); maxR = niceMax(maxR);

  const x = i => pad.l + (iw / (n - 1)) * i;
  const yL = v => pad.t + ih - (v / maxL) * ih;
  const yR = v => pad.t + ih - (v / maxR) * ih;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + (ih / 4) * i;
    grid += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#e2e8f0" stroke-width="1"/>`;
    grid += `<text x="${pad.l - 8}" y="${gy + 4}" font-size="11" fill="#94a3b8" text-anchor="end">${Math.round(maxL - (maxL / 4) * i)}</text>`;
  }
  if (maxR) {
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + (ih / 4) * i;
      grid += `<text x="${W - pad.r + 8}" y="${gy + 4}" font-size="11" fill="#94a3b8" text-anchor="start">${fmtShort(maxR - (maxR / 4) * i)}</text>`;
    }
  }

  let xLabels = '';
  labels.forEach((l, i) => {
    if (i % Math.ceil(n / 8) !== 0 && i !== n - 1) return;
    xLabels += `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="#94a3b8" text-anchor="middle">${l}</text>`;
  });

  let paths = '', dots = '';
  cfg.series.forEach(s => {
    const yf = s.axis === 'right' ? yR : yL;
    const pts = s.data.map((v, i) => [x(i), yf(v)]);
    const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = s.fill
      ? `${d} L${pts[pts.length - 1][0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z`
      : '';
    if (area) {
      paths += `<path d="${area}" fill="url(#g-${s.key})" opacity="0.55"/>`;
    }
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4"
      stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => {
      dots += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#fff" stroke="${s.color}" stroke-width="2">
        <title>${labels[i]} · ${s.name}：${s.data[i]}${s.unit || ''}</title></circle>`;
    });
  });

  const defs = cfg.series.filter(s => s.fill).map(s =>
    `<linearGradient id="g-${s.key}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/>
    </linearGradient>`).join('');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
    <defs>${defs}</defs>${grid}${paths}${dots}${xLabels}
  </svg>`;
}
function niceMax(v) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
}
function fmtShort(v) {
  if (v >= 10000) return (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '万';
  return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v);
}

/* ---------- 15. 图表：分组柱状 ---------- */
function barChart(el, cfg) {
  const labels = cfg.labels;
  const n = labels.length;
  const max = niceMax(Math.max(...cfg.series.flatMap(s => s.data)));
  const bars = cfg.series.map((s, si) =>
    `<div class="bar" style="height:${(s.data / max) * 100}%;background:${s.color}"
      title="${s.name}"></div>`).join('');
  el.innerHTML = labels.map((l, i) => `
    <div class="bar-group">
      <div class="bar-bars">
        ${cfg.series.map(s => `<div class="bar" style="height:${(s.data[i] / max) * 100}%;background:${s.color};width:${cfg.series.length > 1 ? 11 : 18}px" title="${l} · ${s.name}：${s.data[i]}${s.unit || ''}"></div>`).join('')}
      </div>
      <div class="bar-label">${l}</div>
    </div>`).join('');
}

/* ---------- 16. 图表：环形进度 ---------- */
function donut(el, pct, label, color = '#3a63f0', size = 120) {
  const r = 46, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, pct) / 100);
  el.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#eef2f7" stroke-width="11"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="11"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
        transform="rotate(-90 60 60)" style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"/>
    </svg>
    <div class="donut-center">
      <div class="dc-value">${pct}%</div>
      <div class="dc-label">${label || ''}</div>
    </div>`;
}

/* ---------- 17. 漏斗渲染 ---------- */
function renderFunnel(el, stages) {
  el.innerHTML = stages.map((s, i) => {
    const width = 100 - i * 9;
    const rate = i === 0 ? null : Math.round((s.value / stages[i - 1].value) * 100);
    const loss = i === 0 ? null : stages[i - 1].value - s.value;
    return `
      <div style="width:${width}%" class="u-relative">
        <div class="funnel-stage funnel-stage-${i + 1}" data-funnel="${s.name}" title="点击下钻明细">
          <span class="funnel-stage-name">${s.name}</span>
          ${rate !== null ? `<span class="funnel-stage-rate">转化率 ${rate}%</span>` : ''}
          <span class="funnel-stage-count">${s.value}</span>
        </div>
      </div>
      ${loss !== null && loss > 0 ? `
      <div class="funnel-arrow">
        ${icon('arrowDown', 13, 2.5)}
        <span>流失 <span class="loss">${loss}</span> 条</span>
      </div>` : ''}`;
  }).join('');

  el.querySelectorAll('[data-funnel]').forEach(node => {
    node.addEventListener('click', () => {
      toast('info', `原型演示：下钻查看「${node.dataset.funnel}」明细列表`);
    });
  });
}

/* ---------- 18. 看板拖拽 ---------- */
function bindKanban(scope) {
  const cards = (scope || document).querySelectorAll('.kanban-card[draggable]');
  const cols = (scope || document).querySelectorAll('.kanban-col');
  let dragCard = null;

  cards.forEach(card => {
    card.addEventListener('dragstart', () => {
      dragCard = card;
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      cols.forEach(c => c.classList.remove('is-drop-target'));
      dragCard = null;
    });
  });

  cols.forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      if (dragCard) col.classList.add('is-drop-target');
    });
    col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('is-drop-target');
      if (!dragCard) return;
      const title = col.dataset.stage;
      const target = cols.find(c => c.dataset.stage === title);
      target.querySelector('.kanban-col-body').appendChild(dragCard);
      dragCard = null;
      toast('success', `已移动到「${title}」，阶段变更已记录日志`);
    });
  });
}

/* ---------- 19. 工具函数 ---------- */
function money(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万';
  return '¥' + n.toLocaleString('zh-CN');
}
function percent(a, b) {
  if (!b) return '--';
  return Math.round((a / b) * 100) + '%';
}
function statusTag(status) {
  const map = {
    PENDING:    ['待分配', 'tag-warning'],
    FOLLOWING:   ['待跟进', 'tag-brand'],
    PSEUDO:      ['伪线索', 'tag-default'],
    TO_POOL:     ['公海池', 'tag-purple'],
    CONVERTED:   ['已转商机', 'tag-success'],
    NEGOTIATING: ['谈判中', 'tag-warning'],
    WON:         ['已赢单', 'tag-success'],
    LOST:        ['已输单', 'tag-danger'],
    ACTIVE:      ['正常在读', 'tag-success'],
    PAUSED:      ['暂停服务', 'tag-warning'],
    COMPLETED:   ['已结课', 'tag-default'],
    REFUNDED:    ['已退费', 'tag-danger'],
    CHURNED:     ['已流失', 'tag-danger'],
  };
  const m = map[status] || [status, 'tag-default'];
  return `<span class="tag ${m[1]}">${m[0]}</span>`;
}
function overdueTag(days, threshold) {
  if (days > threshold) return `<span class="tag tag-danger">超期${days}天</span>`;
  return `<span class="u-muted-sm">${days}天</span>`;
}
function fmtDateTime(s) { return s; }
function renderTableSkeleton(cols, rows = 6) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += '<tr>';
    for (let j = 0; j < cols; j++) {
      html += `<td><div class="skeleton" style="height:13px;width:${55 + ((i * j) % 40)}%"></div></td>`;
    }
    html += '</tr>';
  }
  return html;
}

/* ---------- 20. 页面初始化 ---------- */
let currentBreadcrumb = [];
/**
 * initPage({ key, breadcrumb, onReady })
 */
function initPage(cfg) {
  currentBreadcrumb = cfg.breadcrumb || [];
  renderSidebar(cfg.key);
  renderTopbar({ breadcrumb: cfg.breadcrumb });
  applyPerms(document, currentRole());
  bindPhoneEyes(document);
  bindTabs(document);
  bindRadioCards(document);
  bindSelectAll(document);
  hydrateIcons(document);
  cfg.onReady && cfg.onReady();
}

/* 演示：模拟加载骨架屏 → 数据 */
function simulateLoading(skeletonEl, realEl, delay = 500) {
  if (!skeletonEl || !realEl) return;
  realEl.classList.add('u-hidden');
  setTimeout(() => {
    skeletonEl.classList.add('u-hidden');
    realEl.classList.remove('u-hidden');
  }, delay);
}

/* 全局：ESC 关闭 + 表格排序演示 */
document.addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const table = th.closest('table');
  table.querySelectorAll('th').forEach(t => {
    const si = t.querySelector('.sort-icon');
    if (si) si.innerHTML = icon('arrowUp', 12);
  });
  th.querySelector('.sort-icon').innerHTML = icon('arrowDown', 12);
  toast('info', `原型演示：按「${th.dataset.label || th.textContent.trim()}」排序`);
});
