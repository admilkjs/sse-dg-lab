/**
 * @fileoverview 日志模块
 * @description 简单的日志工具，支持 stdio 模式下输出到 stderr
 */

/** 是否启用 stdio 模式 */
let stdioMode = false;

// 保存原始的 console 方法
const originalConsoleLog = console.log.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);

/**
 * 启用 stdio 模式
 * 将日志输出重定向到 stderr，避免干扰 JSON-RPC 通信
 */
export function enableStdioMode(): void {
  if (stdioMode) return;
  stdioMode = true;
  
  // 重定向 console.log 到 stderr
  console.log = (...args: unknown[]) => {
    process.stderr.write(args.map(formatArg).join(" ") + "\n");
  };
  
  // 重定向 console.warn 到 stderr
  console.warn = (...args: unknown[]) => {
    process.stderr.write("[WARN] " + args.map(formatArg).join(" ") + "\n");
  };
  
  // console.error 本来就输出到 stderr，但统一格式
  console.error = (...args: unknown[]) => {
    process.stderr.write("[ERROR] " + args.map(formatArg).join(" ") + "\n");
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
