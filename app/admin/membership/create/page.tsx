"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function CreateMembershipPage() {
  const [formData, setFormData] = React.useState({
    userId: "",
    userNickname: "",
    membershipType: "",
    duration: "7"
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void formData
    alert('会员开通成功')
    window.location.href = '/admin'
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
            <form onSubmit={handleSubmit} className="space-y-6">
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
                <Label htmlFor="userNickname">用户昵称</Label>
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
                    <SelectItem value="weekly">周卡会员</SelectItem>
                    <SelectItem value="yearly">年度VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">有效期（天）</Label>
                <Input
                  id="duration"
                  name="duration"
                  type="number"
                  value={formData.duration}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  开通会员
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => window.location.href = '/admin'}>
                  取消
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}