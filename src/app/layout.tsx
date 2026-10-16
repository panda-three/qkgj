import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: {
    default: '轻客管家 · 智能 CRM',
    template: '%s · 轻客管家',
  },
  description: '面向互联网教育机构的智能 CRM，以线索 → 商机 → 客户为主线',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 移动端表单输入 16px 以下会触发 iOS 自动放大
  maximumScale: 5,
  themeColor: '#3a63f0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 全局跳转提示，读屏器用户能感知页面变化 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[999] focus:rounded focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          跳到主要内容
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}