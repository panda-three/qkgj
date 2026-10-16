'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { maskPhone } from '@/lib/utils/format';

/**
 * 手机号脱敏显示
 *
 * PRD 隐私要求（这是硬性合规项，不是可选项）：
 * · 列表页服务端已裁剪为 138****5678，完整号码不下发到浏览器
 * · 查看完整号码必须单独调接口，且写操作日志留痕
 * · 日志记录「谁在什么时候查看了哪个客户的完整手机号」
 *
 * 无障碍：
 * · 未展开时用 aria-label 告知这是脱敏号码
 * · 展开状态通过 aria-pressed 表达
 */
export function PhoneCell({
  phone,
  bizId,
  bizType = 'LEAD',
}: {
  phone: string;
  bizId: string;
  bizType?: 'LEAD' | 'OPPORTUNITY' | 'CUSTOMER';
}) {
  const toast = useToast();
  const [revealed, setRevealed] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleReveal() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/phone/reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bizType, bizId }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error('查看失败', json.message ?? '无法获取完整手机号');
          return;
        }
        setFull(json.data.phone);
        setRevealed(true);
      } catch {
        toast.error('网络异常', '请稍后重试');
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="tabular text-ink-700"
        aria-label={revealed ? `完整手机号 ${full}` : `脱敏手机号 ${maskPhone(phone)}`}
      >
        {revealed ? full ?? maskPhone(phone) : maskPhone(phone)}
      </span>
      <button
        type="button"
        onClick={handleReveal}
        disabled={pending}
        className="flex size-5 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:opacity-50"
        aria-label={revealed ? '隐藏完整手机号' : '查看完整手机号'}
        aria-pressed={revealed}
        title="查看完整号码将记录操作日志"
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : revealed ? (
          <EyeOff size={12} />
        ) : (
          <Eye size={12} />
        )}
      </button>
    </span>
  );
}