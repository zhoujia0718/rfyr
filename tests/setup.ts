// 测试环境配置
process.env.HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing-32chars'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.ADMIN_EMAILS = 'admin@test.com,superadmin@test.com'

// 全局测试工具
export const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
export const TEST_EMAIL = 'admin@test.com'
