/**
 * 阅读设置服务端专用工具函数
 *
 * 包含 revalidatePath 调用，仅可在服务端（API Route / Server Component）中使用。
 * 不得在任何客户端组件或 hook 中引用此文件。
 */

import { revalidatePath } from "next/cache"
import { clearServerSettingsCache } from "./reading-settings"

/**
 * 清除进程内内存缓存 + Next.js Data Cache
 * PUT 更新配置后调用，确保本实例立即失效，其他实例通过 Next.js Cache 最终一致
 */
export function clearSettingsCache(): void {
  // 立即清除本进程的 1 分钟内存缓存
  clearServerSettingsCache()
  // 清除 Next.js Data Cache（影响 CDN 和其他实例）
  revalidatePath("/api/reading-settings")
  revalidatePath("/", "layout")
}
