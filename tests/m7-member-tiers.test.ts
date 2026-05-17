/**
 * Module 7 - UI组件库：lib/member-tiers.ts 测试套件
 *
 * 测试覆盖：
 * 1. MEMBER_TIERS / PAID_TIERS / VALID_TIERS - 枚举常量
 * 2. TIER_LEVEL - 等级数值映射
 * 3. LEGACY_MEMBERSHIP_TYPE_MAP - 旧命名兼容映射
 * 4. normalizeMemberTier() - 规范化会员类型
 * 5. isValidMemberTier() - 类型守卫
 * 6. isPaidTier() / isUnlimitedTier() - 等级判断
 * 7. MEMBER_DURATION_DAYS / MEMBER_TIER_LABELS - 配置
 * 8. toDbMembershipType() / fromDbMembershipType() - 数据库类型转换
 * 9. PERMISSIONS / hasPermission() - 权限检查
 */
import { describe, it, expect } from 'vitest'
import {
  MEMBER_TIERS,
  PAID_TIERS,
  VALID_TIERS,
  TIER_LEVEL,
  LEGACY_MEMBERSHIP_TYPE_MAP,
  normalizeMemberTier,
  isValidMemberTier,
  isPaidTier,
  isUnlimitedTier,
  MEMBER_DURATION_DAYS,
  MEMBER_TIER_LABELS,
  toDbMembershipType,
  fromDbMembershipType,
  PERMISSIONS,
  hasPermission,
  type MemberTier,
// @ts-ignore
} from '../lib/member-tiers.ts'

describe('M7-07: lib/member-tiers.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. MEMBER_TIERS / PAID_TIERS / VALID_TIERS
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('枚举常量', () => {
    it('MEMBER_TIERS 应包含所有标准等级', () => {
      expect(MEMBER_TIERS.NONE).toBe('none')
      expect(MEMBER_TIERS.MONTHLY).toBe('monthly')
      expect(MEMBER_TIERS.YEARLY).toBe('yearly')
      expect(MEMBER_TIERS.PERMANENT).toBe('permanent')
    })

    it('PAID_TIERS 应只包含付费等级', () => {
      expect(PAID_TIERS).toEqual(['monthly', 'yearly', 'permanent'])
    })

    it('VALID_TIERS 应包含所有等级', () => {
      expect(VALID_TIERS).toContain('none')
      expect(VALID_TIERS).toContain('monthly')
      expect(VALID_TIERS).toContain('yearly')
      expect(VALID_TIERS).toContain('permanent')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. TIER_LEVEL
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('TIER_LEVEL - 等级数值映射', () => {
    it('应按正确顺序排列（none < monthly < yearly < permanent）', () => {
      expect(TIER_LEVEL.none).toBe(0)
      expect(TIER_LEVEL.monthly).toBe(1)
      expect(TIER_LEVEL.yearly).toBe(2)
      expect(TIER_LEVEL.permanent).toBe(3)
    })

    it('应支持数值比较', () => {
      expect(TIER_LEVEL.yearly).toBeGreaterThan(TIER_LEVEL.monthly)
      expect(TIER_LEVEL.permanent).toBeGreaterThan(TIER_LEVEL.yearly)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. LEGACY_MEMBERSHIP_TYPE_MAP
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('LEGACY_MEMBERSHIP_TYPE_MAP - 旧命名兼容', () => {
    it('应映射标准命名', () => {
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['monthly']).toBe('monthly')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['yearly']).toBe('yearly')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['permanent']).toBe('permanent')
    })

    it('LEGACY_MAP 键直接查找（无下划线键）', () => {
      // LEGACY_MEMBERSHIP_TYPE_MAP 的键已去除下划线（monthly_vip → monthlyvip）
      // 所以直接查 MAP: monthly_vip → undefined
      // 但 normalizeMemberTier 会去掉下划线，所以 monthly_vip → monthlyvip → undefined → none
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['monthly']).toBe('monthly')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['yearly']).toBe('yearly')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['permanent']).toBe('permanent')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['none']).toBe('none')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['null']).toBe('none')
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['']).toBe('none')
      // 不存在的键返回 undefined
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['unknown_tier']).toBeUndefined()
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['random']).toBeUndefined()
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['monthly_vip']).toBeUndefined()
      expect(LEGACY_MEMBERSHIP_TYPE_MAP['annual_vip']).toBeUndefined()
    })


  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. normalizeMemberTier()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('normalizeMemberTier() - 规范化会员类型', () => {
    it('应返回标准值', () => {
      expect(normalizeMemberTier('monthly')).toBe('monthly')
      expect(normalizeMemberTier('yearly')).toBe('yearly')
      expect(normalizeMemberTier('permanent')).toBe('permanent')
      expect(normalizeMemberTier('none')).toBe('none')
    })

    it('应处理大小写', () => {
      expect(normalizeMemberTier('MONTHLY')).toBe('monthly')
      expect(normalizeMemberTier('Monthly')).toBe('monthly')
      expect(normalizeMemberTier('YEARLY')).toBe('yearly')
    })

    it('应处理旧命名', () => {
      expect(normalizeMemberTier('monthly_vip')).toBe('monthly')
      expect(normalizeMemberTier('annual_vip')).toBe('yearly')
      expect(normalizeMemberTier('yearly_vip')).toBe('yearly')
    })

    it('应处理下划线', () => {
      expect(normalizeMemberTier('monthly_vip')).toBe('monthly')
    })

    it('应处理 null/undefined/空字符串', () => {
      expect(normalizeMemberTier(null)).toBe('none')
      expect(normalizeMemberTier(undefined)).toBe('none')
      expect(normalizeMemberTier('')).toBe('none')
    })

    it('应处理未知值', () => {
      expect(normalizeMemberTier('unknown_tier')).toBe('none')
      expect(normalizeMemberTier('random')).toBe('none')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. isValidMemberTier()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isValidMemberTier() - 类型守卫', () => {
    it('应接受有效等级', () => {
      expect(isValidMemberTier('none')).toBe(true)
      expect(isValidMemberTier('monthly')).toBe(true)
      expect(isValidMemberTier('yearly')).toBe(true)
      expect(isValidMemberTier('permanent')).toBe(true)
    })

    it('应拒绝无效值', () => {
      expect(isValidMemberTier('free')).toBe(false)
      expect(isValidMemberTier('invalid')).toBe(false)
      expect(isValidMemberTier('monthly_vip')).toBe(false)
      expect(isValidMemberTier('')).toBe(false)
      expect(isValidMemberTier(null)).toBe(false)
      expect(isValidMemberTier(undefined)).toBe(false)
      expect(isValidMemberTier(123)).toBe(false)
    })

    it('应作为类型守卫使用', () => {
      const tier: unknown = 'monthly'
      if (isValidMemberTier(tier)) {
        const _checked: MemberTier = tier // 可赋值给 MemberTier
        expect(_checked).toBe('monthly')
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. isPaidTier() / isUnlimitedTier()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isPaidTier() / isUnlimitedTier()', () => {
    it('isPaidTier: none=false, 付费=true', () => {
      expect(isPaidTier('none')).toBe(false)
      expect(isPaidTier('monthly')).toBe(true)
      expect(isPaidTier('yearly')).toBe(true)
      expect(isPaidTier('permanent')).toBe(true)
    })

    it('isUnlimitedTier: yearly 和 permanent=true', () => {
      expect(isUnlimitedTier('none')).toBe(false)
      expect(isUnlimitedTier('monthly')).toBe(false)
      expect(isUnlimitedTier('yearly')).toBe(true)
      expect(isUnlimitedTier('permanent')).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. MEMBER_DURATION_DAYS / MEMBER_TIER_LABELS
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('MEMBER_DURATION_DAYS / MEMBER_TIER_LABELS', () => {
    it('monthly 应为 30 天', () => {
      expect(MEMBER_DURATION_DAYS.monthly).toBe(30)
    })

    it('yearly 应为 365 天', () => {
      expect(MEMBER_DURATION_DAYS.yearly).toBe(365)
    })

    it('permanent 应约为 100 年', () => {
      expect(MEMBER_DURATION_DAYS.permanent).toBe(365 * 100)
    })

    it('应包含所有等级的中文标签', () => {
      expect(MEMBER_TIER_LABELS.none).toBe('普通用户')
      expect(MEMBER_TIER_LABELS.monthly).toBe('月卡会员')
      expect(MEMBER_TIER_LABELS.yearly).toBe('年度VIP')
      expect(MEMBER_TIER_LABELS.permanent).toBe('永久会员')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 8. toDbMembershipType() / fromDbMembershipType()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('数据库类型转换', () => {
    it('toDbMembershipType: none 返回 null', () => {
      expect(toDbMembershipType('none')).toBeNull()
    })

    it('toDbMembershipType: 付费等级返回正确值', () => {
      expect(toDbMembershipType('monthly')).toBe('monthly')
      expect(toDbMembershipType('yearly')).toBe('yearly')
      expect(toDbMembershipType('permanent')).toBe('permanent')
    })

    it('fromDbMembershipType 应规范化数据库值', () => {
      expect(fromDbMembershipType('monthly')).toBe('monthly')
      expect(fromDbMembershipType('yearly')).toBe('yearly')
      expect(fromDbMembershipType('monthly_vip')).toBe('monthly')
      expect(fromDbMembershipType('annual_vip')).toBe('yearly')
      expect(fromDbMembershipType(null)).toBe('none')
      expect(fromDbMembershipType(undefined)).toBe('none')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 9. PERMISSIONS / hasPermission()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('PERMISSIONS / hasPermission() - 权限检查', () => {
    it('stocks 应只对 yearly 及以上开放', () => {
      expect(hasPermission('none', 'stocks')).toBe(false)
      expect(hasPermission('monthly', 'stocks')).toBe(false)
      expect(hasPermission('yearly', 'stocks')).toBe(true)
      expect(hasPermission('permanent', 'stocks')).toBe(true)
    })

    it('notes 应开放给所有等级', () => {
      expect(hasPermission('none', 'notes')).toBe(true)
      expect(hasPermission('monthly', 'notes')).toBe(true)
      expect(hasPermission('yearly', 'notes')).toBe(true)
      expect(hasPermission('permanent', 'notes')).toBe(true)
    })

    it('masters 应开放给所有等级', () => {
      expect(hasPermission('none', 'masters')).toBe(true)
      expect(hasPermission('monthly', 'masters')).toBe(true)
      expect(hasPermission('yearly', 'masters')).toBe(true)
      expect(hasPermission('permanent', 'masters')).toBe(true)
    })

    it('calendar 应开放给所有等级', () => {
      expect(hasPermission('none', 'calendar')).toBe(true)
      expect(hasPermission('monthly', 'calendar')).toBe(true)
    })

    it('membership 页面应开放给所有等级', () => {
      expect(hasPermission('none', 'membership')).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 10. 综合测试
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('综合测试', () => {
    it('等级数值比较应与权限判断一致', () => {
      const tiers: MemberTier[] = ['none', 'monthly', 'yearly', 'permanent']

      for (const tier of tiers) {
        const tierLevel = TIER_LEVEL[tier]
        const hasStocks = hasPermission(tier, 'stocks')

        if (tierLevel >= TIER_LEVEL.yearly) {
          expect(hasStocks).toBe(true)
        } else {
          expect(hasStocks).toBe(false)
        }
      }
    })

    it('toDbMembershipType 应与 fromDbMembershipType 互逆（对于有效值）', () => {
      const tiers: MemberTier[] = ['monthly', 'yearly', 'permanent']
      for (const tier of tiers) {
        const dbType = toDbMembershipType(tier)
        expect(dbType).not.toBeNull()
        const restored = fromDbMembershipType(dbType!)
        expect(restored).toBe(tier)
      }
    })
  })
})
