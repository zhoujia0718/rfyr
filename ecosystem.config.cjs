/**
 * PM2 生产环境启动配置（宝塔 / 自建服务器）
 *
 * 用法：
 *   cd /www/wwwroot/rfyr
 *   pm2 delete rfyr 2>/dev/null
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * 说明：不要用 `pm2 start npm -- start`，容易多一层子进程、端口抢占、日志混乱。
 */
module.exports = {
  apps: [
    {
      name: 'rfyr',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        // 仅本机 Nginx 反代时可解开下一行，避免外网直连 3000
        // HOSTNAME: '127.0.0.1',
      },
    },
  ],
}
