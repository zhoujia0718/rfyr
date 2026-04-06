import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { MembershipProvider } from '@/components/membership-provider'
import './globals.css'

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
});

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
    <html lang="zh-CN">
      <body className={`${notoSansSC.variable} font-sans antialiased`}>
        <MembershipProvider>
          {children}
        </MembershipProvider>
        <Analytics />
      </body>
    </html>
  )
}
