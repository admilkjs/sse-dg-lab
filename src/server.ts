/**
 * @fileoverview HTTP 服务器
 * @description 提供 SSE、POST 端点和 WebSocket 的 HTTP 服务器
 * SSE/POST 用于 MCP 协议，WebSocket 用于 DG-LAB APP 连接
 */

import express from "express";
import type { Request, Response, Application } from "express";
import type { Server as HttpServer } from "http";
import type { ServerConfig } from "./config";
import { SSETransport } from "./sse-transport";
import { JsonRpcHandler } from "./jsonrpc-handler";
import { JsonRpcStdioBridge } from "./stdio-transport.js";
import { enableStdioMode } from "./logger.js";

/**
 * MCP 服务器接口
 */
export interface MCPServer {
  /** Express 应用实例 */
  app: Application;
  /** HTTP 服务器实例 */
  httpServer: HttpServer | null;
  /** SSE 传输层 */
  sseTransport: SSETransport;
  /** 标准输入/输出传输桥（可选） */
  stdioBridge: JsonRpcStdioBridge | null;
  /** 传输模式 */
  transportMode: ServerConfig["transportMode"];
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
  const stdioBridge = config.transportMode === "stdio" ? new JsonRpcStdioBridge(jsonRpcHandler) : null;

  // SSE / POST 或 HTTP JSON-RPC 端点
  if (config.transportMode === "sse") {
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
  } else if (config.transportMode === "http") {
    // 纯 HTTP JSON-RPC 端点（同步响应）
    app.post(config.rpcPath, async (req: Request, res: Response) => {
      // 获取原始请求体
      let body: string;
      if (typeof req.body === "string") {
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
      }

      console.log(`[HTTP RPC] 收到消息:`, body);
      const response = await jsonRpcHandler.handleMessage(body);
      // HTTP 模式直接返回 JSON
      res.status(200).json(response ?? {});
    });
  }

  // 健康检查端点
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      connections: sseTransport.connectionCount,
    });
  });

  let httpServer: HttpServer | null = null;

  return {
    app,
    httpServer: null,
    sseTransport,
    stdioBridge,
    transportMode: config.transportMode,
    jsonRpcHandler,

    async start(): Promise<void> {
      if (config.transportMode === "stdio") {
        // stdio 模式下将日志重定向到 stderr，避免干扰 JSON-RPC 通信
        enableStdioMode();
        console.log("[服务器] 以 stdio 模式运行 (npm 包 MCP)");
        stdioBridge?.start();
        // stdio 模式不启动 HTTP 服务器
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        httpServer = app.listen(config.port, () => {
          console.log(`[服务器] MCP 服务器监听端口 ${config.port} (${config.transportMode})`);
          if (config.transportMode === "sse") {
            console.log(`[服务器] SSE 端点: ${config.ssePath}`);
            console.log(`[服务器] POST 端点: ${config.postPath}`);
          } else if (config.transportMode === "http") {
            console.log(`[服务器] HTTP RPC 端点: ${config.rpcPath}`);
          }
          resolve();
        });
        // 更新实例引用
        (this as MCPServer).httpServer = httpServer;
      });
    },

    async stop(): Promise<void> {
      if (config.transportMode === "stdio") {
        stdioBridge?.stop();
      }

      return new Promise((resolve) => {
        // 检查服务器是否正在监听
        if (httpServer && httpServer.listening) {
          httpServer.close((err) => {
            if (err) {
              // 记录错误但不中断关闭流程
              console.error("[服务器] 关闭时出错:", err);
            } else {
              console.log("[服务器] 已停止");
            }
            resolve();
          });
        } else {
          // 服务器未启动或已关闭，直接 resolve
          console.log("[服务器] 未启动或已关闭");
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
