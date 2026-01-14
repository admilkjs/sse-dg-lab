/**
 * @fileoverview 配置管理模块
 * 
 * 这个模块负责加载和验证服务器配置。直接从环境变量读取配置，
 * 对于未设置的选项会使用合理的默认值。
 * 
 * 主要功能：
 * - 从环境变量加载配置
 * - 验证配置值的有效性
 * - 提供 IP 地址检测（本地和公网）
 * - 单例模式确保配置一致性
 */

import * as os from "os";
import { ConfigError, ErrorCode } from "./errors";
/**
 * 服务器配置
 * 
 * 包含服务器运行所需的所有配置项。大部分配置都有合理的默认值，
 * 只有在需要自定义时才需要通过环境变量设置。
 */
export interface ServerConfig {
  /** 服务端口，HTTP 和 WebSocket 共用这个端口 */
  port: number;
  /** 公网 IP 地址，用于生成二维码。留空则自动检测本地 IP */
  publicIp: string;
  /** SSE 端点路径，MCP 客户端通过这个路径建立 SSE 连接 */
  ssePath: string;
  /** POST 端点路径，MCP 客户端通过这个路径发送 JSON-RPC 消息 */
  postPath: string;
  /** 会话存储路径（目前未使用，会话仅存内存） */
  sessionStorePath: string;
  /** 波形存储路径，保存用户导入的波形数据 */
  waveformStorePath: string;
  /** 心跳间隔（毫秒），用于保持 WebSocket 连接活跃 */
  heartbeatInterval: number;
  /** 设备过期超时（毫秒），超过这个时间不活跃的设备会被清理 */
  staleDeviceTimeout: number;
  /** 连接超时时间（分钟），会话创建后在此时间内未绑定 APP 则自动销毁 */
  connectionTimeoutMinutes: number;
}

/**
 * 从环境变量读取字符串值
 * 
 * 如果环境变量未设置，返回默认值。这是个简单的辅助函数，
 * 让配置加载代码更清晰。
 */
function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * 从环境变量读取数字值
 * 
 * 如果环境变量未设置，返回默认值。如果设置了但不是有效数字，
 * 会抛出错误提醒用户检查配置。
 * 
 * @throws 当环境变量值不是有效数字时
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigError(`环境变量 ${key} 的值无效: ${value}`, {
      code: ErrorCode.CONFIG_LOAD_FAILED,
      context: { key, value },
    });
  }
  return parsed;
}

/**
 * 加载服务器配置
 * 
 * 从环境变量读取所有配置项，.env 文件在模块加载时已经处理过了。
 * 加载完成后会验证配置的有效性，确保服务器能正常启动。
 * 
 * @returns 完整的服务器配置对象
 */
export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    port: getEnvNumber("PORT", 3323),
    publicIp: getEnvString("PUBLIC_IP", ""),
    ssePath: getEnvString("SSE_PATH", "/sse"),
    postPath: getEnvString("POST_PATH", "/message"),
    sessionStorePath: getEnvString("SESSION_STORE_PATH", "./data/sessions.json"),
    waveformStorePath: getEnvString("WAVEFORM_STORE_PATH", "./data/waveforms.json"),
    heartbeatInterval: getEnvNumber("HEARTBEAT_INTERVAL", 30000),
    staleDeviceTimeout: getEnvNumber("STALE_DEVICE_TIMEOUT", 3600000),
    connectionTimeoutMinutes: getEnvNumber("CONNECTION_TIMEOUT_MINUTES", 5),
  };

  validateConfig(config);
  return config;
}

/**
 * 验证配置有效性
 * 
 * 检查所有配置项是否在合理范围内。对于无效的公网 IP，
 * 会打印警告并回退到本地 IP，而不是直接报错。
 * 
 * @throws 当配置值明显无效时（如端口超出范围）
 */
function validateConfig(config: ServerConfig): void {
  if (config.port < 1 || config.port > 65535) {
    throw new ConfigError(`端口无效: ${config.port}，必须在 1-65535 范围内`, {
      code: ErrorCode.CONFIG_INVALID_PORT,
      context: { port: config.port },
    });
  }

  // 验证公网IP格式（如果提供）
  if (config.publicIp) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(config.publicIp)) {
      console.warn(`[配置] ⚠️ 公网IP格式无效: ${config.publicIp}，将使用本地IP`);
      config.publicIp = ""; // 回退到本地IP
    } else {
      // 验证每个数字段在0-255范围内
      const parts = config.publicIp.split(".");
      if (parts.some(part => parseInt(part, 10) > 255)) {
        console.warn(`[配置] ⚠️ 公网IP格式无效: ${config.publicIp}，每段必须在0-255范围内，将使用本地IP`);
        config.publicIp = ""; // 回退到本地IP
      }
    }
  }

  if (!config.ssePath.startsWith("/")) {
    throw new ConfigError(`SSE 路径无效: ${config.ssePath}，必须以 / 开头`, {
      code: ErrorCode.CONFIG_INVALID_PATH,
      context: { path: config.ssePath, type: 'ssePath' },
    });
  }

  if (!config.postPath.startsWith("/")) {
    throw new ConfigError(`POST 路径无效: ${config.postPath}，必须以 / 开头`, {
      code: ErrorCode.CONFIG_INVALID_PATH,
      context: { path: config.postPath, type: 'postPath' },
    });
  }

  if (config.heartbeatInterval < 1000) {
    throw new ConfigError(`心跳间隔无效: ${config.heartbeatInterval}，必须至少 1000ms`, {
      code: ErrorCode.CONFIG_LOAD_FAILED,
      context: { heartbeatInterval: config.heartbeatInterval },
    });
  }

  if (config.staleDeviceTimeout < 60000) {
    throw new ConfigError(`设备过期超时无效: ${config.staleDeviceTimeout}，必须至少 60000ms`, {
      code: ErrorCode.CONFIG_LOAD_FAILED,
      context: { staleDeviceTimeout: config.staleDeviceTimeout },
    });
  }

  if (config.connectionTimeoutMinutes < 1 || config.connectionTimeoutMinutes > 60) {
    throw new ConfigError(`连接超时时间无效: ${config.connectionTimeoutMinutes}，必须在 1-60 分钟范围内`, {
      code: ErrorCode.CONFIG_LOAD_FAILED,
      context: { connectionTimeoutMinutes: config.connectionTimeoutMinutes },
    });
  }
}

/** 配置单例，确保整个应用使用同一份配置 */
let configInstance: ServerConfig | null = null;

/**
 * 获取配置实例
 * 
 * 使用单例模式，第一次调用时加载配置，后续调用返回同一实例。
 * 这样可以确保整个应用使用一致的配置，避免重复加载。
 */
export function getConfig(): ServerConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * 重置配置实例
 * 
 * 主要用于测试场景，让每个测试用例可以从干净的状态开始。
 * 生产环境一般不需要调用这个函数。
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * 获取本地 IP 地址
 * 
 * 遍历所有网络接口，找到第一个非内部的 IPv4 地址。
 * 这通常是局域网 IP，适合在本地网络中使用。
 * 如果找不到合适的地址，返回 localhost。
 */
export function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 跳过内部地址（如 127.0.0.1）和非 IPv4 地址
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

/**
 * 获取用于生成二维码的 IP 地址
 * 
 * 优先使用配置中的公网 IP，如果没有设置则自动检测本地 IP。
 * 这个函数集中了 IP 地址的获取逻辑，避免在多处重复实现。
 * 
 * @param config - 可选，不传则使用单例配置
 */
export function getEffectiveIP(config?: ServerConfig): string {
  const cfg = config || getConfig();
  return cfg.publicIp || getLocalIP();
}
