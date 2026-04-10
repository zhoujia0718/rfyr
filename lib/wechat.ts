/**
 * 微信 API 工具函数
 * 文档：https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html
 */

const APP_ID = process.env.WE_COM_APP_ID || ""
const APP_SECRET = process.env.WE_COM_APP_SECRET || ""
const TOKEN = process.env.WE_COM_TOKEN || "rfyr_wechat_token"
const BASE_URL = "https://api.weixin.qq.com"

// ─── Access Token ────────────────────────────────────────────────────────────

interface AccessTokenResult {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

/** 获取或缓存 access_token（有效期 2 小时） */
let _cachedToken: { token: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (_cachedToken && now < _cachedToken.expiresAt) {
    return _cachedToken.token
  }

  const url = `${BASE_URL}/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`
  const res = await fetch(url, { cache: "no-store" })
  const data: AccessTokenResult = await res.json()

  if (!data.access_token) {
    throw new Error(`获取access_token失败: ${data.errcode} ${data.errmsg}`)
  }

  // 提前 5 分钟过期
  _cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in! - 300) * 1000,
  }

  return data.access_token
}

// ─── 创建二维码（获取 ticket）────────────────────────────────────────────────

interface QRTicketResult {
  ticket?: string
  expire_seconds?: number
  url?: string
  errcode?: number
  errmsg?: string
}

/**
 * 创建临时二维码（字符串 scene）
 * @param sceneStr 场景字符串，最大 32 位
 * @param expireSeconds 有效期，默认 300 秒（5分钟）
 */
export async function createQRCode(
  sceneStr: string,
  expireSeconds = 300
): Promise<string> {
  const token = await getAccessToken()
  const url = `${BASE_URL}/cgi-bin/qrcode/create?access_token=${token}`

  const body = {
    expire_seconds: expireSeconds,
    action_info: { scene: { scene_str: sceneStr } },
    action_name: "QR_STR_SCENE",
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data: QRTicketResult = await res.json()

  if (!data.ticket) {
    throw new Error(`创建二维码失败: ${data.errcode} ${data.errmsg}`)
  }

  return data.ticket
}

/**
 * 创建永久二维码（字符串 scene，用于登录场景）
 * @param sceneStr 场景字符串，永久二维码最大 64 位
 */
export async function createPermanentQRCode(sceneStr: string): Promise<string> {
  const token = await getAccessToken()
  const url = `${BASE_URL}/cgi-bin/qrcode/create?access_token=${token}`

  const body = {
    action_info: { scene: { scene_str: sceneStr } },
    action_name: "QR_LIMIT_STR_SCENE",
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data: QRTicketResult = await res.json()

  if (!data.ticket) {
    throw new Error(`创建永久二维码失败: ${data.errcode} ${data.errmsg}`)
  }

  return data.ticket
}

/** ticket → 二维码图片 URL（微信官方生成接口） */
export function getQRCodeImageUrl(ticket: string): string {
  return `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`
}

// ─── 发送客服消息（文本）────────────────────────────────────────────────────

interface SendMessageResult {
  errcode?: number
  errmsg?: string
}

/**
 * 发送文本客服消息给用户
 * @param openid 用户的 openid
 * @param content 消息内容
 */
export async function sendTextMessage(
  openid: string,
  content: string
): Promise<void> {
  const token = await getAccessToken()
  const url = `${BASE_URL}/cgi-bin/message/custom/send?access_token=${token}`

  const body = {
    touser: openid,
    msgtype: "text",
    text: { content },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data: SendMessageResult = await res.json()

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`发送消息失败: ${data.errcode} ${data.errmsg}`)
  }
}

// ─── 获取用户信息（通过 code 获取 openid）────────────────────────────────────

interface OpenIdResult {
  errcode?: number
  errmsg?: string
  openid?: string
  session_key?: string
  unionid?: string
}

/**
 * 通过授权 code 获取 openid（适用于微信内部访问 wx.login() 的场景）
 * 这里不需要，因为我们是公众号菜单点击事件推送，直接有 openid
 */

// ─── 生成 6 位验证码 ─────────────────────────────────────────────────────────

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// ─── 微信服务器签名验证 ─────────────────────────────────────────────────────

import crypto from "crypto"

export function verifySignature(
  signature: string,
  timestamp: string,
  nonce: string
): boolean {
  const arr = [TOKEN, timestamp, nonce].sort()
  const str = arr.join("")
  const sha1 = crypto.createHash("sha1").update(str).digest("hex")
  return sha1 === signature
}

export function generateNonce(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ─── XML 解析（从微信推送消息中提取字段）────────────────────────────────────

export function parseXmlMessage(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pairs = xml.match(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g) || []
  for (const pair of pairs) {
    const match1 = pair.match(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/)
    if (match1) {
      result[match1[1]] = match1[2]
      continue
    }
    const match2 = pair.match(/<(\w+)>(.*?)<\/\1>/)
    if (match2) {
      result[match2[1]] = match2[2]
    }
  }
  return result
}

// ─── 构建 XML 回复（用于被动响应微信服务器）─────────────────────────────────

export function buildTextReply(toUser: string, fromUser: string, content: string): string {
  return `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`
}

export function buildEmptyReply(): string {
  return "success"
}
