'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import type { SessionPayload } from '@/lib/auth/session';

/**
 * 应用布局容器
 *
 * 响应式策略：
 * · <768px：侧栏收起为抽屉，主区全宽，通过汉堡按钮唤起
 * · ≥768px：侧栏固定 232px，主区自动让出空间
 * 主区用 margin-left 而非 flex，是为了让顶栏的 sticky 与滚动容器独立。
 */
export function AppShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-[100dvh]">
      <Sidebar session={session} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-h-[100dvh] flex-col md:pl-[232px]">
        <Topbar session={session} onMenuClick={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-3 pt-4 pb-8 sm:px-5 md:pt-5">
          {children}
        </main>
      </div>
    </div>
  );
}