import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import { uploadToQiniu } from '@/lib/qiniu'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: '无法解析上传表单' }, { status: 400 })
  }

  const key = String(form.get('key') ?? '')
  const file = form.get('file')

  if (!key.startsWith('books/') || key.length > 512 || key.includes('..')) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '缺少文件字段 file' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await uploadToQiniu(key, buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[qiniu-upload]', msg)
    return NextResponse.json({ error: `上传至七牛失败: ${msg}` }, { status: 502 })
  }

  return NextResponse.json({ key })
}
