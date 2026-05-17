"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function CreateMembershipPage() {
  const router = useRouter()
  const [formData, setFormData] = React.useState({
    userId: "",
    userNickname: "",
    membershipType: "",
    duration: "",
  })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [success, setSuccess] = React.useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: formData.userId.trim(),
          membershipType: formData.membershipType,
          duration: formData.duration ? parseInt(formData.duration, 10) : undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "开通失败")
        return
      }

      setSuccess(true)
      setTimeout(() => router.push("/admin"), 1500)
    } catch {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center">
          <Link href="/admin" className="flex items-center gap-2 text-primary hover:text-primary/80">
            <ArrowLeft className="h-5 w-5" />
            <span>返回管理中心</span>
          </Link>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>手动开通会员</CardTitle>
            <CardDescription>为用户手动开通会员权限</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="text-center py-8">
                <div className="text-green-600 text-lg font-semibold mb-2">会员开通成功！</div>
                <div className="text-gray-500 text-sm">即将跳转至管理后台…</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="userId">用户ID</Label>
                <Input
                  id="userId"
                  name="userId"
                  value={formData.userId}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="userNickname">用户昵称 <span className="text-gray-400 font-normal text-xs">(选填，仅供参考)</span></Label>
                <Input
                  id="userNickname"
                  name="userNickname"
                  value={formData.userNickname}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="membershipType">会员类型</Label>
                <Select
                  name="membershipType"
                  value={formData.membershipType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, membershipType: value }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择会员类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">月卡会员</SelectItem>
                    <SelectItem value="yearly">年度VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">有效期（天）<span className="text-gray-400 font-normal text-xs ml-1">（留空按默认天数：月卡30天/年度365天）</span></Label>
                <Input
                  id="duration"
                  name="duration"
                  type="number"
                  placeholder="留空使用默认值"
                  value={formData.duration}
                  onChange={handleChange}
                  min="1"
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "开通中…" : "开通会员"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => router.push("/admin")} disabled={loading}>
                  取消
                </Button>
              </div>
            </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}