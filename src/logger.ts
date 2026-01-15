/**
 * @fileoverview 日志工具
 * @description 在 stdio 模式下将日志输出到 stderr，避免干扰 JSON-RPC 通信
 */

// 保存原始的 console.log
const originalConsoleLog = console.log.bind(console);
const originalConsoleWarn = console.warn.bind(console);

/**
 * 启用 stdio 模式
 * 将 console.log 和 console.warn 重定向到 stderr
 * 这样可以避免日志干扰 JSON-RPC 通信
 */
export function enableStdioMode(): void {
  // 重定向 console.log 到 stderr
  console.log = (...args: unknown[]) => {
    process.stderr.write(args.map(formatArg).join(" ") + "\n");
  };
  
  // 重定向 console.warn 到 stderr
  console.warn = (...args: unknown[]) => {
    process.stderr.write("[WARN] " + args.map(formatArg).join(" ") + "\n");
  };
}

/**
 * 禁用 stdio 模式
 * 恢复 console.log 和 console.warn 的原始行为
 */
export function disableStdioMode(): void {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
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
