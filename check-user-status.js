// 检查 localStorage 中的用户信息
const customAuth = localStorage.getItem('custom_auth');
if (customAuth) {
  try {
    const authData = JSON.parse(customAuth);
    console.log('LocalStorage 中的用户信息:');
    console.log('用户 ID:', authData.user.id);
    console.log('用户名:', authData.user.username);
    console.log('会员等级:', authData.user.vip_tier);
    console.log('登录时间:', new Date(authData.loginTime).toString());
  } catch (error) {
    console.error('解析登录信息失败:', error);
  }
} else {
  console.log('LocalStorage 中没有登录信息');
}

// 检查当前导航栏的用户状态
console.log('当前用户状态:');
console.log('isLoggedIn:', window.isLoggedIn);
if (window.user) {
  console.log('用户 ID:', window.user.id);
  console.log('用户名:', window.user.username);
  console.log('会员等级:', window.user.vip_tier);
} else {
  console.log('用户未登录');
}