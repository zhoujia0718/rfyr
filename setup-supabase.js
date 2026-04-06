const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

// 初始化Supabase表格和数据
async function setupSupabase() {
  console.log('开始设置Supabase...');
  
  try {
    // 1. 创建articles表
    console.log('创建articles表...');
    const { error: createTableError } = await supabase
      .rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS articles (
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
        `
      });

    if (createTableError) {
      console.error('创建articles表失败:', createTableError);
      return;
    }
    console.log('articles表创建成功!');

    // 2. 检查是否已有数据
    console.log('检查是否已有数据...');
    const { data: existingArticles, error: checkError } = await supabase
      .from('articles')
      .select('*')
      .limit(1);

    if (checkError) {
      console.error('检查数据失败:', checkError);
      return;
    }

    // 3. 如果没有数据，填充模拟数据
    if (!existingArticles || existingArticles.length === 0) {
      console.log('填充模拟数据...');
      
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
        },
        {
          title: "彼得·林奇：如何在消费股中寻找十倍股",
          content: "彼得·林奇分享了他在消费股中寻找十倍股的方法，包括关注日常生活中接触到的品牌，分析公司的财务状况和增长潜力。",
          category: "大佬合集",
          author: "管理员",
          publishDate: "2024-03-12",
          readingCount: 120
        },
        {
          title: "龙头战法：如何识别真正的领涨股",
          content: "龙头战法是短线交易中的重要策略，本文详细介绍了如何识别真正的领涨股，包括成交量、涨跌幅、板块效应等多个维度的分析方法。",
          category: "短线笔记",
          author: "管理员",
          publishDate: "2024-03-17",
          readingCount: 180
        },
        {
          title: "消费复苏主线：白酒龙头深度分析",
          content: "本文深度分析了白酒行业的复苏趋势，重点关注龙头企业的竞争优势、财务状况和未来增长潜力，为投资者提供投资参考。",
          category: "个股挖掘",
          author: "管理员",
          publishDate: "2024-03-16",
          readingCount: 145
        },
        {
          title: "AI算力产业链机会梳理",
          content: "随着AI技术的快速发展，算力需求大幅增长。本文梳理了AI算力产业链的投资机会，包括芯片、服务器、数据中心等环节。",
          category: "个股挖掘",
          author: "管理员",
          publishDate: "2024-03-13",
          readingCount: 210
        }
      ];

      const { error: insertError } = await supabase
        .from('articles')
        .insert(mockArticles);

      if (insertError) {
        console.error('填充数据失败:', insertError);
        return;
      }
      console.log('模拟数据填充成功!');
    } else {
      console.log('数据已存在，跳过填充步骤');
    }

    // 4. 验证数据
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