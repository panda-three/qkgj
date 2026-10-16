'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Clock, GripVertical, LayoutGrid, List, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/Feedback';
import { StatusTag } from '@/components/business/StatusTag';
import { Modal } from '@/components/ui/Modal';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { OPP_STAGE, OPP_STAGE_META, LOST_REASONS, type OppStage } from '@/lib/constants';
import { formatAmount, formatDate, daysSince } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * 商机看板
 *
 * 修复原型的关键缺陷：看板拖拽必须有
 *  1. 乐观更新 —— 卡片立刻移动，不等接口返回
 *  2. 失败回滚 —— 接口失败时卡片退回原位，并明确告知原因
 *  3. 非法跃迁拦截 —— 按 PRD 状态机校验，前端先拦一道
 *
 * 原型 app.js 的 bindKanban 只做了视觉移动，没有任何回滚逻辑，
 * 接口失败后卡片就停在错误位置且无人知晓，这是数据可信度问题。
 *
 * 无障碍：拖拽是鼠标专属交互，因此每张卡片额外提供
 * 「推进到下一阶段」按钮，键盘与触屏用户同样可用。
 */

export type OppRowView = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  phone: string;
  amount: number;
  stage: OppStage;
  ownerId: string | null;
  ownerName: string | null;
  deptName: string | null;
  courseName: string | null;
  stageEnteredAt: string;
  expectedCloseDate: string | null;
};

const STAGE_ORDER: OppStage[] = ['FOLLOWING', 'NEGOTIATING', 'WON', 'LOST'];

/** 与服务端 oppStage.ts 保持一致，避免前后端规则漂移 */
const NEXT_STAGE: Record<OppStage, OppStage | null> = {
  FOLLOWING: 'NEGOTIATING',
  NEGOTIATING: 'WON',
  WON: null,
  LOST: null,
};

/** 阶段停留天数阈值（PRD 3.2） */
const STAY_LIMIT: Record<OppStage, number | null> = {
  FOLLOWING: 3,
  NEGOTIATING: 7,
  WON: null,
  LOST: null,
};

function isOverdue(o: OppRowView): boolean {
  const limit = STAY_LIMIT[o.stage];
  if (limit === null) return false;
  return daysSince(o.stageEnteredAt) > limit;
}

export function OppBoardClient({
  initialRows,
  counts,
  role,
}: {
  initialRows: OppRowView[];
  counts: Record<string, number>;
  role: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // 本地状态是看板的唯一数据源，乐观更新直接改它
  const [cards, setCards] = useState<OppRowView[]>(initialRows);
  const [view, setView] = useState<'board' | 'list'>('board');

  // 拖拽状态：dragging 为正在拖的卡片，dropTarget 为悬停的目标列
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<OppStage | null>(null);
  // 回滚记录：接口失败时用它还原
  const [rollback, setRollback] = useState<{ card: OppRowView; from: OppStage } | null>(null);

  const [lostDialog, setLostDialog] = useState<{ card: OppRowView } | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostRemark, setLostRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // 服务端数据变了但本地还没有对应变更时，同步一次
  useEffect(() => {
    setCards((prev) => {
      const localIds = new Set(prev.map((c) => c.id));
      const isSameData =
        prev.length === initialRows.length &&
        prev.every((p) => {
          const n = initialRows.find((x) => x.id === p.id);
          return n && n.stage === p.stage;
        });
      // 本地有待确认的乐观更新时不覆盖，避免闪烁
      if (isSameData || pendingIds.size > 0) return prev;
      if (localIds.size === new Set(initialRows.map((x) => x.id)).size) return prev;
      return initialRows;
    });
  }, [initialRows, pendingIds]);

  const byStage = useMemo(() => {
    const map: Record<string, OppRowView[]> = { FOLLOWING: [], NEGOTIATING: [], WON: [], LOST: [] };
    cards.forEach((c) => {
      (map[c.stage] ??= []).push(c);
    });
    return map;
  }, [cards]);

  /* ---------- 提交阶段变更 ---------- */
  const commit = useCallback(
    async (card: OppRowView, toStage: OppStage, extra?: { lostReason?: string }) => {
      const from = card.stage;

      // 乐观更新：立刻移动
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, stage: toStage, stageEnteredAt: new Date().toISOString() } : c)),
      );
      setPendingIds((prev) => new Set(prev).add(card.id));
      setRollback({ card, from });

      try {
        const res = await fetch('/api/opportunities/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oppId: card.id, toStage, ...extra }),
        });
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message ?? '阶段推进失败');
        }

        setRollback(null);
        toast.success(
          `${card.code} 已推进`,
          `${OPP_STAGE_META[from].name} → ${OPP_STAGE_META[toStage].name}`,
        );
        router.refresh();
      } catch (e) {
        // 关键：失败必须回滚到原位，并告诉用户原因
        const msg = e instanceof Error ? e.message : '未知错误';
        setCards((prev) =>
          prev.map((c) => (c.id === card.id ? { ...c, stage: from } : c)),
        );
        setRollback(null);
        toast.error('推进失败，已还原', msg);
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(card.id);
          return next;
        });
      }
    },
    [router, toast],
  );

  /* ---------- 拖拽 ---------- */
  function handleDrop(toStage: OppStage) {
    const id = dragging;
    setDragging(null);
    setDropTarget(null);
    if (!id) return;

    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (card.stage === toStage) return;

    // 前端先做一次合法性校验，与服务端规则一致
    const allowed: Record<OppStage, OppStage[]> = {
      FOLLOWING: ['NEGOTIATING', 'WON', 'LOST'],
      NEGOTIATING: ['WON', 'LOST'],
      WON: [],
      LOST: [],
    };
    if (!allowed[card.stage].includes(toStage)) {
      toast.error('不允许的阶段流转', `${OPP_STAGE_META[card.stage].name} 不能直接变为 ${OPP_STAGE_META[toStage].name}`);
      return;
    }

    // 输单需要填原因，先弹窗而不是直接提交
    if (toStage === 'LOST') {
      setLostDialog({ card });
      setLostReason('');
      setLostRemark('');
      return;
    }

    void commit(card, toStage);
  }

  // 用原生 HTML5 拖拽：不引依赖，且触摸端由「推进」按钮兜底
  function onDragStart(e: React.DragEvent, id: string) {
    setDragging(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 需要设置数据才会触发拖拽
    e.dataTransfer.setData('text/plain', id);
  }

  function onDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  /* ---------- 键盘/触屏路径：推进到下一阶段 ---------- */
  function advance(card: OppRowView) {
    const next = NEXT_STAGE[card.stage];
    if (!next) return;
    if (next === 'LOST') {
      setLostDialog({ card });
      setLostReason('');
      setLostRemark('');
      return;
    }
    void commit(card, next);
  }

  /* ---------- 输单确认 ---------- */
  async function confirmLost() {
    if (!lostDialog) return;
    if (!lostReason) {
      toast.error('请选择输单原因', '输单原因为必填项（BR-O02）');
      return;
    }
    setSaving(true);
    await commit(lostDialog.card, 'LOST', { lostReason });
    setSaving(false);
    setLostDialog(null);
  }

  /* ---------- 列表视图 ---------- */
  if (view === 'list') {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <div className="inline-flex rounded-[6px] border border-ink-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('board')}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-ink-600 transition-colors hover:bg-ink-100"
            >
              <LayoutGrid size={13} aria-hidden />
              看板
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 rounded bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-900"
              aria-current="true"
            >
              <List size={13} aria-hidden />
              列表
            </button>
          </div>
        </div>
        <Card>
          <CardHeader title="商机列表" count={cards.length} />
          <div className="divide-y divide-ink-100">
            {cards.length === 0 ? (
              <EmptyState title="暂无商机" description="线索转商机后会出现在这里" />
            ) : (
              cards.map((c) => (
                <OppListRow key={c.id} card={c} pending={pendingIds.has(c.id)} onAdvance={() => advance(c)} />
              ))
            )}
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- 看板视图 ---------- */
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span>
            进行中 <strong className="tabular text-ink-800">{counts.OPEN ?? 0}</strong> 个
          </span>
          <span>
            超期 <strong className="tabular text-danger-600">{counts.OVERDUE ?? 0}</strong> 个
          </span>
          <span className="hidden sm:inline">
            金额 <strong className="tabular text-ink-800">{formatAmount(counts.OPEN_AMOUNT ?? 0)}</strong>
          </span>
        </div>

        <div className="inline-flex rounded-[6px] border border-ink-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView('board')}
            className="flex items-center gap-1.5 rounded bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-900"
            aria-current="true"
          >
            <LayoutGrid size={13} aria-hidden />
            看板
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-ink-600 transition-colors hover:bg-ink-100"
          >
            <List size={13} aria-hidden />
            列表
          </button>
        </div>
      </div>

      {/* 回滚提示条 */}
      {rollback && (
        <div
          className="flex items-center gap-2 rounded-[8px] border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700"
          role="status"
        >
          <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden />
          <span>正在提交 {rollback.card.code} 的阶段变更…失败会自动还原</span>
          <button
            type="button"
            onClick={() => setRollback(null)}
            className="ml-auto rounded p-0.5 hover:bg-warning-100"
            aria-label="关闭提示"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
        {STAGE_ORDER.map((stage) => {
          const meta = OPP_STAGE_META[stage];
          const list = byStage[stage] ?? [];
          const isTarget = dropTarget === stage;
          const overdueCount = list.filter(isOverdue).length;

          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropTarget !== stage) setDropTarget(stage);
              }}
              onDragLeave={() => setDropTarget((t) => (t === stage ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage);
              }}
              className={cn(
                'flex w-[268px] shrink-0 flex-col rounded-[10px] border bg-ink-50 transition-colors sm:w-[300px]',
                isTarget ? 'border-brand-400 bg-brand-50/40' : 'border-ink-200',
              )}
              aria-label={`${meta.name}，${list.length} 个商机`}
            >
              {/* 列头 */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className={cn('size-2 rounded-full', toneDot[meta.tone])} aria-hidden />
                <span className="text-[13px] font-medium text-ink-800">{meta.name}</span>
                <span className="tabular text-xs text-ink-400">{list.length}</span>
                {overdueCount > 0 && (
                  <span
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-danger-50 px-1.5 py-0.5 text-[11px] text-danger-600"
                    title="阶段停留超期"
                  >
                    <AlertTriangle size={10} aria-hidden />
                    {overdueCount}
                  </span>
                )}
              </div>

              {/* 卡片列表 */}
              <div className="flex min-h-[80px] flex-1 flex-col gap-2 px-2 pb-2">
                {list.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-[8px] border border-dashed border-ink-200 py-6 text-xs text-ink-400">
                    拖拽商机到此列
                  </div>
                ) : (
                  list.map((c) => (
                    <OppCard
                      key={c.id}
                      card={c}
                      dragging={dragging === c.id}
                      pending={pendingIds.has(c.id)}
                      canAdvance={NEXT_STAGE[c.stage] !== null && role !== 'SALES'}
                      onDragStart={(e) => onDragStart(e, c.id)}
                      onDragEnd={onDragEnd}
                      onAdvance={() => advance(c)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 输单弹窗 */}
      <Modal
        open={!!lostDialog}
        onOpenChange={(o) => !o && setLostDialog(null)}
        title="标记输单"
        description={lostDialog ? `${lostDialog.card.code} ${lostDialog.card.name}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="default" onClick={() => setLostDialog(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={confirmLost} loading={saving}>
              确认输单
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[13px] leading-relaxed text-ink-600">
          输单后商机进入终态，不可再流转。输单原因会记入转化分析，帮助复盘输单原因分布。
        </p>
        <div className="space-y-3">
          <Field label="输单原因" required htmlFor="lostReason">
            <Select
              id="lostReason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            >
              <option value="">请选择输单原因</option>
              {LOST_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="补充说明" htmlFor="lostRemark">
            <Textarea
              id="lostRemark"
              rows={3}
              value={lostRemark}
              onChange={(e) => setLostRemark(e.target.value)}
              placeholder="可选，记录更具体的输单背景"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

const toneDot: Record<string, string> = {
  brand: 'bg-brand-500',
  warning: 'bg-warning-500',
  success: 'bg-success-500',
  default: 'bg-ink-400',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  purple: 'bg-purple-500',
};

/* ---------- 看板卡片 ---------- */
function OppCard({
  card,
  dragging,
  pending,
  canAdvance,
  onDragStart,
  onDragEnd,
  onAdvance,
}: {
  card: OppRowView;
  dragging: boolean;
  pending: boolean;
  canAdvance: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onAdvance: () => void;
}) {
  const meta = OPP_STAGE_META[card.stage];
  const overdue = isOverdue(card);
  const stayDays = daysSince(card.stageEnteredAt);
  const next = NEXT_STAGE[card.stage];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative cursor-grab rounded-[8px] border bg-white p-2.5 transition-shadow active:cursor-grabbing',
        overdue ? 'border-danger-100' : 'border-ink-200',
        dragging && 'opacity-45',
        pending && 'pointer-events-none opacity-70',
      )}
    >
      {pending && (
        <span className="absolute top-2 right-2 text-brand-500" aria-label="提交中">
          <Loader2 size={13} className="animate-spin" />
        </span>
      )}

      <div className="flex items-start gap-1.5">
        <GripVertical
          size={13}
          className="mt-0.5 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink-900">{card.customerName}</p>
          <p className="truncate text-[11px] text-ink-400">{card.code}</p>
        </div>
      </div>

      <p className="mt-1.5 truncate text-[11.5px] text-ink-600">{card.name}</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="tabular text-[13px] font-medium text-ink-900">
          {formatAmount(card.amount)}
        </span>
        <StatusTag tone={meta.tone} dot>
          {meta.name}
        </StatusTag>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-400">
        {card.ownerName && (
          <span className="truncate">{card.ownerName}</span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1',
            overdue ? 'font-medium text-danger-600' : '',
          )}
          title={`已在该阶段停留 ${stayDays} 天`}
        >
          {STAY_LIMIT[card.stage] !== null && <Clock size={10} aria-hidden />}
          {stayDays} 天
          {overdue && ' · 超期'}
        </span>
      </div>

      {/* 触屏与键盘用户的推进入口：拖拽不是唯一操作路径 */}
      {canAdvance && next && (
        <button
          type="button"
          onClick={onAdvance}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-[5px] bg-ink-100 py-1 text-[11px] text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
        >
          推进到{OPP_STAGE_META[next].name}
          <ArrowRight size={11} aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ---------- 列表行 ---------- */
function OppListRow({
  card,
  pending,
  onAdvance,
}: {
  card: OppRowView;
  pending: boolean;
  onAdvance: () => void;
}) {
  const meta = OPP_STAGE_META[card.stage];
  const overdue = isOverdue(card);
  const next = NEXT_STAGE[card.stage];

  return (
    <div className={cn('flex flex-wrap items-center gap-3 px-4 py-3', overdue && 'bg-danger-50/40')}>
      <div className="min-w-[160px] flex-1">
        <p className="truncate text-[13.5px] font-medium text-ink-900">{card.customerName}</p>
        <p className="truncate text-[11.5px] text-ink-400">{card.code} · {card.name}</p>
      </div>
      <span className="tabular w-24 text-right text-[13px] text-ink-800">
        {formatAmount(card.amount)}
      </span>
      <StatusTag tone={meta.tone} dot className="w-20 justify-center">
        {meta.name}
      </StatusTag>
      <span className="w-24 text-right text-xs text-ink-500">{card.ownerName ?? '公海'}</span>
      <span className={cn('w-16 text-right text-xs', overdue ? 'font-medium text-danger-600' : 'text-ink-400')}>
        {daysSince(card.stageEnteredAt)} 天
      </span>
      {pending ? (
        <Loader2 size={14} className="animate-spin text-brand-500" aria-label="提交中" />
      ) : next ? (
        <Button size="sm" variant="ghost" onClick={onAdvance}>
          推进
        </Button>
      ) : (
        <span className="w-16" />
      )}
    </div>
  );
}