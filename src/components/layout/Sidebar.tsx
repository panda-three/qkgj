'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Globe,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ROLE_META, type RoleKey } from '@/lib/constants';
import type { SessionPayload } from '@/lib/auth/session';

type MenuItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

const MENU: { group: string; items: MenuItem[] }[] = [
  {
    group: '业务主链路',
    items: [
      { key: 'dashboard', label: '数据看板', href: '/dashboard', icon: LayoutDashboard },
      { key: 'leads', label: '线索管理', href: '/leads', icon: TrendingUp },
      { key: 'opportunity', label: '商机管理', href: '/opportunities', icon: Target },
      { key: 'customer', label: '客户管理', href: '/customers', icon: Users },
      { key: 'pool', label: '公海池', href: '/pool', icon: Globe },
    ],
  },
  {
    group: '资源与配置',
    items: [
      { key: 'resource', label: '资源管理', href: '/resources', icon: GraduationCap },
      { key: 'system', label: '系统管理', href: '/system', icon: Settings },
    ],
  },
];

/** 销售顾问不可访问系统管理（PRD 2.2） */
function visibleMenu(role: string) {
  return MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.key === 'system' ? role !== 'SALES' : true)),
  }));
}

/** 当前路由是否命中该菜单项 */
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // /leads/xxx 也算在 /leads 命中
  return pathname.startsWith(`${href}/`);
}

export function Sidebar({
  session,
  open,
  onClose,
}: {
  session: SessionPayload;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleMenu(session.role);
  const role = session.role as RoleKey;
  const meta = ROLE_META[role];

  // 路由切换后自动关闭移动端抽屉
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 移动端抽屉打开时锁定背景滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* 移动端遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-[380] bg-ink-900/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[390] flex w-[232px] flex-col overflow-hidden text-ink-300',
          // 移动端默认滑出屏幕，点击汉堡按钮滑入
          'transition-transform duration-260 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        )}
        style={{ background: 'var(--color-sidebar-bg)' }}
        aria-label="主导航"
      >
        {/* 品牌区 */}
        <div className="flex h-[56px] shrink-0 items-center gap-2.5 border-b px-[18px] md:h-[60px]" style={{ borderColor: 'var(--color-sidebar-border)' }}>
          <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-[0_2px_8px_rgba(58,99,240,0.4)]">
              <TrendingUp size={17} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold tracking-[0.5px] text-white">
                轻客管家
              </span>
              <span className="truncate text-[10px] tracking-[0.15em] text-ink-500 uppercase">
                Qingke CRM
              </span>
            </span>
          </Link>
          {/* 移动端关闭按钮 */}
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-ink-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white md:hidden"
            aria-label="关闭导航菜单"
          >
            <X size={17} />
          </button>
        </div>

        {/* 导航 */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-2.5 pt-2.5 pb-3">
          {groups.map((g) => (
            <div key={g.group} className="mb-1">
              <div className="px-2.5 pt-3 pb-1.5 text-[11px] font-medium tracking-wider whitespace-nowrap text-ink-500">
                {g.group}
              </div>
              {g.items.map((item) => (
                <NavItem key={item.key} item={item} active={isActive(pathname, item.href)} />
              ))}
            </div>
          ))}
        </nav>

        {/* 底部：当前角色与数据范围说明 */}
        <div
          className="shrink-0 border-t px-[18px] py-3"
          style={{ borderColor: 'var(--color-sidebar-border)' }}
        >
          <div className="text-[11px] leading-relaxed text-ink-500">
            <span className="block font-medium text-ink-400">{meta.name}</span>
            {role === 'SUPER_ADMIN' && '可见全系统数据'}
            {role === 'SALES_MANAGER' && '可见本部门及下属数据'}
            {role === 'SALES' && '仅本人与公海数据'}
          </div>
        </div>
      </aside>
    </>
  );
}

function NavItem({ item, active }: { item: MenuItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative mb-0.5 flex h-[38px] items-center gap-2.5 rounded-[6px] px-2.5 text-[13.5px] whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
        active
          ? 'bg-brand-500/15 font-medium text-white'
          : 'text-ink-300 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {/* 当前页左侧指示条 */}
      {active && (
        <span
          className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400"
          aria-hidden
        />
      )}
      <span className="flex w-[18px] shrink-0 items-center justify-center">
        <Icon size={17} aria-hidden />
      </span>
      <span className="flex-1 overflow-hidden text-ellipsis">{item.label}</span>
    </Link>
  );
}