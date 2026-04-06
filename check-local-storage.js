// 检查localStorage中的会员相关数据
console.log('=== 检查localStorage数据 ===');

// 检查登录状态
const isLoggedIn = localStorage.getItem('isLoggedIn');
console.log('登录状态:', isLoggedIn);

// 检查会员状态
const membership = localStorage.getItem('membership');
console.log('会员状态:', membership ? JSON.parse(membership) : '无');

// 检查用户邮箱
const userEmail = localStorage.getItem('userEmail');
console.log('用户邮箱:', userEmail);

// 清除所有会员相关数据
function clearAllMembershipData() {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('membership');
  localStorage.removeItem('userEmail');
  console.log('\n=== 数据已清除 ===');
  console.log('登录状态:', localStorage.getItem('isLoggedIn'));
  console.log('会员状态:', localStorage.getItem('membership'));
  console.log('用户邮箱:', localStorage.getItem('userEmail'));
  console.log('请刷新页面以查看效果');
}

// 导出函数到全局作用域
window.checkLocalStorage = {
  clear: clearAllMembershipData
};

console.log('\n=== 可用命令 ===');
console.log('checkLocalStorage.clear() - 清除所有会员相关数据');
