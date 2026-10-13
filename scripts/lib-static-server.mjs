/**
 * 极简静态文件服务器，供 `verify-live-assets.mjs` 当"被测来源"使用。
 *
 * ⚠️ 为什么必须是**独立进程**（这里卡了我两次，各 10 分钟才定位到）：
 * 验证脚本要用 `execFileSync` 调检查器，而 `execFileSync` 会**阻塞事件循环**。
 * 如果服务器跑在同一个进程里，它的请求处理回调永远排不上队：
 *   检查器请求本地服务器 → 事件循环被阻塞 → 服务器无法响应 → **死锁**。
 * 所以服务器由验证脚本用 `spawn` 起成子进程。
 *
 * 用法：node scripts/lib-static-server.mjs <目录>
 * 启动后在 stdout 打印 `PORT=<端口>`，父进程据此拼接 origin。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(process.argv[2] ?? '.');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let filePath = path.join(rootDir, urlPath);

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = path.join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // 找不到就 404 —— 这正是验证脚本要制造的故障
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT=${server.address().port}\n`);
});
