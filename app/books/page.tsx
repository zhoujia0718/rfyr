import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { BooksClient } from './BooksClient'
import type { BookPublic } from '@/lib/books'
import { supabase } from '@/lib/supabase'

export const revalidate = 60

async function getBooks(): Promise<BookPublic[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, description, cover_url, access_level, sort_order, published, created_at, updated_at')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[books page] fetch error:', error)
    return []
  }
  return (data ?? []) as BookPublic[]
}

export default async function BooksPage() {
  const books = await getBooks()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              📚 股票书籍
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              精选投资经典 · 月卡/年卡会员免密下载 · 普通用户凭密码下载
            </p>
          </div>
        </section>

        {/* 书籍列表 */}
        <section className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
          <BooksClient books={books} />
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
