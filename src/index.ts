/**
 * @fileoverview DG-LAB MCP SSE 服务器入口
 * @description 主入口文件，初始化并启动 MCP 服务器
 * 包含内置 WebSocket 服务器用于 DG-LAB APP 连接
 * 会话仅存储在内存中（1 小时 TTL）
 */

import { loadConfig } from "./config";
import { createServer, broadcastNotification } from "./server";
import { registerMCPProtocol } from "./mcp-protocol";
import { ToolManager, registerToolHandlers } from "./tool-manager";
import { SessionManager } from "./session-manager";
import { DGLabWSServer } from "./ws-server";
import { registerDeviceTools } from "./tools/device-tools";
import { registerControlTools } from "./tools/control-tools";
import { getWaveformTools, initWaveformStorage } from "./tools/waveform-tools";
import { WaveformStorage, loadWaveforms } from "./waveform-storage";

/**
 * 主函数
 */
async function main() {
  console.log("=".repeat(50));
  console.log("DG-LAB MCP SSE 服务器");
  console.log("=".repeat(50));

  // 加载配置
  const config = loadConfig();
  console.log(`[配置] HTTP 端口: ${config.port}`);
  console.log(`[配置] WS 端口: ${config.wsPort}`);
  console.log(`[配置] SSE 路径: ${config.ssePath}`);
  console.log(`[配置] POST 路径: ${config.postPath}`);

  // 创建 MCP SSE 的 HTTP 服务器
  const server = createServer(config);

  // 创建工具管理器
  const toolManager = new ToolManager(() => {
    broadcastNotification(server, "notifications/tools/list_changed");
  });

  // 创建会话管理器（仅内存，1 小时 TTL）
  const sessionManager = new SessionManager();
  console.log("[会话] 仅内存模式（1 小时 TTL）");

  // 创建 WebSocket 服务器（自托管，替代外部 WS 后端）
  const wsServer = new DGLabWSServer({
    port: config.wsPort,
    heartbeatInterval: config.heartbeatInterval,
    onStrengthUpdate: (controllerId, a, b, limitA, limitB) => {
      console.log(`[WS] ${controllerId} 强度: A=${a}/${limitA}, B=${b}/${limitB}`);
      // 更新会话管理器中的强度信息
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        sessionManager.updateStrength(session.deviceId, a, b, limitA, limitB);
      }
    },
    onFeedback: (controllerId, index) => {
      console.log(`[WS] ${controllerId} 反馈: ${index}`);
    },
    onBindChange: (controllerId, appId) => {
      console.log(`[WS] ${controllerId} 绑定: ${appId || "已解绑"}`);
      // 更新会话管理器中的绑定状态
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        sessionManager.updateConnectionState(session.deviceId, {
          boundToApp: !!appId,
          targetId: appId,
        });
      }
    },
  });

  // 启动 WebSocket 服务器
  wsServer.start();
  console.log(`[WS 服务器] 监听端口 ${config.wsPort}`);

  // 初始化波形存储（持久化到磁盘以便使用）
  const waveformStorage = new WaveformStorage();
  if (loadWaveforms(waveformStorage, config.waveformStorePath)) {
    console.log(`[波形] 从磁盘加载了 ${waveformStorage.list().length} 个波形`);
  }
  initWaveformStorage(waveformStorage, config.waveformStorePath);

  // 注册 MCP 协议处理函数
  registerMCPProtocol(server.jsonRpcHandler, () => {
    console.log("[MCP] 客户端已初始化");
  });

  // 注册工具处理函数
  registerToolHandlers(server.jsonRpcHandler, toolManager);

  // 注册设备工具（现在使用 wsServer 而不是 wsBridge）
  registerDeviceTools(toolManager, sessionManager, wsServer);
  console.log("[工具] 设备工具已注册");

  // 注册控制工具（现在使用 wsServer 而不是 wsBridge）
  registerControlTools(toolManager, sessionManager, wsServer);
  console.log("[工具] 控制工具已注册");

  // 注册波形工具
  const waveformTools = getWaveformTools();
  for (const tool of waveformTools) {
    toolManager.registerTool(tool.name, tool.description, tool.inputSchema, tool.handler);
  }
  console.log("[工具] 波形工具已注册");
  console.log(`[工具] 总计: ${toolManager.toolCount}`);

  // 优雅关闭
  const shutdown = async () => {
    console.log("\n[服务器] 正在关闭...");
    wsServer.stop();
    sessionManager.stopCleanupTimer();
    sessionManager.clearAll();
    await server.stop();
    console.log("[服务器] 已停止");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 启动 HTTP 服务器
  await server.start();
  console.log("=".repeat(50));
  console.log("服务器就绪");
  console.log(`SSE: http://localhost:${config.port}${config.ssePath}`);
  console.log(`POST: http://localhost:${config.port}${config.postPath}`);
  console.log(`WebSocket: ws://localhost:${config.wsPort}`);
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error("[致命错误]", error);
  process.exit(1);
});
