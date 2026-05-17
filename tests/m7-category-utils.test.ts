/**
 * Module 7 - UI组件库：lib/category-utils.ts 测试套件
 *
 * 测试覆盖：
 * 1. buildCategoryMaps() - 分类映射构建
 * 2. isInCategoryTree() - 分类树归属判断（含 M7-04 修复验证）
 * 3. getDescendantCategoryNames() - 子分类名称获取
 * 4. findCategoryRootIdsByHref() - href 查找
 * 5. filterArticlesByCategory() / filterArticlesBySection() - 文章过滤
 * 6. buildCategoryTree() - 树形结构构建
 * 7. toCategoryNode() / toCategoryNodes() - 数据转换
 */
import { describe, it, expect } from 'vitest'
import {
  buildCategoryMaps,
  isInCategoryTree,
  getDescendantCategoryNames,
  findCategoryRootIdsByHref,
  filterArticlesByCategory,
  filterArticlesBySection,
  buildCategoryTree,
  toCategoryNode,
  toCategoryNodes,
  type CategoryNode as BaseCategoryNode,
} from '../lib/category-utils'

// Extended type with children property (used in tree structures)
interface CategoryNodeWithChildren extends BaseCategoryNode {
  children?: CategoryNodeWithChildren[]
}

// Keep CategoryNode as the base type for test data compatibility
type CategoryNode = BaseCategoryNode

// ─── 测试数据 ───────────────────────────────────────────────────────────────

const makeRows = (): CategoryNode[] => [
  // 根分类
  { id: 'root-notes', name: '笔记', href: '/notes', parentId: null },
  { id: 'root-stocks', name: '个股', href: '/stocks', parentId: null },
  { id: 'root-masters', name: '大师', href: '/masters', parentId: null },
  // 笔记子分类
  { id: 'notes-basic', name: '基础笔记', parentId: 'root-notes' },
  { id: 'notes-advanced', name: '进阶笔记', parentId: 'root-notes' },
  { id: 'notes-detail', name: '技术细节', parentId: 'notes-advanced' },
  // 个股子分类
  { id: 'stocks-tech', name: '科技股', parentId: 'root-stocks' },
  { id: 'stocks-bank', name: '银行股', parentId: 'root-stocks' },
]

const makeMaps = () => {
  const rows = makeRows()
  return buildCategoryMaps(rows)
}

// ─── 测试 ───────────────────────────────────────────────────────────────────

describe('M7-04: lib/category-utils.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. buildCategoryMaps()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('buildCategoryMaps()', () => {
    it('应正确构建 categoryMap', () => {
      const maps = makeMaps()
      expect(maps.categoryMap['root-notes']).toBeDefined()
      expect(maps.categoryMap['root-notes']?.name).toBe('笔记')
    })

    it('应正确构建 nameToIdMap', () => {
      const maps = makeMaps()
      expect(maps.nameToIdMap['笔记']).toBe('root-notes')
      expect(maps.nameToIdMap['基础笔记']).toBe('notes-basic')
    })

    it('应正确构建 childrenMap', () => {
      const maps = makeMaps()
      expect(maps.childrenMap['root-notes']).toEqual(['notes-basic', 'notes-advanced'])
      expect(maps.childrenMap['notes-advanced']).toEqual(['notes-detail'])
    })

    it('应处理空数组', () => {
      const maps = buildCategoryMaps([])
      expect(Object.keys(maps.categoryMap).length).toBe(0)
      expect(Object.keys(maps.nameToIdMap).length).toBe(0)
    })

    it('应处理无 parentId 的节点', () => {
      const rows = [{ id: 'solo', name: '独立分类' }]
      const maps = buildCategoryMaps(rows)
      expect(maps.categoryMap['solo']?.parentId).toBeUndefined()
      expect(maps.childrenMap['solo']).toBeUndefined()
    })

    it('应去除 name 前后空白', () => {
      const rows = [{ id: 'trim-test', name: '  前后空白  ' }]
      const maps = buildCategoryMaps(rows)
      expect(maps.nameToIdMap['前后空白']).toBe('trim-test')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. isInCategoryTree()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isInCategoryTree() - 分类树归属判断', () => {
    const maps = makeMaps()

    it('应正确处理精确匹配', () => {
      expect(isInCategoryTree('笔记', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
    })

    it('应正确处理直接子分类（一级继承）', () => {
      expect(isInCategoryTree('基础笔记', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
      expect(isInCategoryTree('进阶笔记', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
    })

    it('应正确处理深度子分类（三级继承）— M7-04 修复验证', () => {
      // 技术细节 → 进阶笔记 → 笔记
      // 这是核心修复：旧代码在 while 循环中 break 导致不进入父链遍历
      expect(isInCategoryTree('技术细节', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
    })

    it('应正确处理不在树中的分类', () => {
      expect(isInCategoryTree('科技股', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(false)
      expect(isInCategoryTree('笔记', '个股', maps.categoryMap, maps.nameToIdMap)).toBe(false)
    })

    it('M7-04 修复验证：深度嵌套（>2层）应正确遍历父链', () => {
      // 添加4层嵌套验证
      const deepRows: CategoryNode[] = [
        { id: 'r1', name: 'Root', parentId: null },
        { id: 'r2', name: 'Child1', parentId: 'r1' },
        { id: 'r3', name: 'Child2', parentId: 'r2' },
        { id: 'r4', name: 'Child3', parentId: 'r3' },
        { id: 'r5', name: 'Child4', parentId: 'r4' },
      ]
      const deepMaps = buildCategoryMaps(deepRows)

      // 验证每层都能找到 Root
      expect(isInCategoryTree('Child1', 'Root', deepMaps.categoryMap, deepMaps.nameToIdMap)).toBe(true)
      expect(isInCategoryTree('Child2', 'Root', deepMaps.categoryMap, deepMaps.nameToIdMap)).toBe(true)
      expect(isInCategoryTree('Child3', 'Root', deepMaps.categoryMap, deepMaps.nameToIdMap)).toBe(true)
      expect(isInCategoryTree('Child4', 'Root', deepMaps.categoryMap, deepMaps.nameToIdMap)).toBe(true)
      // 不在树中的节点
      expect(isInCategoryTree('NotInTree', 'Root', deepMaps.categoryMap, deepMaps.nameToIdMap)).toBe(false)
    })

    it('应处理空字符串输入', () => {
      expect(isInCategoryTree('', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(false)
    })

    it('应处理不存在的根分类', () => {
      expect(isInCategoryTree('基础笔记', '不存在的分类', maps.categoryMap, maps.nameToIdMap)).toBe(false)
    })

    it('应处理空白输入', () => {
      expect(isInCategoryTree('  笔记  ', '笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. getDescendantCategoryNames()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('getDescendantCategoryNames()', () => {
    it('应返回根节点的所有后代名称', () => {
      const maps = makeMaps()
      const names = getDescendantCategoryNames('root-notes', maps.childrenMap, maps.categoryMap)
      expect(names.has('基础笔记')).toBe(true)
      expect(names.has('进阶笔记')).toBe(true)
      expect(names.has('技术细节')).toBe(true)
    })

    it('不应包含根节点自身', () => {
      const maps = makeMaps()
      const names = getDescendantCategoryNames('root-notes', maps.childrenMap, maps.categoryMap)
      expect(names.has('笔记')).toBe(false)
    })

    it('应返回空集对于叶子节点', () => {
      const maps = makeMaps()
      const names = getDescendantCategoryNames('notes-detail', maps.childrenMap, maps.categoryMap)
      expect(names.size).toBe(0)
    })

    it('应返回空集对于不存在的节点', () => {
      const maps = makeMaps()
      const names = getDescendantCategoryNames('non-existent', maps.childrenMap, maps.categoryMap)
      expect(names.size).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. findCategoryRootIdsByHref()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('findCategoryRootIdsByHref()', () => {
    const rows = makeRows()

    it('应通过 href 找到根分类 ID', () => {
      expect(findCategoryRootIdsByHref(rows, '/notes')).toContain('root-notes')
      expect(findCategoryRootIdsByHref(rows, '/stocks')).toContain('root-stocks')
    })

    it('应忽略末尾斜杠', () => {
      expect(findCategoryRootIdsByHref(rows, '/notes/')).toContain('root-notes')
    })

    it('应返回空数组对于不存在的 href', () => {
      expect(findCategoryRootIdsByHref(rows, '/non-existent')).toEqual([])
    })

    it('应处理 href 为 null 的行', () => {
      const rowsWithNull = [...rows, { id: 'null-href', name: '空Href', href: null }]
      expect(findCategoryRootIdsByHref(rowsWithNull, '/notes')).toContain('root-notes')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. filterArticlesByCategory()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('filterArticlesByCategory()', () => {
    const maps = makeMaps()
    const articles = [
      { id: '1', category: '笔记' },
      { id: '2', category: '基础笔记' },
      { id: '3', category: '技术细节' },
      { id: '4', category: '科技股' },
      { id: '5', category: '' },
    ] as { id: string; category: string }[]

    it('应过滤出属于指定分类树的所有文章', () => {
      const filtered = filterArticlesByCategory(articles as unknown as Parameters<typeof filterArticlesByCategory>[0], '笔记', maps.categoryMap, maps.nameToIdMap)
      expect(filtered.length).toBe(3)
      expect(filtered.map((a) => a.id)).toEqual(['1', '2', '3'])
    })

    it('应排除不属于指定分类树的文章', () => {
      const filtered = filterArticlesByCategory(articles as unknown as Parameters<typeof filterArticlesByCategory>[0], '笔记', maps.categoryMap, maps.nameToIdMap)
      expect(filtered.find((a) => a.id === '4')).toBeUndefined()
    })

    it('应处理空分类的文章', () => {
      const filtered = filterArticlesByCategory(articles as unknown as Parameters<typeof filterArticlesByCategory>[0], '笔记', maps.categoryMap, maps.nameToIdMap)
      expect(filtered.find((a) => a.id === '5')).toBeUndefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. buildCategoryTree()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('buildCategoryTree()', () => {
    it('应构建正确的树形结构', () => {
      const rows = makeRows()
      const tree = buildCategoryTree(rows)

      // 应该有 3 个根节点
      expect(tree.length).toBe(3)

      // 笔记根节点应有子节点
      const notesNode = (tree as CategoryNodeWithChildren[]).find((n) => n.id === 'root-notes')
      expect(notesNode).toBeDefined()
      expect(notesNode?.children?.length).toBe(2)
    })

    it('应正确处理嵌套子节点', () => {
      const rows = makeRows()
      const tree = buildCategoryTree(rows)

      const notesNode = (tree as CategoryNodeWithChildren[]).find((n) => n.id === 'root-notes')
      const advancedNode = (notesNode?.children as CategoryNodeWithChildren[] | undefined)?.find((c) => c.id === 'notes-advanced')
      expect(advancedNode?.children?.length).toBe(1)
      expect(advancedNode?.children?.[0].id).toBe('notes-detail')
    })

    it('空数组应返回空树', () => {
      expect(buildCategoryTree([])).toEqual([])
    })

    it('应处理无父节点的独立节点', () => {
      const rows = [
        { id: 'solo1', name: '独立1', parentId: null },
        { id: 'solo2', name: '独立2' },
      ]
      const tree = buildCategoryTree(rows)
      expect(tree.length).toBe(2)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. toCategoryNode() / toCategoryNodes()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('toCategoryNode() / toCategoryNodes()', () => {
    it('toCategoryNode 应正确转换数据库行', () => {
      const row: Record<string, unknown> = {
        id: 'test-id',
        name: '  测试名称  ',
        icon: '📝',
        description: '测试描述',
        href: '/test',
        parent_id: 'parent-id',
      }
      const node = toCategoryNode(row)
      expect(node.id).toBe('test-id')
      expect(node.name).toBe('测试名称')
      expect(node.icon).toBe('📝')
      expect(node.description).toBe('测试描述')
      expect(node.href).toBe('/test')
      expect(node.parentId).toBe('parent-id')
    })

    it('toCategoryNode 应处理 parent_id vs parentId', () => {
      const rowWithParentId: Record<string, unknown> = {
        id: 'id1',
        name: 'name',
        parentId: 'via-parentId-field',
      }
      expect(toCategoryNode(rowWithParentId).parentId).toBe('via-parentId-field')
    })

    it('toCategoryNode 应处理 null/undefined', () => {
      const row: Record<string, unknown> = { id: 'id' }
      const node = toCategoryNode(row)
      expect(node.name).toBe('')
      expect(node.parentId).toBeUndefined()
      expect(node.href).toBeUndefined()
    })

    it('toCategoryNodes 应批量转换', () => {
      const rows: Record<string, unknown>[] = [
        { id: '1', name: '一' },
        { id: '2', name: '二' },
      ]
      const nodes = toCategoryNodes(rows)
      expect(nodes.length).toBe(2)
      expect(nodes[0].name).toBe('一')
      expect(nodes[1].name).toBe('二')
    })
  })
})
