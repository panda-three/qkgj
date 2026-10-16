/**
 * 改造版 · 商机看板
 *
 * 核心修复：拖拽必须有「乐观更新 + 失败回滚 + 原因提示」三件套。
 * 原型 app.js 的 bindKanban 只做视觉移动，接口失败后卡片就停在错误位置，
 * 且没有任何提示——这是数据可信度问题，不是体验问题。
 *
 * 这里用「模拟接口」演示：拖到终态时按 15% 概率模拟失败，
 * 直观看到回滚效果。接真实后端时把 commitStage 换成 fetch 即可。
 */

(function () {
  'use strict';

  var OPPS = [];
  var ROLE = 'SALES_MANAGER';
  var view = 'board';
  var dragging = null;
  var rollbackInfo = null;

  var STAGES = [
    { key: 'FOLLOWING', name: '跟进中', dot: 'd-brand', limit: 3 },
    { key: 'NEGOTIATING', name: '谈判中', dot: 'd-warning', limit: 7 },
    { key: 'WON', name: '已赢单', dot: 'd-success', limit: null },
    { key: 'LOST', name: '已输单', dot: 'd-default', limit: null },
  ];

  var META = {
    FOLLOWING: { name: '跟进中', tone: 'brand' },
    NEGOTIATING: { name: '谈判中', tone: 'warning' },
    WON: { name: '已赢单', tone: 'success' },
    LOST: { name: '已输单', tone: 'default' },
  };

  var ALLOWED = {
    FOLLOWING: ['NEGOTIATING', 'WON', 'LOST'],
    NEGOTIATING: ['WON', 'LOST'],
    WON: [],
    LOST: [],
  };

  var NEXT = { FOLLOWING: 'NEGOTIATING', NEGOTIATING: 'WON', WON: null, LOST: null };

  function $(s) { return document.querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { return (v || 0).toLocaleString('zh-CN'); }
  function amount(v) { return '¥' + num(v); }
  function daysSince(v) {
    if (!v) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000));
  }
  function isOverdue(o) {
    var s = STAGES.filter(function (x) { return x.key === o.stage; })[0];
    if (!s || s.limit === null) return false;
    return daysSince(o.stageEnteredAt) > s.limit;
  }

  /* ---------- Toast ---------- */
  function toast(kind, msg, desc) {
    var icons = {
      success: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 8.2l2 2 3.6-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.8v4M8 11.2h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.4v4M8 4.8h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    };
    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.innerHTML =
      '<span class="toast-icon">' + icons[kind] + '</span>' +
      '<span class="toast-body"><b>' + esc(msg) + '</b>' +
      (desc ? '<small>' + esc(desc) + '</small>' : '') + '</span>' +
      '<button class="toast-x" aria-label="关闭">&times;</button>';
    $('#toastRoot').appendChild(el);
    var t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, kind === 'error' ? 5000 : 3000);
    el.querySelector('.toast-x').onclick = function () {
      clearTimeout(t);
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }

  /* ---------- 提交阶段变更（乐观更新 + 失败回滚） ---------- */
  function commitStage(card, toStage, extra) {
    var from = card.stage;

    // 1. 乐观更新：立刻移动卡片，不等接口
    card.stage = toStage;
    card.stageEnteredAt = new Date().toISOString();
    rollbackInfo = { card: card, from: from };
    render();

    var bar = $('#rollbackBar');
    bar.hidden = false;
    bar.innerHTML =
      '<svg class="spin" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/><path d="M14 8a6 6 0 00-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<span>正在提交 ' + esc(card.code) + ' 的阶段变更…失败会自动还原</span>';

    // 2. 模拟接口调用
    setTimeout(function () {
      // 输单需要原因，缺原因时模拟服务端 400
      var failReason = null;
      if (toStage === 'LOST' && !(extra && extra.lostReason)) {
        failReason = '请填写输单原因';
      } else if (Math.random() < 0.15) {
        // 模拟并发冲突：其他同事先一步改了这单
        failReason = '该商机已被他人操作，请刷新后重试';
      }

      bar.hidden = true;
      rollbackInfo = null;

      if (failReason) {
        // 3. 失败回滚：卡片退回原位，并明确告知原因
        card.stage = from;
        render();
        toast.error('推进失败，已还原到「' + META[from].name + '」', failReason);
      } else {
        toast.success(card.code + ' 已推进',
          META[from].name + ' → ' + META[toStage].name);
      }
    }, 700);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var open = OPPS.filter(function (o) { return o.stage !== 'WON' && o.stage !== 'LOST'; });
    var overdue = open.filter(isOverdue);
    $('#mOpen').textContent = open.length;
    $('#mOverdue').textContent = overdue.length;
    $('#mAmount').textContent = amount(
      open.reduce(function (s, o) { return s + (o.amount || 0); }, 0)
    );

    if (view === 'board') renderBoard();
    else renderList();
  }

  function renderBoard() {
    $('#board').hidden = false;
    $('#listView').hidden = true;

    $('#board').innerHTML = STAGES.map(function (st) {
      var list = OPPS.filter(function (o) { return o.stage === st.key; });
      var od = list.filter(isOverdue).length;

      return '<div class="board-col" data-stage="' + st.key + '">' +
        '<div class="board-col-head">' +
          '<span class="dot ' + st.dot + '"></span>' +
          '<span style="font-size:13px;font-weight:500;color:var(--ink-800)">' + st.name + '</span>' +
          '<span style="font-size:12px;color:var(--ink-400)">' + list.length + '</span>' +
          (od > 0
            ? '<span class="overdue-badge">' +
                '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 2.5L1.5 13.5h13L8 2.5zM8 6.5v3M8 11.5h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                od + ' 超期'
              '</span>'
            : '') +
        '</div>' +
        '<div class="board-col-body" data-drop="' + st.key + '">' +
          (list.length === 0
            ? '<div class="board-empty">拖拽商机到此列</div>'
            : list.map(cardHtml).join('')) +
        '</div>' +
      '</div>';
    }).join('');

    bindBoard();
  }

  function cardHtml(o) {
    var meta = META[o.stage];
    var od = isOverdue(o);
    var stay = daysSince(o.stageEnteredAt);
    var limit = STAGES.filter(function (x) { return x.key === o.stage; })[0].limit;
    var next = NEXT[o.stage];

    return '<div class="opp-card' + (od ? ' overdue' : '') + '" draggable data-id="' + esc(o.id) + '">' +
      '<svg class="grip" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.2" fill="currentColor"/><circle cx="11" cy="4" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>' +
      '<div class="opp-title">' +
        '<div class="opp-name">' + esc(o.customerName) + '</div>' +
        '<div class="opp-code">' + esc(o.code) + '</div>' +
      '</div>' +
      '<div class="opp-sub">' + esc(o.name) + '</div>' +
      '<div class="opp-row">' +
        '<span class="opp-amount">' + amount(o.amount) + '</span>' +
        '<span class="tag tag-' + meta.tone + '"><i></i>' + meta.name + '</span>' +
      '</div>' +
      '<div class="opp-foot">' +
        '<span>' + esc(o.ownerName || '公海') + '</span>' +
        '<span class="' + (od ? 'opp-stay-over' : '') + '">' +
          (limit !== null ? '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="vertical-align:-1px"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> ' : '') +
          stay + ' 天' + (od ? ' · 超期' : '') +
        '</span>' +
      '</div>' +
      (next && ROLE !== 'SALES'
        ? '<button class="opp-advance" data-advance="' + esc(o.id) + '">推进到' + META[next].name +
          ' →</button>'
        : '') +
    '</div>';
  }

  function bindBoard() {
    // 拖拽
    $$('.opp-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        dragging = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragging);
      });
      card.addEventListener('dragend', function () {
        dragging = null;
        card.classList.remove('dragging');
        $$('.board-col').forEach(function (c) { c.classList.remove('drop'); });
      });
    });

    $$('[data-drop]').forEach(function (zone) {
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.closest('.board-col').classList.add('drop');
      });
      zone.addEventListener('dragleave', function () {
        zone.closest('.board-col').classList.remove('drop');
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.closest('.board-col').classList.remove('drop');
        handleDrop(zone.dataset.drop);
      });
    });

    // 触屏/键盘路径：推进按钮
    $$('[data-advance]').forEach(function (btn) {
      btn.onclick = function () { advance(btn.dataset.advance); };
    });
  }

  function handleDrop(toStage) {
    var id = dragging;
    dragging = null;
    if (!id) return;

    var card = OPPS.filter(function (o) { return o.id === id; })[0];
    if (!card || card.stage === toStage) return;

    // 前端先校验跃迁合法性，与服务端规则一致
    if (ALLOWED[card.stage].indexOf(toStage) < 0) {
      toast.error('不允许的阶段流转',
        META[card.stage].name + ' 不能直接变为 ' + META[toStage].name);
      return;
    }

    if (toStage === 'LOST') { openLostDialog(card); return; }
    commitStage(card, toStage);
  }

  function advance(id) {
    var card = OPPS.filter(function (o) { return o.id === id; })[0];
    if (!card) return;
    var next = NEXT[card.stage];
    if (!next) return;
    if (next === 'LOST') { openLostDialog(card); return; }
    commitStage(card, next);
  }

  function renderList() {
    $('#board').hidden = true;
    $('#listView').hidden = false;

    if (OPPS.length === 0) {
      $('#listView').innerHTML = '<div class="card"><p style="padding:48px;text-align:center;color:var(--ink-400)">暂无商机</p></div>';
      return;
    }

    $('#listView').innerHTML = '<div class="card">' + OPPS.map(function (o) {
      var meta = META[o.stage];
      var od = isOverdue(o);
      var next = NEXT[o.stage];
      return '<div class="opp-list-row' + (od ? ' overdue' : '') + '">' +
        '<div style="min-width:160px;flex:1">' +
          '<div style="font-size:13.5px;font-weight:500;color:var(--ink-900)">' + esc(o.customerName) + '</div>' +
          '<div style="font-size:11.5px;color:var(--ink-400)">' + esc(o.code) + ' · ' + esc(o.name) + '</div>' +
        '</div>' +
        '<span style="width:96px;text-align:right;font-size:13px;color:var(--ink-800)" class="ta">' + amount(o.amount) + '</span>' +
        '<span class="tag tag-' + meta.tone + '" style="width:80px;justify-content:center">' + meta.name + '</span>' +
        '<span style="width:96px;text-align:right;font-size:12px;color:var(--ink-500)">' + esc(o.ownerName || '公海') + '</span>' +
        '<span style="width:64px;text-align:right;font-size:12px;' +
          (od ? 'color:var(--danger-600);font-weight:500' : 'color:var(--ink-400)') + '">' +
          daysSince(o.stageEnteredAt) + ' 天</span>' +
        (next && ROLE !== 'SALES'
          ? '<button class="btn btn-sm btn-ghost" data-advance="' + esc(o.id) + '">推进</button>'
          : '<span style="width:64px"></span>') +
      '</div>';
    }).join('') + '</div>';

    $$('[data-advance]').forEach(function (btn) {
      btn.onclick = function () { advance(btn.dataset.advance); };
    });
  }

  /* ---------- 输单弹窗 ---------- */
  var lostTarget = null;
  function openLostDialog(card) {
    lostTarget = card;
    $('#lostReason').value = '';
    $('#lostRemark').value = '';
    var m = $('#lostModal');
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#lostReason').focus(); }, 60);
  }
  function closeLost() {
    $('#lostModal').hidden = true;
    document.body.style.overflow = '';
    lostTarget = null;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var d = window.__QK_DATA__;
    OPPS = (d && d.opportunities ? d.opportunities : []).slice();

    // 角色从 URL 参数读取，方便对比三种权限视角
    var m = location.search.match(/role=(\w+)/);
    if (m) ROLE = m[1];

    render();

    // 视图切换
    $$('[data-view]').forEach(function (b) {
      b.onclick = function () {
        view = b.dataset.view;
        $$('[data-view]').forEach(function (x) { x.classList.toggle('on', x === b); });
        render();
      };
    });

    // 输单弹窗
    $$('#lostModal [data-close]').forEach(function (b) { b.onclick = closeLost; });
    $('#btnConfirmLost').onclick = function () {
      if (!lostTarget) return;
      var reason = $('#lostReason').value;
      if (!reason) {
        toast.error('请选择输单原因', '输单原因为必填项（BR-O02）');
        $('#lostReason').focus();
        return;
      }
      var card = lostTarget;
      closeLost();
      commitStage(card, 'LOST', { lostReason: reason });
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#lostModal').hidden) closeLost();
    });

    // 侧栏与顶栏（复用 compare.js 的外壳）
    if (window.QK_SHELL) window.QK_SHELL('leads');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();