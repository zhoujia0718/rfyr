import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import * as qiniu from 'qiniu'

const ACCESS_KEY = process.env.QINIU_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.QINIU_SECRET_KEY ?? ''
const BUCKET     = process.env.QINIU_BUCKET ?? ''

// 七牛东南亚（新加坡）上传节点（按优先级排列）
const UPLOAD_URLS = [
  'https://up-as0.qiniup.com',
  'https://up-as0.qbox.me',
  'https://upload-as0.qiniup.com',
]

// POST /api/admin/qiniu-token  { key: "books/xxx.pdf" }
// 返回 { token, key, uploadUrls }，供客户端直传（含主备节点）
export async function POST(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  if (!ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    return NextResponse.json({ error: '七牛环境变量未配置' }, { status: 500 })
  }

  const { key } = await req.json().catch(() => ({}))
  if (!key || typeof key !== 'string' || key.length > 512) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }

  const mac = new qiniu.auth.digest.Mac(ACCESS_KEY, SECRET_KEY)
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: `${BUCKET}:${key}`,
    expires: 3600,
  })
  const token = putPolicy.uploadToken(mac)

  return NextResponse.json({ token, key, uploadUrls: UPLOAD_URLS })
}
