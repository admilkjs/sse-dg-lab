/**
 * @fileoverview HTTP 服务器
 * @description 提供 SSE 和 POST 端点的 HTTP 服务器
 */

import express from "express";
import type { Request, Response, Application } from "express";
import type { ServerConfig } from "./config";
import { SSETransport } from "./sse-transport";
import { JsonRpcHandler } from "./jsonrpc-handler";
import { serialize } from "./types/jsonrpc";
import type { JsonRpcResponse } from "./types/jsonrpc";

/**
 * MCP 服务器接口
 */
export interface MCPServer {
  /** Express 应用实例 */
  app: Application;
  /** SSE 传输层 */
  sseTransport: SSETransport;
  /** JSON-RPC 处理器 */
  jsonRpcHandler: JsonRpcHandler;
  /** 启动服务器 */
  start(): Promise<void>;
  /** 停止服务器 */
  stop(): Promise<void>;
}

/**
 * 创建 MCP 服务器
 * @param config - 服务器配置
 * @returns MCP 服务器实例
 */
export function createServer(config: ServerConfig): MCPServer {
  const app = express();
  
  // CORS 中间件
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json());
  app.use(express.text({ type: "application/json" }));

  const sseTransport = new SSETransport(config.postPath);
  const jsonRpcHandler = new JsonRpcHandler({
    onError: (error) => {
      console.error("[JSON-RPC 错误]", error);
    },
  });

  // SSE 端点 (GET /sse)
  app.get(config.ssePath, (req: Request, res: Response) => {
    console.log("[SSE] 新连接");
    const connection = sseTransport.connect(req, res);
    console.log(`[SSE] 连接已建立: ${connection.id}`);
  });

  // POST 端点，用于 JSON-RPC 消息
  app.post(config.postPath, async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId || !sseTransport.hasConnection(sessionId)) {
      res.status(400).json({ error: "无效或缺少 sessionId" });
      return;
    }

    // 获取原始请求体
    let body: string;
    if (typeof req.body === "string") {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }

    console.log(`[POST] 收到会话 ${sessionId} 的消息:`, body);

    // 处理 JSON-RPC 消息
    const response = await jsonRpcHandler.handleMessage(body);

    // 如果有响应，通过 SSE 发送（请求有响应，通知没有）
    if (response) {
      sseTransport.send(sessionId, response);
    }

    // POST 请求始终返回 202 Accepted（响应通过 SSE 发送）
    res.status(202).json({ status: "accepted" });
  });

  // 健康检查端点
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      connections: sseTransport.connectionCount,
    });
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,
    sseTransport,
    jsonRpcHandler,

    async start(): Promise<void> {
      return new Promise((resolve) => {
        server = app.listen(config.port, () => {
          console.log(`[服务器] MCP SSE 服务器监听端口 ${config.port}`);
          console.log(`[服务器] SSE 端点: ${config.ssePath}`);
          console.log(`[服务器] POST 端点: ${config.postPath}`);
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (server) {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    },
  };
}

/**
 * 向所有连接的客户端广播通知
 * @param server - MCP 服务器实例
 * @param method - 方法名
 * @param params - 参数（可选）
 */
export function broadcastNotification(
  server: MCPServer,
  method: string,
  params?: Record<string, unknown>
): void {
  const notification = {
    jsonrpc: "2.0" as const,
    method,
    params,
  };
  server.sseTransport.broadcast(notification);
}
