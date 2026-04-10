"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, KeyRound, Trash2, Copy, Loader2, Check, Gift, Crown, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface RedeemCode {
  id: string
  code: string
  type: "weekly" | "yearly"
  status: "unused" | "used" | "expired"
  source: string | null
  created_by: string | null
  expires_at: string
  created_at: string
  user_id: string | null
  used_at: string | null
}

export default function RedeemAdminPage() {
  const [codes, setCodes] = React.useState<RedeemCode[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  // 生成参数
  const [genType, setGenType] = React.useState<"weekly" | "yearly">("weekly")
  const [genCount, setGenCount] = React.useState(1)
  const [newCodes, setNewCodes] = React.useState<string[]>([])
  const [copied, setCopied] = React.useState(false)

  // 筛选参数
  const [filterStatus, setFilterStatus] = React.useState("all")
  const [filterType, setFilterType] = React.useState("all")
  const [page, setPage] = React.useState(1)
  const limit = 20

  const fetchCodes = React.useCallback(async (pg = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), page: String(pg) })
      if (filterStatus !== "all") params.set("status", filterStatus)
      if (filterType !== "all") params.set("type", filterType)

      const res = await fetch(`/api/admin/redeem?${params}`)
      const data = await res.json()
      if (data.ok) {
        setCodes(data.codes)
        setTotal(data.total)
      } else {
        toast.error(data.error || "加载失败")
      }
    } catch {
      toast.error("网络异常")
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, filterType])

  React.useEffect(() => {
    void fetchCodes()
  }, [fetchCodes])

  const handleGenerate = async () => {
    setGenerating(true)
    setNewCodes([])
    try {
      const res = await fetch("/api/admin/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: genType, count: genCount }),
      })
      const data = await res.json()
      if (data.ok) {
        setNewCodes(data.codes)
        toast.success(`生成成功，共 ${data.codes.length} 个`)
        void fetchCodes()
      } else {
        toast.error(data.error || "生成失败")
      }
    } catch {
      toast.error("网络异常")
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该兑换码？")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/redeem?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.ok) {
        setCodes(prev => prev.filter(c => c.id !== id))
        setTotal(prev => prev - 1)
        toast.success("已删除")
      } else {
        toast.error(data.error || "删除失败")
      }
    } catch {
      toast.error("网络异常")
    } finally {
      setDeleting(null)
    }
  }

  const copyNewCodes = () => {
    navigator.clipboard.writeText(newCodes.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success("已复制")
  }

  const statusBadge = (status: string) => {
    if (status === "used") return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        已使用
      </span>
    )
    if (status === "expired") return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        已过期
      </span>
    )
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        待使用
      </span>
    )
  }

  const typeLabel = (type: string) => (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${type === "yearly" ? "text-amber-700" : "text-blue-700"}`}>
      {type === "yearly" ? <Crown className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
      {type === "yearly" ? "年卡" : "周卡"}
    </span>
  )

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 text-primary hover:text-primary/80">
            <ArrowLeft className="h-5 w-5" />
            返回管理中心
          </Link>
          <h1 className="text-lg font-semibold">兑换码管理</h1>
          <div />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 生成兑换码 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              生成兑换码
            </CardTitle>
            <CardDescription>生成后 3 天内必须使用，过期自动作废</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>会员类型</Label>
                <div className="flex gap-2">
                  <Button
                    variant={genType === "weekly" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGenType("weekly")}
                  >
                    <Gift className="h-4 w-4 mr-1.5" />
                    周卡（7天）
                  </Button>
                  <Button
                    variant={genType === "yearly" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGenType("yearly")}
                  >
                    <Crown className="h-4 w-4 mr-1.5" />
                    年卡（365天）
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 w-32">
                <Label htmlFor="genCount">数量</Label>
                <Input
                  id="genCount"
                  type="number"
                  min={1}
                  max={50}
                  value={genCount}
                  onChange={e => setGenCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>

              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                {generating ? "生成中..." : "生成"}
              </Button>
            </div>

            {/* 新生成的兑换码展示 */}
            {newCodes.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    新生成的 {newCodes.length} 个兑换码
                  </span>
                  <Button size="sm" variant="ghost" onClick={copyNewCodes} className="h-7 text-xs">
                    {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copied ? "已复制" : "复制全部"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {newCodes.map(code => (
                    <span
                      key={code}
                      className="inline-block px-3 py-1.5 rounded-md bg-white border border-blue-200 text-sm font-mono font-semibold text-blue-800 cursor-pointer hover:bg-blue-100"
                      onClick={() => copyCode(code)}
                      title="点击复制"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 兑换码列表 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>兑换码列表</CardTitle>
                <CardDescription>共 {total} 个</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={filterStatus}
                  onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
                >
                  <option value="all">全部状态</option>
                  <option value="unused">待使用</option>
                  <option value="used">已使用</option>
                  <option value="expired">已过期</option>
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={filterType}
                  onChange={e => { setFilterType(e.target.value); setPage(1) }}
                >
                  <option value="all">全部类型</option>
                  <option value="weekly">周卡</option>
                  <option value="yearly">年卡</option>
                </select>
                <Button size="sm" variant="outline" onClick={() => void fetchCodes(1)}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  刷新
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : codes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">暂无兑换码</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">兑换码</th>
                        <th className="pb-3 font-medium">类型</th>
                        <th className="pb-3 font-medium">状态</th>
                        <th className="pb-3 font-medium">有效期至</th>
                        <th className="pb-3 font-medium">生成时间</th>
                        <th className="pb-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {codes.map(code => (
                        <tr key={code.id} className="hover:bg-gray-50">
                          <td className="py-3 font-mono font-semibold text-sm">{code.code}</td>
                          <td className="py-3">{typeLabel(code.type)}</td>
                          <td className="py-3">{statusBadge(code.status)}</td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(code.expires_at).toLocaleDateString("zh-CN")}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(code.created_at).toLocaleDateString("zh-CN")}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => copyCode(code.code)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              {code.status === "unused" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-red-600 hover:text-red-700"
                                  disabled={deleting === code.id}
                                  onClick={() => handleDelete(code.id)}
                                >
                                  {deleting === code.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 分页 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      上一页
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      第 {page} / {totalPages} 页，共 {total} 个
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
