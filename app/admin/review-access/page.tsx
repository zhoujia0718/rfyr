'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ChevronRight, Plus, Trash2, Loader2, Search, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface AccessRow {
  id: string
  user_id: string
  username: string
  email: string
  permission_type: string
  expires_at: string
  expired: boolean
}

interface UserResult {
  id: string
  username: string
  email: string
}

const TYPE_LABELS: Record<string, string> = {
  monthly: '月权限（30天）',
  quarterly: '季度权限（90天）',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function ReviewAccessPage() {
  const [rows, setRows] = React.useState<AccessRow[]>([])
  const [loading, setLoading] = React.useState(true)

  // 授权弹框
  const [grantOpen, setGrantOpen] = React.useState(false)
  const [searchQ, setSearchQ] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<UserResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [selectedUser, setSelectedUser] = React.useState<UserResult | null>(null)
  const [permType, setPermType] = React.useState<'monthly' | 'quarterly'>('monthly')
  const [granting, setGranting] = React.useState(false)

  // 撤销确认
  const [revokeUserId, setRevokeUserId] = React.useState<string | null>(null)

  const fetchRows = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/review-access', { credentials: 'include' })
      if (!res.ok) throw new Error('加载失败')
      setRows(await res.json())
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void fetchRows() }, [fetchRows])

  // 搜索用户（防抖 300ms）
  React.useEffect(() => {
    if (searchQ.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/review-access/search?q=${encodeURIComponent(searchQ)}`, { credentials: 'include' })
        setSearchResults(await res.json())
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [searchQ])

  const handleGrant = async () => {
    if (!selectedUser) return
    setGranting(true)
    try {
      const res = await fetch('/api/admin/review-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: selectedUser.id, permissionType: permType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '操作失败')
      toast.success(`已为 ${selectedUser.username} 开通 ${TYPE_LABELS[permType]}，到期：${formatDate(data.expiresAt)}`)
      setGrantOpen(false)
      setSearchQ('')
      setSearchResults([])
      setSelectedUser(null)
      void fetchRows()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGranting(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeUserId) return
    try {
      const res = await fetch(`/api/admin/review-access?userId=${revokeUserId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('撤销失败')
      toast.success('权限已撤销')
      setRows((prev) => prev.filter((r) => r.user_id !== revokeUserId))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRevokeUserId(null)
    }
  }

  const active = rows.filter((r) => !r.expired)
  const expired = rows.filter((r) => r.expired)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <nav className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">管理中心</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">复盘权限管理</span>
      </nav>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>每日复盘 · 严选逻辑 权限管理</CardTitle>
              <CardDescription className="mt-1">
                用户通过微信联系后，在此开通或撤销权限。支持月权限（30天）和季度权限（90天）。
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={fetchRows}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => { setGrantOpen(true); setSelectedUser(null); setSearchQ(''); setSearchResults([]) }}>
                <Plus className="mr-1 h-4 w-4" />
                开通权限
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* 有效权限 */}
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                有效权限 <span className="text-muted-foreground font-normal">({active.length})</span>
              </h3>
              {active.length === 0 ? (
                <p className="mb-6 text-sm text-muted-foreground">暂无有效权限</p>
              ) : (
                <div className="mb-8 overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-3">用户名</th>
                        <th className="px-4 py-3">邮箱</th>
                        <th className="px-4 py-3">权限类型</th>
                        <th className="px-4 py-3">到期时间</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-medium">{r.username}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.permission_type === 'quarterly'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {r.permission_type === 'quarterly' ? '季度' : '月'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.expires_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => {
                                  setSelectedUser({ id: r.user_id, username: r.username, email: r.email })
                                  setPermType('monthly')
                                  setGrantOpen(true)
                                  setSearchQ('')
                                  setSearchResults([])
                                }}
                              >
                                续期
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => setRevokeUserId(r.user_id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 已过期 */}
              {expired.length > 0 && (
                <>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    已过期 ({expired.length})
                  </h3>
                  <div className="overflow-x-auto rounded-lg border opacity-60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left text-xs text-muted-foreground">
                          <th className="px-4 py-3">用户名</th>
                          <th className="px-4 py-3">邮箱</th>
                          <th className="px-4 py-3">过期时间</th>
                          <th className="px-4 py-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expired.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="px-4 py-3">{r.username}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(r.expires_at)}</td>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => {
                                  setSelectedUser({ id: r.user_id, username: r.username, email: r.email })
                                  setPermType('monthly')
                                  setGrantOpen(true)
                                  setSearchQ('')
                                  setSearchResults([])
                                }}
                              >
                                续期
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 开通/续期弹框 */}
      <Dialog open={grantOpen} onOpenChange={(o) => { setGrantOpen(o); if (!o) setSelectedUser(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{selectedUser ? `续期 · ${selectedUser.username}` : '开通权限'}</DialogTitle>
          </DialogHeader>

          {!selectedUser && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="搜索用户名或邮箱…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  autoFocus
                />
              </div>
              {searching && <p className="text-xs text-muted-foreground">搜索中…</p>}
              {searchResults.length > 0 && (
                <div className="rounded-lg border divide-y max-h-52 overflow-y-auto">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedUser(u); setSearchQ('') }}
                    >
                      <span className="font-medium">{u.username}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchQ.length >= 2 && !searching && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground">未找到匹配用户</p>
              )}
            </div>
          )}

          {selectedUser && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
                <span className="font-medium">{selectedUser.username}</span>
                <span className="ml-2 text-muted-foreground">{selectedUser.email}</span>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">权限类型</p>
                <div className="flex gap-3">
                  {(['monthly', 'quarterly'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPermType(t)}
                      className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                        permType === t
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      {t === 'monthly' ? '月权限' : '季度权限'}
                      <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                        {t === 'monthly' ? '30 天' : '90 天'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>取消</Button>
            <Button onClick={handleGrant} disabled={!selectedUser || granting}>
              {granting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />开通中…</> : '确认开通'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 撤销确认 */}
      <Dialog open={!!revokeUserId} onOpenChange={(o) => { if (!o) setRevokeUserId(null) }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>确认撤销权限</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">撤销后用户立即失去访问权限，可随时重新开通。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeUserId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleRevoke}>确认撤销</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
