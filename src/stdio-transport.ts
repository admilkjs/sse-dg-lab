/**
 * @fileoverview JSON-RPC 标准输入/输出桥接
 * @description 让 MCP 可以通过 stdin/stdout 调用本服务（npm 包模式）
 */

import readline from "readline";
import type { JsonRpcHandler } from "./jsonrpc-handler";

/**
 * 标准输入输出桥
 *
 * 读取每一行作为 JSON-RPC 消息，处理后若有响应则写回 stdout。
 */
export class JsonRpcStdioBridge {
  private rl: readline.Interface | null = null;
  private handler: JsonRpcHandler;

  constructor(handler: JsonRpcHandler) {
    this.handler = handler;
  }

  start(): void {
    if (this.rl) return;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const response = await this.handler.handleMessage(trimmed);
        if (response) {
          process.stdout.write(`${JSON.stringify(response)}\n`);
        }
      } catch (err) {
        // 避免打断主进程，仅将错误打印到 stderr
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[STDIO] 处理 JSON-RPC 消息失败: ${message}\n`);
      }
    });
  }

  stop(): void {
    this.rl?.close();
    this.rl = null;
  }
}
