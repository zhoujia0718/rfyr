import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import { MembershipProvider } from '@/components/membership-provider'
import { ReferralCapture } from '@/components/referral-capture'
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
        <link rel="dns-prefetch" href="https://ogctmgdomkktuynsiwmf.supabase.co" />
      </head>
      <body className="font-sans antialiased">
        <Suspense fallback={null}>
          <MembershipProvider>
            <ReferralCapture>
              {children}
            </ReferralCapture>
          </MembershipProvider>
        </Suspense>
      </body>
    </html>
  )
}
