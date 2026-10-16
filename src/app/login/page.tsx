'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const DEMO_ACCOUNTS = [
  { employeeNo: 'A0001', name: '张启明', role: '超级管理员', desc: '全部数据可见', tone: 'a' },
  { employeeNo: 'A0002', name: '李文静', role: '销售主管', desc: '本部门及下属数据', tone: 'b' },
  { employeeNo: 'A0003', name: '王小雨', role: '销售顾问', desc: '仅本人 + 公海', tone: 'c' },
] as const;

const AVATAR_GRADIENT: Record<string, string> = {
  a: 'from-[#6366f1] to-[#8b5cf6]',
  b: 'from-[#06b6d4] to-[#3b82f6]',
  c: 'from-[#10b981] to-[#14b8a6]',
};

export default function LoginPage() {
  const router = useRouter();
  const [employeeNo, setEmployeeNo] = useState('A0001');
  const [password, setPassword] = useState('Qingke@2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNo, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? '登录失败');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* 左侧品牌区，980px 以下隐藏 */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2b50c8] to-[#3a63f0] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-white/5" />

        <div className="relative flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-white">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-white">轻客管家</div>
            <div className="text-[10px] tracking-[0.2em] text-white/60">QINGKE CRM</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="mb-4 text-4xl leading-tight font-semibold text-white">
            让每一条线索
            <br />
            都跑完转化闭环
          </h1>
          <p className="mb-10 max-w-md text-sm leading-relaxed text-white/70">
            面向互联网教育机构的智能 CRM。以「线索 → 商机 → 客户」为主线，
            覆盖公海池、部门权限体系与课程资源管理，用漏斗数据驱动转化决策。
          </p>

          <div className="space-y-4">
            {[
              [Shield, '公海池领取释放留痕', '领取与释放全程记录归属轨迹'],
              [Sparkles, '部门树 + 归属人双维度隔离', 'SQL 层拼接数据权限，越权访问零发生'],
              [TrendingUp, '五级转化漏斗', '实时掌握从线索到成交的转化效率'],
            ].map(([Icon, title, desc]) => {
              const I = Icon as typeof Shield;
              return (
                <div key={title as string} className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                    <I size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{title as string}</div>
                    <div className="mt-0.5 text-xs text-white/60">{desc as string}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex gap-8">
          {[
            ['30%', '线索转商机率'],
            ['95%', '首次跟进及时率'],
            ['25%', '商机赢单率'],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="tabular text-2xl font-semibold text-white">{v}</div>
              <div className="mt-0.5 text-xs text-white/60">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          <h2 className="mb-1 text-2xl font-semibold text-ink-900">欢迎回来</h2>
          <p className="mb-7 text-sm text-ink-500">选择一个角色体验不同权限视角</p>

          {/* 角色选择卡片 */}
          <div className="mb-6 grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.employeeNo}
                type="button"
                onClick={() => {
                  setEmployeeNo(a.employeeNo);
                  setError('');
                }}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  employeeNo === a.employeeNo
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-ink-200 bg-white hover:border-ink-300',
                )}
              >
                <div
                  className={cn(
                    'mb-2 flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white',
                    AVATAR_GRADIENT[a.tone],
                  )}
                >
                  {a.name[0]}
                </div>
                <div className="text-[13px] font-medium text-ink-900">{a.role}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-ink-500">{a.desc}</div>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="employeeNo" className="text-[13px] font-medium text-ink-700">
                工号 / 手机号
              </label>
              <input
                id="employeeNo"
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
                className="h-[34px] w-full rounded-[6px] border border-ink-200 bg-white px-3 text-[13px] text-ink-800 outline-none transition-shadow placeholder:text-ink-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/12"
                placeholder="请输入工号"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[13px] font-medium text-ink-700">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-[34px] w-full rounded-[6px] border border-ink-200 bg-white px-3 text-[13px] text-ink-800 outline-none transition-shadow placeholder:text-ink-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/12"
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-[34px] w-full rounded-[6px] bg-brand-500 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(58,99,240,0.3)] transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? '登录中…' : '登录'}
            </button>
          </form>

          <div className="mt-6 rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-700">
            演示账号统一密码：<span className="font-medium">Qingke@2026</span>
            <br />
            数据为本地演示数据，可在prisma/seed.ts 中重新生成。
          </div>
        </div>
      </div>
    </div>
  );
}