/**
 * @fileoverview JSON-RPC 处理器
 * @description 处理 JSON-RPC 2.0 请求并路由到相应的处理函数
 */

import type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcError,
} from "./types/jsonrpc";
import {
  JSON_RPC_ERRORS,
  deserialize,
  createSuccessResponse,
  createErrorResponse,
  isJsonRpcRequest,
  isJsonRpcNotification,
} from "./types/jsonrpc";

/**
 * 请求处理函数类型
 * @param params - 请求参数
 * @returns 处理结果
 */
export type RequestHandler = (
  params: Record<string, unknown> | undefined
) => Promise<unknown>;

/**
 * 通知处理函数类型
 * @param params - 通知参数
 */
export type NotificationHandler = (
  params: Record<string, unknown> | undefined
) => Promise<void>;

/**
 * JSON-RPC 处理器选项
 */
export interface JsonRpcHandlerOptions {
  /** 请求回调 */
  onRequest?: (method: string, params?: Record<string, unknown>) => void;
  /** 通知回调 */
  onNotification?: (method: string, params?: Record<string, unknown>) => void;
  /** 错误回调 */
  onError?: (error: JsonRpcError) => void;
}

/**
 * JSON-RPC 处理器类
 * @description 管理请求和通知的处理函数，处理 JSON-RPC 消息
 */
export class JsonRpcHandler {
  private requestHandlers: Map<string, RequestHandler> = new Map();
  private notificationHandlers: Map<string, NotificationHandler> = new Map();
  private options: JsonRpcHandlerOptions;

  /**
   * 创建 JSON-RPC 处理器
   * @param options - 处理器选项
   */
  constructor(options: JsonRpcHandlerOptions = {}) {
    this.options = options;
  }

  /**
   * 注册请求处理函数
   * @param method - 方法名
   * @param handler - 处理函数
   */
  registerRequestHandler(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  /**
   * 注册通知处理函数
   * @param method - 方法名
   * @param handler - 处理函数
   */
  registerNotificationHandler(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * 处理 JSON-RPC 消息
   * @param data - JSON 字符串
   * @returns 响应对象（通知返回 null）
   */
  async handleMessage(data: string): Promise<JsonRpcResponse | null> {
    const parseResult = deserialize(data);

    if (!parseResult.success) {
      const error = parseResult.error!;
      this.options.onError?.(error);
      return createErrorResponse(null, error.code, error.message, error.data);
    }

    const message = parseResult.message!;

    // 处理请求（有 id）
    if (isJsonRpcRequest(message)) {
      return this.handleRequest(message);
    }

    // 处理通知（无 id）
    if (isJsonRpcNotification(message)) {
      await this.handleNotification(message);
      return null; // 通知不返回响应
    }

    // 无效的消息类型
    const error: JsonRpcError = {
      code: JSON_RPC_ERRORS.INVALID_REQUEST,
      message: "无效请求: 不是有效的请求或通知",
    };
    this.options.onError?.(error);
    return createErrorResponse(null, error.code, error.message);
  }

  /**
   * 处理请求
   * @param request - 请求对象
   * @returns 响应对象
   */
  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.options.onRequest?.(request.method, request.params);

    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
      const error: JsonRpcError = {
        code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        message: `方法未找到: ${request.method}`,
      };
      this.options.onError?.(error);
      return createErrorResponse(request.id, error.code, error.message);
    }

    try {
      const result = await handler(request.params);
      return createSuccessResponse(request.id, result);
    } catch (err) {
      const error: JsonRpcError = {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : "内部错误",
      };
      this.options.onError?.(error);
      return createErrorResponse(request.id, error.code, error.message);
    }
  }

  /**
   * 处理通知
   * @param notification - 通知对象
   */
  private async handleNotification(notification: JsonRpcNotification): Promise<void> {
    this.options.onNotification?.(notification.method, notification.params);

    const handler = this.notificationHandlers.get(notification.method);
    if (handler) {
      try {
        await handler(notification.params);
      } catch (err) {
        // 通知不返回错误，但可以记录
        const error: JsonRpcError = {
          code: JSON_RPC_ERRORS.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : "内部错误",
        };
        this.options.onError?.(error);
      }
    }
    // 如果没有处理函数，静默忽略（符合 JSON-RPC 规范）
  }

  /**
   * 验证请求参数
   * @param id - 请求 ID
   * @param params - 参数
   * @param required - 必需参数列表
   * @returns 验证失败返回错误响应，成功返回 null
   */
  validateParams(
    id: string | number,
    params: Record<string, unknown> | undefined,
    required: string[]
  ): JsonRpcResponse | null {
    if (!params && required.length > 0) {
      return createErrorResponse(
        id,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        `缺少必需参数: ${required.join(", ")}`
      );
    }

    const missing = required.filter((key) => params?.[key] === undefined);
    if (missing.length > 0) {
      return createErrorResponse(
        id,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        `缺少必需参数: ${missing.join(", ")}`
      );
    }

    return null;
  }
}
