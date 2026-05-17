# 内容管理系统重构 - 待完成任务

本文档记录内容管理系统重构中尚未完成的任务。

---

## P1: 图片粘贴逻辑策略模式重构

### 状态：待完成

### 目标
将 `components/admin/RichEditor.tsx` 中的 handlePaste 函数重构为策略模式，提高代码可维护性和可测试性。

### 当前问题
- handlePaste 函数超过 200 行
- 4 个主要分支嵌套过深
- 难以测试单个粘贴场景
- 代码重复

### 建议实现

```typescript
// paste-strategies.ts

import type { EditorView } from '@tiptap/pm/view'

/**
 * 粘贴策略接口
 */
export interface PasteStrategy {
  /** 优先级（数字越大越先检查） */
  priority: number
  /** 判断是否能处理此粘贴事件 */
  canHandle(event: ClipboardEvent, html: string): boolean
  /** 处理粘贴事件 */
  handle(view: EditorView, event: ClipboardEvent): Promise<boolean>
}

/**
 * 粘贴策略注册表
 */
export class PasteStrategyRegistry {
  private strategies: PasteStrategy[] = []

  register(strategy: PasteStrategy): void {
    this.strategies.push(strategy)
    this.strategies.sort((a, b) => b.priority - a.priority)
  }

  async handlePaste(view: EditorView, event: ClipboardEvent): Promise<boolean> {
    const html = event.clipboardData?.getData('text/html') || ''
    
    for (const strategy of this.strategies) {
      if (strategy.canHandle(event, html)) {
        return await strategy.handle(view, event)
      }
    }
    
    return false // 交给默认处理
  }
}

// 使用
export const pasteRegistry = new PasteStrategyRegistry()
pasteRegistry.register(new YuqueLarkPasteStrategy())
pasteRegistry.register(new BlobImagePasteStrategy())
pasteRegistry.register(new WordPasteStrategy())
```

### 实施步骤
1. 创建 `paste-strategies.ts` 文件
2. 实现各个策略类
3. 在 RichEditor 中使用注册表
4. 逐步迁移现有逻辑
5. 添加单元测试

---

## P2: HTML 配图事务化处理

### 状态：待完成

### 目标
为 HTML 配图上传实现可靠的事务机制，确保 HTML 和配图的一致性。

### 当前问题
- 上传配图 → 下载 HTML → 修改 → 上传 HTML 的流程中可能失败
- 失败后状态不一致
- 缺少重试和回滚机制

### 建议实现

#### 方案 A: 两阶段提交（推荐）

```typescript
// html-upload-transaction.ts

export interface HtmlUploadTransaction {
  htmlUrl: string
  companionUrls: string[]
}

export async function uploadHtmlWithCompanions(
  htmlFile: File,
  companionFiles: File[]
): Promise<HtmlUploadTransaction> {
  const tempDir = `temp_${Date.now()}`
  
  try {
    // 阶段 1: 上传所有文件到临时目录
    const htmlUrl = await uploadToTemp(htmlFile, tempDir)
    const companionResults = await Promise.allSettled(
      companionFiles.map(f => uploadToTemp(f, tempDir))
    )
    
    // 检查是否有失败
    const failed = companionResults.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      console.warn(`${failed.length} 个配图上传失败`)
    }
    
    // 阶段 2: 原子移动到正式目录
    // 如果失败，清理临时目录
    const finalDir = await moveToFinal(tempDir)
    
    return {
      htmlUrl: finalDir.htmlUrl,
      companionUrls: finalDir.companionUrls
    }
    
  } catch (error) {
    // 回滚：删除临时目录
    await cleanupTemp(tempDir)
    throw error
  }
}
```

#### 方案 B: Supabase RPC 事务

```sql
-- 创建 RPC 函数
CREATE OR REPLACE FUNCTION upload_html_atomic(
  html_content TEXT,
  companion_files JSONB,
  bucket_name TEXT
) RETURNS JSON AS $$
DECLARE
  html_path TEXT;
  result JSON;
BEGIN
  -- 创建临时目录
  html_path := 'temp_' || extract(epoch from now()) || '/index.html';
  
  -- 上传 HTML
  PERFORM supabase_storage.upload_file(
    bucket_name,
    html_path,
    html_content::bytea,
    'text/html; charset=utf-8'
  );
  
  -- 上传配图
  FOR item IN SELECT * FROM jsonb_array_elements(companion_files)
  LOOP
    PERFORM supabase_storage.upload_file(
      bucket_name,
      'temp_' || item->>'name',
      (item->>'content')::bytea,
      item->>'contentType'
    );
  END LOOP;
  
  -- 返回结果
  RETURN json_build_object(
    'htmlPath', html_path,
    'success', true
  );
END;
$$ LANGUAGE plpgsql;
```

### 实施步骤
1. 评估现有上传流程
2. 选择方案（A 或 B）
3. 实现事务逻辑
4. 添加错误处理和回滚
5. 添加监控和告警
6. 编写集成测试

---

## 已完成的重构

### ✅ P3: 分类匹配共享模块
- 创建 `lib/category-utils.ts`
- 提取 `isInCategoryTree`, `buildCategoryMaps` 等函数
- 更新 `lib/articles.ts` 使用共享模块

### ✅ P4: localStorage 安全存储
- 创建 `lib/storage-utils.ts`
- 使用 articleId 作为 key
- 添加数据迁移逻辑

### ✅ P5: 统一 API 响应类型
- 创建 `lib/api-types.ts`
- 定义 ArticleSuccessResponse, ArticleErrorResponse 等类型
- 提供类型守卫函数

### ✅ P6: 会员检查共享模块
- 创建 `lib/membership-utils.ts`
- 统一会员状态查询
- 支持缓存

### ✅ P7: 统一错误处理
- 创建 `lib/errors.ts`
- 定义 AppError 基类和各种错误类型
- 提供 fromSupabaseError 工具

### ✅ P8: DOMPurify SSR 安全
- 创建 `lib/html-sanitizer.ts`
- 创建 `lib/dompurify-client.ts`
- 移除 require() 调用

### ✅ P9: 清理未使用代码
- 删除 `lib/articles.ts` 中未使用的函数
- 保留 `recordUserReadAtomic` 作为唯一写入函数

### ✅ P10: 图片上传重试机制
- 创建 `lib/upload-utils.ts`
- 实现指数退避重试
- 添加幂等上传支持

### ✅ P11: 常量提取
- 创建 `lib/constants.ts`
- 提取存储桶名、限制值等

---

## 优先级建议

| 优先级 | 任务 | 工作量 | 风险 |
|--------|------|--------|------|
| 高 | P1 图片粘贴重构 | 中 | 低 |
| 高 | P2 HTML 事务化 | 高 | 中 |
| 低 | 持续优化 | - | - |

---

## 测试清单

完成 P1 和 P2 后需要验证：

- [ ] 图片粘贴（富文本）
- [ ] 图片粘贴（截图）
- [ ] 图片粘贴（语雀）
- [ ] 图片粘贴（飞书）
- [ ] 图片粘贴（Word）
- [ ] PDF 上传
- [ ] HTML 上传（无配图）
- [ ] HTML 上传（单张配图）
- [ ] HTML 上传（多张配图）
- [ ] HTML 上传（部分配图失败）
- [ ] 网络中断恢复
- [ ] 并发上传
