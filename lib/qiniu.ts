/**
 * 七牛云存储工具（书籍 PDF 私有存储）
 *
 * 上传：书籍 PDF 在服务端加水印后存入七牛私有桶
 * 下载：生成带时效签名的私有下载 URL，通过 API 代理给前端
 *
 * 不需要公开域名——所有访问都在服务端完成。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as qiniu from 'qiniu'

const ACCESS_KEY = process.env.QINIU_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.QINIU_SECRET_KEY ?? ''
const BUCKET     = process.env.QINIU_BUCKET ?? ''
// domain 需带协议头，如 http://tenv7z566.hn-bkt.clouddn.com
const DOMAIN     = process.env.QINIU_DOMAIN ?? ''

function makeMac() {
  return new qiniu.auth.digest.Mac(ACCESS_KEY, SECRET_KEY)
}

function makeConfig() {
  return new qiniu.conf.Config({ zone: qiniu.zone.Zone_as0, useHttpsDomain: true })
}

// SDK 内置的 HTTP 客户端在某些网络环境下 TLS 握手会被中断；
// 改用 Node.js 18+ 内置 fetch（undici 实现）绕过该问题，
// token 生成仍用 SDK（纯本地计算，不涉及网络）。
const UPLOAD_HOSTS = [
  'https://up-as0.qiniup.com',
  'https://up-as0.qbox.me',
]

/** 上传 Buffer 到七牛私有桶，key 形如 books/xxx.pdf */
export async function uploadToQiniu(key: string, buffer: Buffer): Promise<void> {
  if (!ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    throw new Error('QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_BUCKET 未配置')
  }

  const mac = makeMac()
  const putPolicy = new qiniu.rs.PutPolicy({ scope: `${BUCKET}:${key}` })
  const token = putPolicy.uploadToken(mac)

  const filename = key.split('/').pop() ?? 'file.pdf'

  let lastErr: Error | null = null
  for (const host of UPLOAD_HOSTS) {
    try {
      const form = new FormData()
      form.append('token', token)
      form.append('key', key)
      form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename)

      const res = await fetch(host, { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`)
      }
      return
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('上传失败')
}

/**
 * 生成私有桶的带签名下载 URL（服务端使用，expireSeconds 默认 10 分钟）
 * domain 环境变量须带 http:// 或 https://
 */
export function getQiniuPrivateUrl(key: string, expireSeconds = 600): string {
  if (!ACCESS_KEY || !SECRET_KEY || !DOMAIN) {
    throw new Error('QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_DOMAIN 未配置')
  }
  const mac = makeMac()
  const bucketManager = new qiniu.rs.BucketManager(mac, makeConfig())
  const deadline = Math.floor(Date.now() / 1000) + expireSeconds
  return bucketManager.privateDownloadUrl(DOMAIN, key, deadline)
}

/** 从七牛私有桶删除文件（书籍删除时调用，失败不影响主流程） */
export async function deleteFromQiniu(key: string): Promise<void> {
  if (!ACCESS_KEY || !SECRET_KEY || !BUCKET) return

  const mac = makeMac()
  const bucketManager = new qiniu.rs.BucketManager(mac, makeConfig())

  const result = await bucketManager.delete(BUCKET, key) as any
  const statusCode: number = result?.resp?.statusCode ?? 0
  // 612 = resource not found，视为成功
  if (statusCode !== 200 && statusCode !== 612) {
    console.warn(`[qiniu] 删除失败 key=${key} status=${statusCode}`)
  }
}
