import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';
export const TIME_FORMAT = 'HH:mm';

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '--';
  return dayjs(v).format(DATE_FORMAT);
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return '--';
  return dayjs(v).format(DATETIME_FORMAT);
}

/**
 * 相对时间：3分钟前 / 2小时前 / 昨天 14:30
 * 原型 app.js 中的 fmtDateTime 是空实现（直接 return s），此处补齐。
 */
export function fromNow(v: string | Date | null | undefined): string {
  if (!v) return '--';
  const target = dayjs(v);
  const diffMin = dayjs().diff(target, 'minute');
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = dayjs().diff(target, 'hour');
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = dayjs().diff(target, 'day');
  if (diffDay === 1) return `昨天 ${target.format(TIME_FORMAT)}`;
  if (diffDay < 7) return `${diffDay}天前`;
  return target.format(DATETIME_FORMAT);
}

/** 金额：12800 → ¥12,800 */
export function formatAmount(v: number | null | undefined, withSymbol = true): string {
  if (v === null || v === undefined) return '--';
  const s = v.toLocaleString('zh-CN');
  return withSymbol ? `¥${s}` : s;
}

/** 金额简写：1280000 → 128.0万 */
export function formatAmountShort(v: number | null | undefined): string {
  if (v === null || v === undefined) return '--';
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return v.toLocaleString('zh-CN');
}

/**
 * 转化率：分母为 0 时返回 '--' 而非 0，避免误导（PRD BR-D03）
 */
export function formatRate(numerator: number, denominator: number, digits = 1): string {
  if (denominator === 0) return '--';
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

/** 手机号脱敏：13812345678 → 138****5678 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '--';
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 姓名脱敏（导出场景）：张三 → 张*；欧阳明月 → 欧*** */
export function maskName(name: string | null | undefined): string {
  if (!name) return '--';
  if (name.length === 1) return name;
  return `${name[0]}${'*'.repeat(name.length - 1)}`;
}

/** 剩余天数：已过期返回负数 */
export function daysRemaining(expireDate: string | Date | null | undefined): number | null {
  if (!expireDate) return null;
  return dayjs(expireDate).startOf('day').diff(dayjs().startOf('day'), 'day');
}

/** 停留天数（向上取整） */
export function daysSince(v: string | Date | null | undefined): number {
  if (!v) return 0;
  return dayjs().diff(dayjs(v), 'day');
}