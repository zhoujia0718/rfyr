// 测试会员激活脚本
// 在浏览器控制台中运行此脚本以快速激活会员状态

// 会员类型定义
const MembershipType = {
  NONE: 'none',
  WEEKLY: 'weekly',
  YEARLY: 'yearly'
};

// 创建会员记录
function createMembership(type, durationDays) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + durationDays);

  return {
    type,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true
  };
}

// 保存会员信息到localStorage
function saveMembership(membership) {
  localStorage.setItem('membership', JSON.stringify(membership));
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('userEmail', 'test@example.com');
  console.log('会员状态已激活:', membership);
  console.log('请刷新页面以查看会员状态');
}

// 激活周卡会员
function activateWeeklyMembership() {
  const membership = createMembership(MembershipType.WEEKLY, 7);
  saveMembership(membership);
}

// 激活年度会员
function activateYearlyMembership() {
  const membership = createMembership(MembershipType.YEARLY, 365);
  saveMembership(membership);
}

// 清除会员状态
function clearMembership() {
  localStorage.removeItem('membership');
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userEmail');
  console.log('会员状态已清除');
  console.log('请刷新页面以查看状态');
}

// 显示当前会员状态
function showCurrentMembership() {
  const membership = localStorage.getItem('membership');
  const isLoggedIn = localStorage.getItem('isLoggedIn');
  console.log('当前登录状态:', isLoggedIn === 'true');
  console.log('当前会员状态:', membership ? JSON.parse(membership) : '无会员');
}

// 导出函数到全局作用域
window.testMembership = {
  activateWeekly: activateWeeklyMembership,
  activateYearly: activateYearlyMembership,
  clear: clearMembership,
  show: showCurrentMembership
};

console.log('测试会员脚本已加载');
console.log('可用命令:');
console.log('testMembership.activateWeekly() - 激活周卡会员');
console.log('testMembership.activateYearly() - 激活年度会员');
console.log('testMembership.clear() - 清除会员状态');
console.log('testMembership.show() - 显示当前会员状态');
