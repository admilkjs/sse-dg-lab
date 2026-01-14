#!/usr/bin/env node
/**
 * @fileoverview DG-LAB MCP SSE 服务器 CLI 入口
 * @description 用于 npx 启动的命令行入口
 */

import { createApp, startApp } from "./app.js";

/**
 * CLI 主函数
 */
async function main() {
  // 创建并初始化应用
  const app = createApp();

  // 设置优雅关闭
  const shutdown = async () => {
    await app.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 启动应用
  await startApp(app);
}

main().catch((error) => {
  console.error("[致命错误]", error);
  process.exit(1);
});
