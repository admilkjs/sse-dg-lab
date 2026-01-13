/**
 * @fileoverview SSE 传输层
 * @description 管理 SSE 连接和消息传输
 */

import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { serialize } from "./types/jsonrpc";
import type { JsonRpcMessage } from "./types/jsonrpc";

/**
 * SSE 连接信息
 */
export interface SSEConnection {
  /** 连接 ID */
  id: string;
  /** HTTP 响应对象 */
  response: Response;
  /** POST 端点 URL */
  postEndpoint: string;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * SSE 传输层类
 * @description 管理 SSE 连接的建立、消息发送和断开
 */
export class SSETransport {
  private connections: Map<string, SSEConnection> = new Map();
  private postPath: string;
  private baseUrl: string;

  /**
   * 创建 SSE 传输层
   * @param postPath - POST 端点路径
   * @param baseUrl - 基础 URL（可选）
   */
  constructor(postPath: string, baseUrl: string = "") {
    this.postPath = postPath;
    this.baseUrl = baseUrl;
  }

  /**
   * 建立 SSE 连接并发送 endpoint 事件
   * @param req - HTTP 请求
   * @param res - HTTP 响应
   * @returns SSE 连接信息
   */
  connect(req: Request, res: Response): SSEConnection {
    const connectionId = uuidv4();
    
    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
    res.flushHeaders();

    // 构建带 session ID 的 POST 端点 URI
    const postEndpoint = `${this.baseUrl}${this.postPath}?sessionId=${connectionId}`;

    const connection: SSEConnection = {
      id: connectionId,
      response: res,
      postEndpoint,
      createdAt: new Date(),
    };

    this.connections.set(connectionId, connection);

    // 按 MCP SSE 规范发送 endpoint 事件
    this.sendEvent(connectionId, "endpoint", postEndpoint);

    // 处理客户端断开
    req.on("close", () => {
      this.disconnect(connectionId);
    });

    return connection;
  }

  /**
   * 向指定连接发送 SSE 事件
   * @param connectionId - 连接 ID
   * @param event - 事件名
   * @param data - 数据
   * @returns 是否发送成功
   */
  sendEvent(connectionId: string, event: string, data: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    try {
      connection.response.write(`event: ${event}\n`);
      connection.response.write(`data: ${data}\n\n`);
      return true;
    } catch {
      // 连接可能已关闭
      this.disconnect(connectionId);
      return false;
    }
  }

  /**
   * 通过 SSE 发送 JSON-RPC 消息
   * @param connectionId - 连接 ID
   * @param message - JSON-RPC 消息
   * @returns 是否发送成功
   */
  send(connectionId: string, message: JsonRpcMessage): boolean {
    const data = serialize(message);
    return this.sendEvent(connectionId, "message", data);
  }

  /**
   * 断开并清理 SSE 连接
   * @param connectionId - 连接 ID
   */
  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      try {
        connection.response.end();
      } catch {
        // 忽略结束响应时的错误
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * 根据 ID 获取连接
   * @param connectionId - 连接 ID
   * @returns 连接信息或 undefined
   */
  getConnection(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * 检查连接是否存在
   * @param connectionId - 连接 ID
   * @returns 是否存在
   */
  hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * 获取所有活跃连接 ID
   * @returns 连接 ID 数组
   */
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * 向所有连接广播消息
   * @param message - JSON-RPC 消息
   */
  broadcast(message: JsonRpcMessage): void {
    for (const connectionId of this.connections.keys()) {
      this.send(connectionId, message);
    }
  }

  /**
   * 获取连接数量
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}
