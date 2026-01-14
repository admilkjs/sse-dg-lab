/**
 * @fileoverview MCP 协议实现
 * @description 处理 MCP 初始化握手和协议方法
 */

import type { JsonRpcHandler } from "./jsonrpc-handler";

/** MCP 协议版本 */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

/** 服务器信息 */
export const SERVER_INFO = {
  name: "dg-lab-mcp-server",
  version: "1.0.0",
};

/** 服务器能力 */
export const SERVER_CAPABILITIES = {
  tools: {
    listChanged: true,
  },
};

/**
 * 初始化请求参数
 */
export interface InitializeParams {
  /** 协议版本 */
  protocolVersion: string;
  /** 客户端能力 */
  capabilities: Record<string, unknown>;
  /** 客户端信息 */
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * 初始化响应结果
 */
export interface InitializeResult {
  /** 协议版本 */
  protocolVersion: string;
  /** 服务器能力 */
  capabilities: typeof SERVER_CAPABILITIES;
  /** 服务器信息 */
  serverInfo: typeof SERVER_INFO;
}

/**
 * 注册 MCP 协议处理函数
 * @param handler - JSON-RPC 处理器
 * @param onInitialized - 初始化完成回调
 */
export function registerMCPProtocol(
  handler: JsonRpcHandler,
  onInitialized?: () => void
): void {
  // 处理 initialize 请求
  handler.registerRequestHandler("initialize", async (params) => {
    const initParams = params as unknown as InitializeParams | undefined;
    
    // 验证协议版本
    if (initParams?.protocolVersion && initParams.protocolVersion !== MCP_PROTOCOL_VERSION) {
      console.log(`[MCP] 客户端请求的协议版本: ${initParams.protocolVersion}`);
    }

    const result: InitializeResult = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO,
    };

    console.log("[MCP] 收到初始化请求，返回服务器能力");
    return result;
  });

  // 处理 initialized 通知
  handler.registerNotificationHandler("initialized", async () => {
    console.log("[MCP] 初始化完成");
    onInitialized?.();
  });

  // 处理 ping 请求
  handler.registerRequestHandler("ping", async () => {
    return {};
  });
}
