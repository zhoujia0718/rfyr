// 测试PDF URL可访问性
const https = require('https');

function testPdfAccess() {
  console.log('Testing PDF URL access...');
  
  // 测试PDF URL
  const pdfUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/article-pdfs/7._2024-1-21_132711_1.pdf';
  console.log('Testing PDF URL:', pdfUrl);
  
  // 解析URL
  const url = new URL(pdfUrl);
  
  // 发送HEAD请求
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  };
  
  const req = https.request(options, (res) => {
    console.log('Response status:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Content-Length:', res.headers['content-length']);
    
    if (res.statusCode === 200) {
      console.log('PDF URL is accessible');
    } else {
      console.log('PDF URL is not accessible, status:', res.statusCode);
    }
  });
  
  req.on('error', (e) => {
    console.error('Error testing PDF URL:', e.message);
  });
  
  req.end();
}

testPdfAccess();
