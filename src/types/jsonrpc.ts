/**
 * @fileoverview JSON-RPC 2.0 类型定义和序列化
 * @description 实现 JSON-RPC 2.0 协议的类型定义、类型守卫和序列化函数
 */

/** JSON-RPC 2.0 标准错误码 */
export const JSON_RPC_ERRORS = {
  /** 解析错误 - 无效的 JSON */
  PARSE_ERROR: -32700,
  /** 无效请求 - JSON 不是有效的请求对象 */
  INVALID_REQUEST: -32600,
  /** 方法未找到 */
  METHOD_NOT_FOUND: -32601,
  /** 无效参数 */
  INVALID_PARAMS: -32602,
  /** 内部错误 */
  INTERNAL_ERROR: -32603,
} as const;

/** JSON-RPC 错误码类型 */
export type JsonRpcErrorCode = (typeof JSON_RPC_ERRORS)[keyof typeof JSON_RPC_ERRORS];

/**
 * JSON-RPC 2.0 错误对象
 */
export interface JsonRpcError {
  /** 错误码 */
  code: number;
  /** 错误消息 */
  message: string;
  /** 附加数据（可选） */
  data?: unknown;
}

/**
 * JSON-RPC 2.0 请求对象
 */
export interface JsonRpcRequest {
  /** 协议版本，必须是 "2.0" */
  jsonrpc: "2.0";
  /** 请求 ID */
  id: string | number;
  /** 方法名 */
  method: string;
  /** 参数（可选） */
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 通知对象（无 id）
 */
export interface JsonRpcNotification {
  /** 协议版本，必须是 "2.0" */
  jsonrpc: "2.0";
  /** 方法名 */
  method: string;
  /** 参数（可选） */
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 成功响应
 */
export interface JsonRpcSuccessResponse {
  /** 协议版本 */
  jsonrpc: "2.0";
  /** 请求 ID */
  id: string | number | null;
  /** 结果 */
  result: unknown;
}

/**
 * JSON-RPC 2.0 错误响应
 */
export interface JsonRpcErrorResponse {
  /** 协议版本 */
  jsonrpc: "2.0";
  /** 请求 ID */
  id: string | number | null;
  /** 错误对象 */
  error: JsonRpcError;
}

/** 响应类型联合 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/** 消息类型联合 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/**
 * 判断是否为 JSON-RPC 请求
 * @param msg - 待检查的消息
 * @returns 是否为请求
 */
export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === "2.0" &&
    "method" in obj &&
    typeof obj.method === "string" &&
    "id" in obj &&
    (typeof obj.id === "string" || typeof obj.id === "number")
  );
}

/**
 * 判断是否为 JSON-RPC 通知
 * @param msg - 待检查的消息
 * @returns 是否为通知
 */
export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === "2.0" &&
    "method" in obj &&
    typeof obj.method === "string" &&
    !("id" in obj)
  );
}

/**
 * 判断是否为 JSON-RPC 响应
 * @param msg - 待检查的消息
 * @returns 是否为响应
 */
export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return obj.jsonrpc === "2.0" && "id" in obj && ("result" in obj || "error" in obj);
}

/**
 * 判断是否为错误响应
 * @param msg - 待检查的消息
 * @returns 是否为错误响应
 */
export function isJsonRpcErrorResponse(msg: unknown): msg is JsonRpcErrorResponse {
  if (!isJsonRpcResponse(msg)) return false;
  return "error" in msg;
}

/**
 * 判断是否为成功响应
 * @param msg - 待检查的消息
 * @returns 是否为成功响应
 */
export function isJsonRpcSuccessResponse(msg: unknown): msg is JsonRpcSuccessResponse {
  if (!isJsonRpcResponse(msg)) return false;
  return "result" in msg;
}

/**
 * 序列化 JSON-RPC 消息
 * @param message - JSON-RPC 消息
 * @returns JSON 字符串
 */
export function serialize(message: JsonRpcMessage): string {
  return JSON.stringify(message);
}

/**
 * 反序列化结果
 */
export interface DeserializeResult {
  /** 是否成功 */
  success: boolean;
  /** 解析后的消息 */
  message?: JsonRpcMessage;
  /** 错误信息 */
  error?: JsonRpcError;
}

/**
 * 反序列化 JSON-RPC 消息
 * @param data - JSON 字符串
 * @returns 反序列化结果
 */
export function deserialize(data: string): DeserializeResult {
  try {
    const parsed = JSON.parse(data);
    
    if (typeof parsed !== "object" || parsed === null) {
      return {
        success: false,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "无效请求: 不是对象",
        },
      };
    }

    if (parsed.jsonrpc !== "2.0") {
      return {
        success: false,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "无效请求: 缺少或无效的 jsonrpc 版本",
        },
      };
    }

    return { success: true, message: parsed as JsonRpcMessage };
  } catch {
    return {
      success: false,
      error: {
        code: JSON_RPC_ERRORS.PARSE_ERROR,
        message: "解析错误: 无效的 JSON",
      },
    };
  }
}

/**
 * 创建成功响应
 * @param id - 请求 ID
 * @param result - 结果
 * @returns 成功响应对象
 */
export function createSuccessResponse(id: string | number | null, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: "2.0", id, result };
}

/**
 * 创建错误响应
 * @param id - 请求 ID
 * @param code - 错误码
 * @param message - 错误消息
 * @param data - 附加数据（可选）
 * @returns 错误响应对象
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

/**
 * 创建通知
 * @param method - 方法名
 * @param params - 参数（可选）
 * @returns 通知对象
 */
export function createNotification(method: string, params?: Record<string, unknown>): JsonRpcNotification {
  const notification: JsonRpcNotification = { jsonrpc: "2.0", method };
  if (params !== undefined) notification.params = params;
  return notification;
}
