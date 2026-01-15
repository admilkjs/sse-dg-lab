/**
 * @fileoverview 日志模块
 * @description 轻量级日志工具，支持 stdio 模式下输出到 stderr
 */

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 日志级别优先级 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 是否启用 stdio 模式 */
let stdioMode = false;

/** 当前日志级别 */
let currentLevel: LogLevel = "info";

// 保存原始的 console 方法
const originalConsoleLog = console.log.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * 获取当前日志级别
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * 启用 stdio 模式
 * 将日志输出重定向到 stderr，避免干扰 JSON-RPC 通信
 */
export function enableStdioMode(): void {
  if (stdioMode) return;
  stdioMode = true;
  
  // 重定向 console.log 到 stderr
  console.log = (...args: unknown[]) => {
    process.stderr.write(formatLog("INFO", args) + "\n");
  };
  
  // 重定向 console.warn 到 stderr
  console.warn = (...args: unknown[]) => {
    process.stderr.write(formatLog("WARN", args) + "\n");
  };
  
  // console.error 本来就输出到 stderr，但统一格式
  console.error = (...args: unknown[]) => {
    process.stderr.write(formatLog("ERROR", args) + "\n");
  };
}

/**
 * 禁用 stdio 模式
 * 恢复 console 方法的原始行为（主要用于测试）
 */
export function disableStdioMode(): void {
  if (!stdioMode) return;
  stdioMode = false;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}

/**
 * 检查是否处于 stdio 模式
 */
export function isStdioMode(): boolean {
  return stdioMode;
}

/**
 * 格式化日志输出
 */
function formatLog(level: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args.map(formatArg).join(" ");
  return `${timestamp} [${level}] ${message}`;
}

/**
 * 格式化参数为字符串
 */
function formatArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * 日志记录器
 * 提供类似 pino/winston 的 API，但零依赖
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
      if (stdioMode) {
        process.stderr.write(formatLog("DEBUG", args) + "\n");
      } else {
        originalConsoleLog("[DEBUG]", ...args);
      }
    }
  },
  
  info: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
      if (stdioMode) {
        process.stderr.write(formatLog("INFO", args) + "\n");
      } else {
        originalConsoleLog("[INFO]", ...args);
      }
    }
  },
  
  warn: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
      if (stdioMode) {
        process.stderr.write(formatLog("WARN", args) + "\n");
      } else {
        originalConsoleWarn("[WARN]", ...args);
      }
    }
  },
  
  error: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.error) {
      if (stdioMode) {
        process.stderr.write(formatLog("ERROR", args) + "\n");
      } else {
        originalConsoleError("[ERROR]", ...args);
      }
    }
  },
};
