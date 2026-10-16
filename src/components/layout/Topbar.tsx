'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ROLE_META, type RoleKey } from '@/lib/constants';
import type { SessionPayload } from '@/lib/auth/session';

const ROLE_GRADIENT: Record<RoleKey, string> = {
  SUPER_ADMIN: 'from-[#6366f1] to-[#8b5cf6]',
  SALES_MANAGER: 'from-[#06b6d4] to-[#3b82f6]',
  SALES: 'from-[#10b981] to-[#14b8a6]',
};

export function Topbar({
  session,
  onMenuClick,
}: {
  session: SessionPayload;
  onMenuClick: () => void;
}) {
  const router = useRouter();
  const role = session.role as RoleKey;
  const meta = ROLE_META[role];

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // 点击外部或按 ESC 关闭下拉
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(t)) setUserMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(t)) setNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 即使接口失败也要跳登录页，避免卡在已失效会话里
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-[300] flex h-[56px] items-center gap-2 border-b border-ink-200 bg-white/90 px-3 backdrop-blur-xl md:h-[60px] md:gap-3.5 md:px-5">
      {/* 汉堡按钮：仅移动端 */}
      <button
        type="button"
        onClick={onMenuClick}
        className="flex size-9 shrink-0 items-center justify-center rounded-[6px] text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:hidden"
        aria-label="打开导航菜单"
      >
        <Menu size={19} />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1 md:gap-2">
        {/* 角色标识 */}
        <span className="hidden items-center gap-1.5 rounded-[6px] border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
          {meta.name}
        </span>

        {/* 通知 */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex size-9 items-center justify-center rounded-[6px] text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            aria-label="通知"
            aria-expanded={notifOpen}
          >
            <Bell size={17} />
            <span
              className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger-500 ring-2 ring-white"
              aria-hidden
            />
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 z-[350] mt-1.5 w-[min(300px,calc(100vw-24px))] origin-top-right rounded-[10px] border border-ink-200 bg-white shadow-lg"
              role="dialog"
              aria-label="通知列表"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2.5">
                <span className="text-[13px] font-medium text-ink-900">通知</span>
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:underline"
                  onClick={() => setNotifOpen(false)}
                >
                  全部已读
                </button>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <NotifItem
                  tone="warning"
                  title="3 条商机已超期未跟进"
                  desc="谈判中阶段停留超7 天"
                  time="10 分钟前"
                />
                <NotifItem
                  tone="danger"
                  title="公海池有 8 条线索待领取"
                  desc="最早一条已等待 3 天"
                  time="1 小时前"
                />
              </div>
              <div className="border-t border-ink-100 px-3.5 py-2 text-center">
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-xs text-ink-500 hover:text-brand-600"
                >
                  查看全部通知
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 用户菜单 */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            className={cn(
              'flex items-center gap-2 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-ink-100',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              userMenuOpen && 'bg-ink-100',
            )}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white',
                ROLE_GRADIENT[role],
              )}
              aria-hidden
            >
              {session.name[0]}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[13px] font-medium text-ink-900">{session.name}</span>
              <span className="block text-[11px] text-ink-500">{session.deptName}</span>
            </span>
            <ChevronDown
              size={13}
              className="hidden shrink-0 text-ink-400 transition-transform sm:block"
              style={{ transform: userMenuOpen ? 'rotate(180deg)' : undefined }}
              aria-hidden
            />
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 z-[350] mt-1.5 w-[212px] origin-top-right rounded-[10px] border border-ink-200 bg-white py-1 shadow-lg"
              role="menu"
            >
              <div className="border-b border-ink-100 px-3.5 py-2.5">
                <p className="text-[13px] font-medium text-ink-900">{session.name}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {session.employeeNo} · {session.deptName}
                </p>
              </div>
              <MenuItem icon={User} onClick={() => setUserMenuOpen(false)}>
                个人设置
              </MenuItem>
              <MenuItem icon={Settings} onClick={() => setUserMenuOpen(false)}>
                偏好设置
              </MenuItem>
              <div className="my-1 h-px bg-ink-100" role="separator" />
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
              >
                <LogOut size={14} className="text-ink-400" aria-hidden />
                {loggingOut ? '退出中…' : '退出登录'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotifItem({
  tone,
  title,
  desc,
  time,
}: {
  tone: 'warning' | 'danger' | 'info';
  title: string;
  desc: string;
  time: string;
}) {
  const dot = {
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    info: 'bg-info-500',
  }[tone];
  return (
    <button
      type="button"
      className="flex w-full gap-2.5 border-b border-ink-100 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-ink-50"
    >
      <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink-800">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-400">{desc}</span>
      </span>
      <span className="shrink-0 text-[11px] text-ink-400">{time}</span>
    </button>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
}: {
  icon: typeof User;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
    >
      <Icon size={14} className="text-ink-400" aria-hidden />
      {children}
    </button>
  );
}

function GlobalSearch() {
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K 唤起搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* 移动端：图标按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex size-9 shrink-0 items-center justify-center rounded-[6px] text-ink-500 transition-colors hover:bg-ink-100 md:hidden"
        aria-label="搜索"
      >
        <Search size={17} />
      </button>

      {/* 桌面端：输入框 */}
      <form action="/leads" className="relative hidden min-w-0 flex-1 md:block" style={{ maxWidth: 300 }}>
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
        <input
          type="search"
          name="keyword"
          placeholder="搜索手机号 / 姓名"
          className="h-8 w-full rounded-[6px] border border-transparent bg-ink-50 pr-12 pl-8 text-[13px] text-ink-800 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-400 focus:bg-white focus:ring-[3px] focus:ring-brand-500/12"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-ink-200 bg-white px-1 py-0.5 text-[10px] text-ink-400">
          ⌘K
        </kbd>
      </form>

      {/* 移动端搜索展开层 */}
      {open && (
        <div className="fixed inset-0 z-[450] md:hidden" role="dialog" aria-label="搜索">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative bg-white px-3 pt-3 pb-2 shadow-lg">
            <div className="flex items-center gap-2">
              <form action="/leads" className="relative flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400"
                  aria-hidden
                />
                <input
                  type="search"
                  name="keyword"
                  autoFocus
                  placeholder="搜索手机号 / 姓名"
                  className="h-9 w-full rounded-[6px] border border-ink-200 bg-white pr-2.5 pl-8 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-[3px] focus:ring-brand-500/12"
                />
              </form>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[13px] text-ink-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}