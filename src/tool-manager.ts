/**
 * @fileoverview 工具管理器
 * @description 管理 MCP 工具定义和执行
 */

import type { JsonRpcHandler } from "./jsonrpc-handler";

/**
 * JSON Schema 类型定义
 */
export interface JsonSchema {
  /** 类型 */
  type: string;
  /** 属性定义 */
  properties?: Record<string, JsonSchema & { 
    description?: string; 
    enum?: string[]; 
    minimum?: number; 
    maximum?: number; 
    pattern?: string; 
    maxItems?: number; 
    items?: JsonSchema 
  }>;
  /** 必需属性 */
  required?: string[];
  /** 描述 */
  description?: string;
}

/**
 * 工具内容类型
 */
export interface ToolContent {
  /** 内容类型 */
  type: "text";
  /** 文本内容 */
  text: string;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 内容数组 */
  content: ToolContent[];
  /** 是否为错误 */
  isError?: boolean;
}

/**
 * 工具定义
 */
export interface Tool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入参数 Schema */
  inputSchema: JsonSchema;
}

/**
 * 工具处理函数类型
 * @param params - 参数
 * @returns 工具执行结果
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/**
 * 已注册的工具（包含处理函数）
 */
interface RegisteredTool extends Tool {
  handler: ToolHandler;
}

/**
 * 创建成功的工具结果
 * @param text - 结果文本
 * @returns 工具结果
 */
export function createToolResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * 创建错误的工具结果
 * @param message - 错误消息
 * @returns 工具结果
 */
export function createToolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * 工具管理器类
 * @description 管理工具的注册、列表和调用
 */
export class ToolManager {
  private tools: Map<string, RegisteredTool> = new Map();
  private onToolsChanged?: () => void;

  /**
   * 创建工具管理器
   * @param onToolsChanged - 工具列表变化回调
   */
  constructor(onToolsChanged?: () => void) {
    this.onToolsChanged = onToolsChanged;
  }

  /**
   * 注册新工具
   * @param name - 工具名称
   * @param description - 工具描述
   * @param inputSchema - 输入参数 Schema
   * @param handler - 处理函数
   */
  registerTool(
    name: string,
    description: string,
    inputSchema: JsonSchema,
    handler: ToolHandler
  ): void {
    this.tools.set(name, {
      name,
      description,
      inputSchema,
      handler,
    });
    this.onToolsChanged?.();
  }

  /**
   * 注销工具
   * @param name - 工具名称
   * @returns 是否成功注销
   */
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.onToolsChanged?.();
    }
    return result;
  }

  /**
   * 列出所有已注册的工具（不包含处理函数）
   * @returns 工具列表
   */
  listTools(): Tool[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  /**
   * 按名称调用工具
   * @param name - 工具名称
   * @param params - 参数
   * @returns 工具执行结果
   */
  async callTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return createToolError(`工具未找到: ${name}`);
    }

    try {
      return await tool.handler(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return createToolError(message);
    }
  }

  /**
   * 检查工具是否存在
   * @param name - 工具名称
   * @returns 是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取工具数量
   */
  get toolCount(): number {
    return this.tools.size;
  }
}

/**
 * 注册工具相关的 MCP 处理函数
 * @param jsonRpcHandler - JSON-RPC 处理器
 * @param toolManager - 工具管理器
 */
export function registerToolHandlers(
  jsonRpcHandler: JsonRpcHandler,
  toolManager: ToolManager
): void {
  // 处理 tools/list 请求
  jsonRpcHandler.registerRequestHandler("tools/list", async () => {
    const tools = toolManager.listTools();
    return { tools };
  });

  // 处理 tools/call 请求
  jsonRpcHandler.registerRequestHandler("tools/call", async (params) => {
    const name = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) ?? {};

    if (!name) {
      return createToolError("缺少工具名称");
    }

    return toolManager.callTool(name, args);
  });
}
