async function testFrontendPdfDisplay() {
  try {
    console.log('开始测试前端 PDF 显示...');
    
    const articleId = '75fb7286-1e00-455d-a79f-fa80307db59f';
    const url = `http://localhost:3000/article/${articleId}`;
    
    console.log('访问 URL:', url);
    
    const response = await fetch(url);
    const html = await response.text();
    
    console.log('响应状态:', response.status);
    console.log('响应状态文本:', response.statusText);
    
    // 检查 HTML 内容中是否包含 PDF 预览的代码
    if (html.includes('PDF 内容')) {
      console.log('✅ HTML 内容中包含 "PDF 内容" 文本');
    } else {
      console.error('❌ HTML 内容中不包含 "PDF 内容" 文本');
    }
    
    if (html.includes('iframe')) {
      console.log('✅ HTML 内容中包含 iframe 元素');
    } else {
      console.error('❌ HTML 内容中不包含 iframe 元素');
    }
    
    if (html.includes('下载 PDF')) {
      console.log('✅ HTML 内容中包含 "下载 PDF" 文本');
    } else {
      console.error('❌ HTML 内容中不包含 "下载 PDF" 文本');
    }
    
    // 检查 HTML 内容中是否包含富文本内容的代码
    if (html.includes('dangerouslySetInnerHTML')) {
      console.log('❌ HTML 内容中包含富文本内容的代码');
    } else {
      console.log('✅ HTML 内容中不包含富文本内容的代码');
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试前端 PDF 显示失败:', error);
  }
}

testFrontendPdfDisplay();
