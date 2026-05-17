/**
 * 服务端 PDF 水印工具（上传时预加水印）
 */

import path from 'path'
import fs from 'fs/promises'
import { WATERMARK_TEXT } from './books'

export async function addWatermark(pdfBytes: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib')

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const pages = pdfDoc.getPages()

  // 尝试加载中文字体，失败时降级为纯 ASCII 水印
  let font
  let watermarkText = WATERMARK_TEXT
  try {
    const fontkit = (await import('@pdf-lib/fontkit')).default
    pdfDoc.registerFontkit(fontkit)
    const fontsDir = path.join(process.cwd(), 'public', 'fonts')
    const candidates = ['NotoSansSC-Bold.ttf', 'NotoSansSC-Bold.otf', 'NotoSansCJKsc-Bold.otf']
    let fontBytes: Buffer | null = null
    for (const name of candidates) {
      try {
        fontBytes = await fs.readFile(path.join(fontsDir, name))
        break
      } catch { /* 继续尝试下一个 */ }
    }
    if (!fontBytes) throw new Error('no font file found')
    const candidate = await pdfDoc.embedFont(fontBytes)
    // 验证字体能正确 layout 中文（TTC 文件伪装成 TTF 时此处会抛出）
    candidate.widthOfTextAtSize('日', 12)
    font = candidate
  } catch {
    console.warn('[pdf-watermark] 中文字体不可用，降级为 ASCII 水印')
    font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    watermarkText = 'rfyr.club'
  }

  for (const page of pages) {
    const { width, height } = page.getSize()
    const fontSize = Math.max(18, Math.min(36, width / 18))

    page.drawText(watermarkText, {
      x: width / 2 - (watermarkText.length * fontSize * 0.3),
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.22,
      rotate: degrees(45),
    })

    page.drawText('rfyr.club', {
      x: 16,
      y: 16,
      size: 10,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.4,
    })
  }

  return pdfDoc.save()
}
