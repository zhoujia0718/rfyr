const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

// 初始化Supabase数据
async function setupSupabase() {
  console.log('开始设置Supabase...');
  
  try {
    // 尝试插入数据，让Supabase自动创建表结构
    console.log('插入模拟数据...');
    
    const mockArticles = [
      {
        title: "巴菲特2024年致股东信深度解读",
        content: "巴菲特在2024年致股东信中强调了长期投资的重要性，建议投资者关注具有长期竞争优势的企业。他认为，在市场波动时保持冷静是成功投资的关键。",
        category: "大佬合集",
        author: "管理员",
        publishDate: "2024-03-15",
        readingCount: 156
      },
      {
        title: "索罗斯的反身性理论",
        content: "索罗斯的反身性理论认为，市场参与者的认知和市场实际情况之间存在相互影响的关系。这种相互作用会导致市场出现过度反应，为投资者创造机会。",
        category: "大佬合集",
        author: "管理员",
        publishDate: "2024-03-10",
        readingCount: 98
      },
      {
        title: "短线交易技术指标详解",
        content: "本文详细介绍了常用的短线交易技术指标，包括MACD、KDJ、RSI等，帮助投资者掌握短线交易的技术分析方法。",
        category: "短线笔记",
        author: "管理员",
        publishDate: "2024-03-05",
        readingCount: 203
      },
      {
        title: "2024年潜力个股分析",
        content: "本文分析了2024年具有潜力的个股，包括新兴产业的龙头企业和传统行业的转型企业，为投资者提供参考。",
        category: "个股挖掘",
        author: "管理员",
        publishDate: "2024-02-28",
        readingCount: 175
      }
    ];

    const { error: insertError } = await supabase
      .from('articles')
      .insert(mockArticles);

    if (insertError) {
      console.error('插入数据失败:', insertError);
      console.log('\n请在Supabase控制台手动创建articles表:');
      console.log(`
CREATE TABLE articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  publishDate DATE NOT NULL,
  readingCount INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
`);
      return;
    }

    console.log('数据插入成功!');

    // 验证数据
    console.log('验证数据...');
    const { data: finalArticles, error: verifyError } = await supabase
      .from('articles')
      .select('*');

    if (verifyError) {
      console.error('验证数据失败:', verifyError);
      return;
    }

    console.log(`成功创建并填充了 ${finalArticles.length} 篇文章!`);
    console.log('Supabase设置完成!');

  } catch (error) {
    console.error('设置过程中出现错误:', error);
  }
}

// 运行设置
setupSupabase();