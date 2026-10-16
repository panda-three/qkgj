/**
 * 改造版 · 交互脚本
 *
 * 修复原型的三个已知缺陷：
 * 1. 排序是假的（只换图标 + toast）→ 真实排序 + 状态回显
 * 2. 全选仅限当前页 → 跨页保持选中 + 页数提示
 * 3. 手机号完整暴露 → 默认脱敏 + 点击查看（带留痕提示）
 *
 * 响应式：
 * · <768px 侧栏抽屉、表格转卡片列表、弹窗转底部抽屉
 * · 触控目标不小于 40px
 */

(function () {
  'use strict';

  var DATA = { leads: [], counts: {}, users: [], channels: [], courses: [] };
  var state = {
    status: '', followState: '', keyword: '', ownerId: '', channelId: '',
    sortBy: 'createdAt', sortOrder: 'desc',
    page: 1, pageSize: 20,
    selected: new Set(),
    selectedPages: new Set(),
    currentPage: 1,
    role: 'SALES_MANAGER',
    // 当前页菜单 key，用于侧栏高亮；各页面脚本可覆盖
    activeKey: 'leads',
  };

  /* ---------- 工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }

  /**
   * 安全绑定：元素不存在时给出明确警告而非静默失败。
   * 之前就是因为直接赋值 onclick，元素未渲染时抛
   * "Cannot set properties of null"，把整个页面搞崩。
   */
  function on(sel, evt, handler, root) {
    var el = $(sel, root);
    if (!el) {
      console.warn('[compare] 未找到元素，已跳过绑定：' + sel);
      return false;
    }
    el.addEventListener(evt, handler);
    return true;
  }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function maskPhone(p) {
    if (!p) return '--';
    if (p.length < 7) return p;
    return p.slice(0, 3) + '****' + p.slice(-4);
  }
  function fmtDate(v) {
    if (!v) return '--';
    var d = new Date(v);
    if (isNaN(d)) return '--';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDateTime(v) {
    if (!v) return '--';
    var d = new Date(v);
    if (isNaN(d)) return '--';
    return fmtDate(v) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fromNow(v) {
    if (!v) return '--';
    var diff = Date.now() - new Date(v).getTime();
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + '分钟前';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + '小时前';
    var day = Math.floor(hr / 24);
    if (day === 1) return '昨天 ' + fmtDateTime(v).slice(11);
    if (day < 7) return day + '天前';
    return fmtDate(v);
  }
  function num(n) { return (n || 0).toLocaleString('zh-CN'); }

  var LEAD_META = {
    PENDING: { name: '待分配', tone: 'warning' },
    FOLLOWING: { name: '待跟进', tone: 'brand' },
    PSEUDO: { name: '伪线索', tone: 'default', rowTone: 'row-muted' },
    TO_POOL: { name: '公海池', tone: 'info' },
    CONVERTED: { name: '已转商机', tone: 'success', rowTone: 'row-muted' },
  };

  /* ---------- Toast ---------- */
  var toastRoot = $('#toastRoot');
  var toastSeq = 0;
  function toast(kind, msg, desc) {
    var id = ++toastSeq;
    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    var icons = {
      success: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 8.2l2 2 3.6-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.8v4M8 11.2h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.4v4M8 4.8h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    };
    el.innerHTML =
      '<span class="toast-icon">' + icons[kind] + '</span>' +
      '<span class="toast-body"><b>' + esc(msg) + '</b>' +
      (desc ? '<small>' + esc(desc) + '</small>' : '') + '</span>' +
      '<button class="toast-x" aria-label="关闭">&times;</button>';
    el.querySelector('.toast-x').onclick = function () { remove(); };
    toastRoot.appendChild(el);
    var timer = setTimeout(remove, kind === 'error' ? 5000 : 3000);
    function remove() {
      clearTimeout(timer);
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    void id;
  }

  /* ---------- 侧栏与顶栏 ----------
     activeKey 参数指定当前页，用于菜单高亮 */
  function renderShell(activeKey) {
    var sidebar = $('#sidebar');
    var canSystem = state.role !== 'SALES';
    var menus = [
      { group: '业务主链路', items: [
        { key: 'dashboard', label: '数据看板', href: '../original/dashboard.html', icon: 'M3 9h14M3 9V4h14v5M3 9v6h14V9M9 9v6' },
        { key: 'leads', label: '线索管理', href: 'leads.html', icon: 'M3 14l4-4 3 3 5-6', active: activeKey === 'leads' },
        { key: 'opp', label: '商机管理', href: 'opportunities.html', icon: 'M10 2v4l3 5-3 5-3-5 3-5z', active: activeKey === 'opp' },
        { key: 'cust', label: '客户管理', href: 'customers.html', icon: 'M13 14v-1.5a3 3 0 00-3-3H5a3 3 0 00-3 3V14M10 6.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', active: activeKey === 'cust' },
        { key: 'pool', label: '公海池', href: 'pool.html', icon: 'M10 2a8 8 0 100 16 8 8 0 000-16zM2 10h16M10 2c2 2.5 2 13.5 0 16M10 2C8 4.5 8 15.5 10 18', active: activeKey === 'pool' },
      ]},
      { group: '资源与配置', items: [
        { key: 'res', label: '资源管理', href: '../original/resources.html', icon: 'M3 3h14v14H3zM3 7h14M7 7v10' },
      ].concat(canSystem ? [{ key: 'sys', label: '系统管理', href: '../original/system.html', icon: 'M10 7a3 3 0 100 6 3 3 0 000-6zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4' }] : []) },
    ];

    var roleName = { SUPER_ADMIN: '超级管理员', SALES_MANAGER: '销售主管', SALES: '销售顾问' }[state.role];
    var scopeTxt = {
      SUPER_ADMIN: '可见全系统数据',
      SALES_MANAGER: '可见本部门及下属数据',
      SALES: '仅本人与公海数据',
    }[state.role];
    var initials = { SUPER_ADMIN: '张', SALES_MANAGER: '李', SALES: '王' }[state.role];
    var grad = {
      SUPER_ADMIN: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      SALES_MANAGER: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
      SALES: 'linear-gradient(135deg,#10b981,#14b8a6)',
    }[state.role];

    sidebar.innerHTML =
      '<div class="sidebar-brand">' +
        '<a href="#" class="sidebar-logo" aria-label="轻客管家首页"><svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M2 11l4-4 3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
        '<span class="sidebar-brand-text"><b>轻客管家</b><small>Qingke CRM</small></span>' +
        '<button class="sidebar-close" aria-label="关闭导航">&times;</button>' +
      '</div>' +
      '<nav class="sidebar-nav">' +
        menus.map(function (g) {
          return '<div class="nav-group">' +
            '<div class="nav-group-label">' + esc(g.group) + '</div>' +
            g.items.map(function (it) {
              return '<a href="' + it.href + '" class="nav-item' + (it.active ? ' active' : '') + '"' +
                (it.active ? ' aria-current="page"' : '') + '>' +
                '<svg viewBox="0 0 20 20" fill="none" aria-hidden"><path d="' + it.icon + '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '<span>' + esc(it.label) + '</span></a>';
            }).join('') + '</div>';
        }).join('') +
      '</nav>' +
      '<div class="sidebar-foot"><b>' + roleName + '</b>' + scopeTxt + '</div>';

    // 移动端抽屉开关
    var mask = document.createElement('div');
    mask.className = 'sidebar-mask';
    mask.style.display = 'none';
    document.body.appendChild(mask);
    function closeNav() {
      sidebar.classList.remove('open');
      mask.style.display = 'none';
      document.body.style.overflow = '';
    }
    function openNav() {
      sidebar.classList.add('open');
      mask.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
    mask.onclick = closeNav;
    $('.sidebar-close').onclick = closeNav;
    $$('.nav-item', sidebar).forEach(function (a) { a.onclick = closeNav; });

    // 顶栏
    $('#topbar').innerHTML =
      '<button class="hamburger" aria-label="打开导航">' +
        '<svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '</button>' +
      '<form class="search-form" action="#">' +
        '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M11 11L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '<input type="search" placeholder="搜索手机号 / 姓名" aria-label="全局搜索">' +
        '<kbd>&#8984;K</kbd>' +
      '</form>' +
      '<button class="search-icon-btn" aria-label="搜索">' +
        '<svg width="17" height="17" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M11 11L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</button>' +
      '<span class="role-chip"><i></i>' + roleName + '</span>' +
      '<button class="icon-btn" aria-label="通知">' +
        '<svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M15 8a5 5 0 10-10 0c0 4-2 5-2 5h14s-2-1-2-5zM11.5 17a1.8 1.8 0 01-3 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span class="icon-badge"></span>' +
      '</button>' +
      '<div class="user-wrap">' +
        '<button class="user-btn" aria-expanded="false" aria-haspopup="menu">' +
          '<span class="user-avatar" style="background:' + grad + '">' + initials + '</span>' +
          '<span class="user-meta"><b>' + ({SUPER_ADMIN:'张启明',SALES_MANAGER:'李文静',SALES:'王小雨'})[state.role] + '</b>' +
            '<small>' + ({SUPER_ADMIN:'运营中心',SALES_MANAGER:'华东销售部',SALES:'一组'})[state.role] + '</small></span>' +
        '</button>' +
      '</div>';

    // 汉堡按钮在顶栏渲染后才存在，此时才能绑定
    $('.hamburger').onclick = openNav;

    // 用户菜单
    var wrap = $('.user-wrap');
    var userBtn = $('.user-btn');
    userBtn.onclick = function (e) {
      e.stopPropagation();
      if ($('.dropdown', wrap)) { closeUserMenu(); return; }
      var dd = document.createElement('div');
      dd.className = 'dropdown';
      dd.setAttribute('role', 'menu');
      dd.innerHTML =
        '<div class="dropdown-head"><b>' + ({SUPER_ADMIN:'张启明',SALES_MANAGER:'李文静',SALES:'王小雨'})[state.role] + '</b>' +
        '<small>A000' + (state.role === 'SUPER_ADMIN' ? 1 : state.role === 'SALES_MANAGER' ? 2 : 3) + ' · ' +
        ({SUPER_ADMIN:'运营中心',SALES_MANAGER:'华东销售部',SALES:'一组'})[state.role] + '</small></div>' +
        '<button class="dropdown-item" role="menuitem">个人设置</button>' +
        '<button class="dropdown-item" role="menuitem">偏好设置</button>' +
        '<div class="dropdown-sep" role="separator"></div>' +
        '<button class="dropdown-item" data-toast="已退出登录（演示）" role="menuitem">退出登录</button>';
      wrap.appendChild(dd);
      userBtn.setAttribute('aria-expanded', 'true');
      function closeUserMenu() {
        if (dd.parentNode) dd.parentNode.removeChild(dd);
        userBtn.setAttribute('aria-expanded', 'false');
      }
      document.addEventListener('mousedown', function h(e) {
        if (!wrap.contains(e.target)) { closeUserMenu(); document.removeEventListener('mousedown', h); }
      });
      document.addEventListener('keydown', function h(e) {
        if (e.key === 'Escape') { closeUserMenu(); document.removeEventListener('keydown', h); }
      });
      $$('[data-toast]', dd).forEach(function (b) {
        b.onclick = function () { toast('info', b.dataset.toast); closeUserMenu(); };
      });
    };

    // 角色切换器（仅演示用，方便对比三种权限视角）
    var roleBar = document.createElement('div');
    roleBar.className = 'role-switch';
    roleBar.style.cssText = 'position:fixed;z-index:600;left:50%;transform:translateX(-50%);bottom:16px;' +
      'display:flex;gap:4px;padding:4px;background:#fff;border:1px solid var(--ink-200);' +
      'border-radius:999px;box-shadow:var(--shadow-lg);font-size:12px;';
    roleBar.innerHTML =
      '<span style="padding:0 8px;color:var(--ink-400);display:flex;align-items:center">视角</span>' +
      ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES'].map(function (r) {
        var label = { SUPER_ADMIN: '超管', SALES_MANAGER: '主管', SALES: '顾问' }[r];
        var bg = state.role === r ? 'var(--brand-500)' : 'transparent';
        var fg = state.role === r ? '#fff' : 'var(--ink-600)';
        return '<button data-role="' + r + '" style="padding:6px 12px;border-radius:999px;background:' + bg + ';color:' + fg + ';font-weight:500">' + label + '</button>';
      }).join('');
    document.body.appendChild(roleBar);
    $$('[data-role]', roleBar).forEach(function (b) {
      b.onclick = function () { state.role = b.dataset.role; location.reload(); };
    });
  }

  /* ---------- 渲染列表 ---------- */
  function filtered() {
    var list = DATA.leads.slice();
    if (state.status) {
      list = list.filter(function (l) { return l.status === state.status; });
    } else {
      list = list.filter(function (l) { return l.status !== 'PSEUDO'; });
    }
    if (state.followState === 'OVERDUE') {
      var now = Date.now();
      list = list.filter(function (l) {
        return l.nextFollowAt && new Date(l.nextFollowAt).getTime() < now && l.status === 'FOLLOWING';
      });
    } else if (state.followState === 'NEVER') {
      list = list.filter(function (l) { return !l.lastFollowAt && !l.followCount; });
    }
    if (state.keyword) {
      var kw = state.keyword.toLowerCase();
      list = list.filter(function (l) {
        return (l.name || '').toLowerCase().indexOf(kw) >= 0 ||
               (l.phone || '').indexOf(state.keyword) >= 0;
      });
    }
    if (state.ownerId) list = list.filter(function (l) { return l.ownerId === state.ownerId; });
    if (state.channelId) list = list.filter(function (l) { return l.channelId === state.channelId; });

    // 真实排序
    var key = state.sortBy, dir = state.sortOrder === 'asc' ? 1 : -1;
    list.sort(function (a, b) {
      var av = a[key], bv = b[key];
      // NULL 统一排最后
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'zh-CN') * dir;
    });
    return list;
  }

  function render() {
    var all = filtered();
    var totalPages = Math.max(1, Math.ceil(all.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    state.currentPage = state.page;
    var rows = all.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    $('#listCount').textContent = '共 ' + num(all.length) + ' 条';
    $('#pageInfo').textContent = all.length === 0 ? '暂无数据'
      : '第 ' + ((state.page - 1) * state.pageSize + 1) + ' - ' +
        Math.min(state.page * state.pageSize, all.length) + ' 条，共 ' + num(all.length) + ' 条';

    var tbody = $('#leadBody');
    var emptyBox = $('#emptyBox');
    var isSales = state.role === 'SALES';

    if (rows.length === 0) {
      tbody.innerHTML = '';
      emptyBox.hidden = false;
      $('.data-table', emptyBox.parentNode).style.display = 'none';
    } else {
      emptyBox.hidden = true;
      $('.data-table', emptyBox.parentNode).style.display = '';
      tbody.innerHTML = rows.map(function (r) {
        var meta = LEAD_META[r.status] || { name: r.status, tone: 'default' };
        var overdue = r.nextFollowAt && new Date(r.nextFollowAt) < new Date() && r.status === 'FOLLOWING';
        var sel = state.selected.has(r.id);

        var checkCell = isSales ? '' :
          '<td><label class="checkbox"><input type="checkbox" data-id="' + esc(r.id) + '"' +
          (sel ? ' checked' : '') + '><span class="box"></span></label></td>';

        var ownerCell = isSales ? '' : '<td>' + esc(r.ownerName || '—') + '</td>';
        var deptCell = isSales ? '' : '<td>' + esc(r.deptName || '—') + '</td>';

        // 表格行
        var tr =
          '<tr class="' + (sel ? 'is-selected ' : '') + (meta.rowTone || '') + '" data-id="' + esc(r.id) + '">' +
          checkCell +
          '<td><a href="#" data-detail="' + esc(r.id) + '">' +
            '<div class="cell-main">' + esc(r.name) +
              (overdue ? ' <span class="overdue-dot" title="已超期未跟进"></span>' : '') + '</div>' +
            '<div class="cell-sub phone-cell">' +
              '<span data-phone="' + esc(r.phone) + '">' + maskPhone(r.phone) + '</span>' +
              '<button class="phone-reveal" data-reveal="' + esc(r.id) + '" title="查看完整号码将记录操作日志" aria-label="查看完整手机号">' +
                '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>' +
              '</button>' +
            '</div>' +
          '</a></td>' +
          '<td>' + esc(r.channelName || '--') + '</td>' +
          '<td>' + esc(r.courseName || '--') + '</td>' +
          '<td><span class="tag tag-' + meta.tone + '"><i></i>' + meta.name + '</span></td>' +
          ownerCell + deptCell +
          '<td>' + fmtDate(r.createdAt) + '</td>' +
          '<td>' + fromNow(r.lastFollowAt) + '</td>' +
          '<td class="ta-c ta">' + (r.followCount || 0) + '</td>' +
          '<td class="' + (overdue ? 'overdue-text' : '') + '">' +
            (r.nextFollowAt ? fmtDateTime(r.nextFollowAt) : '--') + '</td>' +
          '<td class="col-actions">' +
            '<a href="#" class="link-act" data-detail="' + esc(r.id) + '">详情</a>' +
            (r.status === 'FOLLOWING' ? '<button class="link-act plain" data-toast="跟进面板">跟进</button>' : '') +
          '</td>' +
          '</tr>';

        // 移动端卡片
        var card =
          '<div class="mobile-item">' +
            (isSales ? '' : '<label class="checkbox"><input type="checkbox" data-id="' + esc(r.id) + '"' + (sel ? ' checked' : '') + '><span class="box"></span></label>') +
            '<a href="#" class="mobile-main" data-detail="' + esc(r.id) + '">' +
              '<div class="mobile-top"><span class="mobile-name">' + esc(r.name) + '</span>' +
                '<span class="tag tag-' + meta.tone + '">' + meta.name + '</span></div>' +
              '<div class="cell-sub phone-cell">' +
                '<span data-phone="' + esc(r.phone) + '">' + maskPhone(r.phone) + '</span>' +
                '<button class="phone-reveal" data-reveal="' + esc(r.id) + '" aria-label="查看完整手机号">' +
                  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>' +
                '</button></div>' +
              '<div class="mobile-meta"><span>跟进 ' + (r.followCount || 0) + ' 次</span>' +
                '<span>' + fmtDate(r.createdAt) + ' 创建</span>' +
                (!isSales && r.ownerName ? '<span>' + esc(r.ownerName) + '</span>' : '') +
                (overdue ? '<span class="overdue-text">超期 ' + fmtDateTime(r.nextFollowAt) + '</span>' : '') +
              '</div>' +
            '</a>' +
          '</div>';

        return tr + card;
      }).join('');

      // 重建表头：角色相关列（归属人/所属部门/勾选框）在顾问视角下要隐藏。
      // 这些变量必须在循环外定义 —— 之前的写法放在循环内，
      // 表头重建时拿不到，抛 ReferenceError 导致页签与分页全部不渲染。
      var ownerHead = isSales ? '' : '<th>归属人</th>';
      var deptHead = isSales ? '' : '<th>所属部门</th>';
      var checkHead = isSales ? '' :
        '<th class="col-check"><label class="checkbox"><input type="checkbox" id="checkAll"><span class="box"></span></label></th>';

      var trh = $('thead tr');
      if (trh) {
        var ths = '<th>姓名 / 手机号</th><th>来源渠道</th><th>意向课程</th><th>状态</th>' +
          ownerHead + deptHead +
          '<th><button class="sort-btn" data-sort="createdAt">创建时间<span class="sort-ind"></span></button></th>' +
          '<th><button class="sort-btn" data-sort="lastFollowAt">最后跟进<span class="sort-ind"></span></button></th>' +
          '<th class="ta-c"><button class="sort-btn" data-sort="followCount">跟进次数<span class="sort-ind"></span></button></th>' +
          '<th><button class="sort-btn" data-sort="nextFollowAt">下次跟进<span class="sort-ind"></span></button></th>' +
          '<th class="col-actions">操作</th>';
        trh.innerHTML = checkHead + ths;
      }

      bindRowEvents();
    }

    renderQuickTabs();
    renderPagination(totalPages);
    renderActiveFilters();
    updateBatchBar();
  }

  /* ---------- 事件绑定 ---------- */
  function bindRowEvents() {
    // 跨页选择：选中集合独立于当前页
    $$('#leadBody input[type=checkbox]').forEach(function (cb) {
      cb.onchange = function () {
        var id = cb.dataset.id;
        if (cb.checked) {
          state.selected.add(id);
          state.selectedPages.add(state.currentPage);
        } else {
          state.selected.delete(id);
          if (state.selected.size === 0) state.selectedPages.clear();
        }
        render();
      };
    });

    var all = $('#checkAll');
    if (all) {
      all.onchange = function () {
        var rows = filtered().slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
        if (all.checked) {
          rows.forEach(function (r) { state.selected.add(r.id); });
          state.selectedPages.add(state.currentPage);
        } else {
          rows.forEach(function (r) { state.selected.delete(r.id); });
          state.selectedPages.delete(state.currentPage);
        }
        render();
      };
      var pageRows = filtered().slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
      var selCount = pageRows.filter(function (r) { return state.selected.has(r.id); }).length;
      all.checked = selCount > 0 && selCount === pageRows.length;
      all.indeterminate = selCount > 0 && selCount < pageRows.length;
    }

    // 手机号查看（带留痕提示）
    $$('[data-reveal]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var span = btn.parentNode.querySelector('[data-phone]');
        if (span.dataset.shown === '1') {
          span.textContent = maskPhone(span.dataset.phone);
          span.dataset.shown = '0';
          return;
        }
        span.textContent = span.dataset.phone;
        span.dataset.shown = '1';
        toast('info', '已记录操作日志', '查看完整手机号的行为已留痕');
      };
    });

    $$('[data-detail]').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        var row = DATA.leads.find(function (l) { return l.id === a.dataset.detail; });
        if (row) toast('info', row.code + ' ' + row.name, '详情页开发中：跟进时间轴 + 转商机');
      };
    });

    // 排序按钮（真实排序，非假切换）
    $$('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var f = b.dataset.sort;
        if (state.sortBy === f) {
          state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
        } else {
          state.sortBy = f;
          state.sortOrder = f === 'name' ? 'asc' : 'desc';
        }
        render();
      };
    });
  }

  /* ---------- 快捷页签 ---------- */
  function renderQuickTabs() {
    var c = DATA.counts || {};
    var tabs = [
      { v: '', label: '全部线索', n: c.all },
      { v: 'PENDING', label: '待分配', n: c.PENDING },
      { v: 'FOLLOWING', label: '待跟进', n: c.FOLLOWING },
      { v: 'OVERDUE', label: '超期未跟进', n: c.OVERDUE },
      { v: 'NEVER', label: '从未跟进', n: c.NEVER },
      { v: 'PSEUDO', label: '伪线索', n: c.PSEUDO },
      { v: 'CONVERTED', label: '已转商机', n: c.CONVERTED },
    ];
    var cur = state.status || state.followState;
    $('#quickTabs').innerHTML = tabs.map(function (t) {
      return '<button class="quick-tab' + (t.v === cur ? ' active' : '') + '" data-q="' + t.v + '"' +
        ' role="tab" aria-selected="' + (t.v === cur) + '">' + esc(t.label) +
        '<span class="badge-count">' + num(t.n || 0) + '</span></button>';
    }).join('');
    $$('[data-q]').forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.q;
        if (v === 'OVERDUE' || v === 'NEVER') { state.followState = v; state.status = ''; }
        else { state.status = v; state.followState = ''; }
        state.page = 1;
        state.selected.clear();
        state.selectedPages.clear();
        render();
      };
    });
  }

  /* ---------- 已选筛选条件 ---------- */
  function renderActiveFilters() {
    var list = [];
    if (state.keyword) list.push({ k: 'keyword', label: '关键词：' + state.keyword });
    if (state.ownerId) {
      var o = DATA.users.find(function (u) { return u.id === state.ownerId; });
      if (o) list.push({ k: 'ownerId', label: '归属人：' + o.name });
    }
    if (state.channelId) {
      var ch = DATA.channels.find(function (c) { return c.id === state.channelId; });
      if (ch) list.push({ k: 'channelId', label: '渠道：' + ch.name });
    }
    var box = $('#activeFilters');
    if (list.length === 0) { box.classList.remove('show'); return; }
    box.classList.add('show');
    box.innerHTML = '<span>已选条件</span>' +
      list.map(function (f) {
        return '<span class="filter-chip">' + esc(f.label) +
          '<button data-rm="' + f.k + '" aria-label="移除筛选条件">&times;</button></span>';
      }).join('') +
      '<button class="filter-clear" id="clearAll">清空</button>';
    $$('[data-rm]', box).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.rm;
        state[k] = '';
        if (k === 'keyword') $('#kwInput').value = '';
        if (k === 'ownerId') $('#fOwner').value = '';
        if (k === 'channelId') $('#fChannel').value = '';
        render();
      };
    });
    $('#clearAll').onclick = function () { resetFilters(); };
  }

  function resetFilters() {
    state.keyword = ''; state.ownerId = ''; state.channelId = '';
    state.status = ''; state.followState = '';
    state.page = 1;
    state.selected.clear(); state.selectedPages.clear();
    $('#kwInput').value = ''; $('#fStatus').value = '';
    $('#fOwner').value = ''; $('#fChannel').value = '';
    render();
  }

  /* ---------- 批量条 ---------- */
  function updateBatchBar() {
    var bar = $('#batchBar');
    if (state.selected.size === 0) { bar.hidden = true; return; }
    bar.hidden = false;
    $('#batchCount').textContent = state.selected.size;
    // 跨页提示：原型的「全选仅限当前页」缺陷修复点
    var cross = $('#crossPage');
    if (state.selectedPages.size > 1) {
      cross.hidden = false;
      $('#crossPageNum').textContent = state.selectedPages.size;
    } else {
      cross.hidden = true;
    }
  }

  /* ---------- 分页 ---------- */
  function renderPagination(totalPages) {
    var nav = $('#pageNav');
    var p = state.page;
    var pages = [];
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - p) <= 1) pages.push(i);
      else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
    }
    var html = '<button class="page-btn" data-p="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + ' aria-label="上一页">&#8249;</button>';
    pages.forEach(function (x) {
      html += x === 'gap'
        ? '<span class="page-gap">&hellip;</span>'
        : '<button class="page-btn' + (x === p ? ' active' : '') + '" data-p="' + x + '"' +
          (x === p ? ' aria-current="page"' : '') + '>' + x + '</button>';
    });
    html += '<button class="page-btn" data-p="' + (p + 1) + '"' + (p >= totalPages ? ' disabled' : '') + ' aria-label="下一页">&#8250;</button>';
    nav.innerHTML = html;
    $$('[data-p]', nav).forEach(function (b) {
      b.onclick = function () {
        var np = Number(b.dataset.p);
        if (np >= 1 && np <= totalPages) {
          state.page = np;
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
    });
  }

  /* ---------- 弹窗 ---------- */
  function openModal(id) {
    var m = $('#' + id);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    var first = m.querySelector('input, select');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closeModal(m) {
    m.hidden = true;
    document.body.style.overflow = '';
  }

  function confirmAction(title, text, onOk) {
    var m = $('#confirmModal');
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    var btn = $('#btnConfirmOk');
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.onclick = function () { closeModal(m); onOk(); };
    openModal('confirmModal');
  }

  /* ---------- 初始化 ---------- */
  function boot(d) {
    DATA.leads = d.leads || [];
    DATA.counts = d.counts || {};
    DATA.opportunities = d.opportunities || [];
    DATA.customers = d.customers || [];
    DATA.followUps = d.followUps || [];

    // 从数据里推导筛选项
    var users = {}, channels = {};
    DATA.leads.forEach(function (l) {
      if (l.ownerId && l.ownerName) users[l.ownerId] = { id: l.ownerId, name: l.ownerName, deptName: l.deptName };
      if (l.sourceChannelId && l.channelName) channels[l.sourceChannelId] = { id: l.sourceChannelId, name: l.channelName };
    });
    DATA.users = Object.keys(users).map(function (k) { return users[k]; });
    DATA.channels = Object.keys(channels).map(function (k) { return channels[k]; });

    renderShell(state.activeKey || 'leads');
    bindEvents();
    render();
  }

  function fail(e) {
    document.body.innerHTML =
      '<div style="padding:64px 24px;text-align:center;font-family:sans-serif">' +
      '<h2 style="color:#0f172a">预览数据未找到</h2>' +
      '<p style="color:#64748b;margin-top:10px">请在项目根目录执行下面的命令生成数据文件：</p>' +
      '<pre style="display:inline-block;margin-top:14px;padding:10px 16px;background:#0f172a;color:#cbd5e1;' +
      'border-radius:8px;font-size:12.5px">npm run preview:export</pre>' +
      '<p style="color:#94a3b8;margin-top:18px;font-size:12px">若已生成，请确认 data.json 与本页面在同一目录</p>' +
      (e ? '<pre style="margin-top:16px;font-size:11px;color:#ef4444;text-align:left;max-width:520px;margin-inline:auto;white-space:pre-wrap">' +
        esc(e.message || e) + '</pre>' : '') +
      '</div>';
  }

  function init() {
    // 优先级 1：HTML 内联数据（file:// 双击打开时 fetch 会被浏览器 CORS 拦截）
    if (window.__QK_DATA__) {
      boot(window.__QK_DATA__);
      return;
    }
    // 优先级 2：HTTP 环境下 fetch data.json
    if (location.protocol === 'file:') {
      fail(new Error('检测到以 file:// 协议打开，浏览器禁止读取本地 JSON。' +
        '请通过本地服务器访问，或运行 npm run preview:export 后重新生成页面。'));
      return;
    }
    fetch('data.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(boot)
      .catch(fail);
  }

  function bindEvents() {
    // 折叠筛选
    $('#btnToggle').onclick = function () {
      var grid = $('#filterGrid');
      var collapsed = grid.classList.toggle('collapsed');
      this.textContent = collapsed ? '展开筛选' : '收起筛选';
      this.setAttribute('aria-expanded', String(!collapsed));
    };

    $('#btnSearch').onclick = function () {
      state.keyword = $('#kwInput').value.trim();
      state.status = $('#fStatus').value;
      state.ownerId = $('#fOwner') ? $('#fOwner').value : '';
      state.channelId = $('#fChannel') ? $('#fChannel').value : '';
      state.page = 1;
      state.selected.clear();
      state.selectedPages.clear();
      render();
    };
    $('#btnReset').onclick = resetFilters;
    $('#btnEmptyClear').onclick = resetFilters;

    $('#fSort').onchange = function () { state.sortBy = this.value; render(); };
    $('#pageSize').onchange = function () { state.pageSize = Number(this.value); state.page = 1; render(); };

    // 通用 toast 委托
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toast]');
      if (t) { toast('info', t.dataset.toast); }
    });

    $$('[data-open]').forEach(function (b) {
      b.onclick = function () { openModal(b.dataset.open === 'create' ? 'createModal' : b.dataset.open + 'Modal'); };
    });
    $$('[data-close]').forEach(function (b) {
      b.onclick = function () { closeModal(b.closest('.modal-root')); };
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        $$('.modal-root:not([hidden])').forEach(closeModal);
      }
    });

    // 批量操作
    $('#btnCancelBatch').onclick = function () {
      state.selected.clear(); state.selectedPages.clear(); render();
    };
    $$('[data-batch]').forEach(function (b) {
      b.onclick = function () {
        var act = b.dataset.batch;
        var n = state.selected.size;
        if (act === 'assign') {
          $('#assignNote').textContent = '将把选中的 ' + n + ' 条线索分配给指定归属人。';
          openModal('assignModal');
          return;
        }
        if (act === 'pseudo') {
          confirmAction('批量标记伪线索',
            '标记后线索进入终态「伪线索」，不再计入转化率，但历史跟进记录会完整保留。此操作不可撤销。',
            function () {
              toast('success', '已标记 ' + n + ' 条为伪线索', '跟进记录已保留');
              state.selected.clear(); state.selectedPages.clear(); render();
            });
          return;
        }
        confirmAction('踢回公海',
          '踢回后归属人将被清空，线索进入公海池，任何人都可以领取。商机阶段停留天数会继续累计，不重置。',
          function () {
            toast('success', '已踢回公海 ' + n + ' 条', '归属轨迹已记录');
            state.selected.clear(); state.selectedPages.clear(); render();
          });
      };
    });

    // 分配策略联动
    $('#assignStrategy').onchange = function () {
      var v = this.value;
      $('#assignOwnerRow').hidden = v !== 'manual';
      $('#assignDeptRow').hidden = v !== 'dept';
    };
    $('#btnAssignConfirm').onclick = function () {
      closeModal($('#assignModal'));
      toast('success', '分配完成', '共 ' + state.selected.size + ' 条线索已更新归属');
      state.selected.clear(); state.selectedPages.clear(); render();
    };

    // 新建线索
    $('#btnCreateConfirm').onclick = function () {
      var name = $('#cName').value.trim();
      var phone = $('#cPhone').value.trim();
      if (!name) { toast('error', '请填写姓名'); $('#cName').focus(); return; }
      if (!/^1[3-9]\d{9}$/.test(phone)) { toast('error', '手机号格式不正确'); $('#cPhone').focus(); return; }
      // 演示：本地校验重复（真实环境由部分唯一索引拦截）
      var dup = DATA.leads.some(function (l) {
        return l.phone === phone && l.status !== 'PSEUDO' && l.status !== 'CONVERTED';
      });
      if (dup) {
        toast('error', '手机号已存在线索', '请勿重复录入（BR-L01 唯一约束）');
        return;
      }
      closeModal($('#createModal'));
      $('#cName').value = ''; $('#cPhone').value = '';
      toast('success', '线索已创建', '可在列表中查看（演示数据未持久化）');
    };

    // 角色相关元素显隐
    if (state.role === 'SALES') {
      $$('[data-role="manager"]').forEach(function (el) { el.style.display = 'none'; });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();