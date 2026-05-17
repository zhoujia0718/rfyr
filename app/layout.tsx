import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import { MembershipProvider } from '@/components/membership-provider'
import { AuthProvider } from '@/components/auth-context'
import { ReferralCapture } from '@/components/referral-capture'
import { ReadingProvider } from '@/contexts/reading-context'
import { ErrorBoundary } from '@/components/error-boundary'
import './globals.css'
import { Suspense } from 'react'

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  title: '日富一日 - 价值投机，看长做短',
  description: '日富一日 - 专业投资门户与知识库，助你见证复利的奇迹',
  generator: 'v0.app',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0056b3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={notoSansSC.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://ogctmgdomkktuynsiwmf.supabase.co" />
        <link rel="dns-prefetch" href="https://ogctmgdomkktuynsiwmf.supabase.co" />
        {/* 安全响应头 */}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        {/*
          React 19 的 validateProperty 对所有 on* 开头的事件处理器进行正则检测，
          与 Radix UI 的 onOpenChange prop 不兼容，导致 "Unknown event handler property" 警告。
          在 React 运行前 patch console.error 过滤掉这个已知警告。
        */}
        <script dangerouslySetInnerHTML={{ __html: `
(function() {
  var _origError = console.error.bind(console);
  console.error = function() {
    var msg = arguments[0] && typeof arguments[0] === 'string' ? arguments[0] : '';
    var arg1 = arguments[1] && typeof arguments[1] === 'string' ? arguments[1] : '';
    // 过滤 React 19 对 Radix UI onOpenChange 的误报警告
    if (msg.includes('Unknown event handler property') && arg1 === 'onOpenChange') {
      return;
    }
    _origError.apply(console, arguments);
  };
})();
        `}} />
      </head>
      <body className="font-sans antialiased">
        {/* ErrorBoundary 捕获子组件渲染期间的未处理错误 */}
        <ErrorBoundary>
          <Suspense fallback={null}>
            <AuthProvider>
              <MembershipProvider>
                <ReadingProvider>
                  <ReferralCapture>
                    {children}
                  </ReferralCapture>
                </ReadingProvider>
              </MembershipProvider>
            </AuthProvider>
          </Suspense>
        </ErrorBoundary>
      </body>
    </html>
  )
}
