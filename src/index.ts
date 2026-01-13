/**
 * @fileoverview DG-LAB MCP SSE 服务器入口
 * @description 主入口文件，初始化并启动 MCP 服务器
 * HTTP/SSE 和 WebSocket 共享同一端口
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
  console.log(`[配置] 端口: ${config.port}`);
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

  // 创建 WebSocket 服务器（将附加到 HTTP 服务器，共享端口）
  const wsServer = new DGLabWSServer({
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
    onControllerDisconnect: (controllerId) => {
      console.log(`[WS] 控制器断开: ${controllerId}`);
      // 更新会话管理器中的连接状态
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        sessionManager.updateConnectionState(session.deviceId, {
          connected: false,
          boundToApp: false,
          clientId: null,
          targetId: null,
        });
      }
    },
    onAppDisconnect: (appId) => {
      console.log(`[WS] APP 断开: ${appId}`);
      // 查找所有绑定到该 APP 的 session 并更新状态
      const sessions = sessionManager.listSessions();
      for (const session of sessions) {
        if (session.targetId === appId) {
          sessionManager.updateConnectionState(session.deviceId, {
            boundToApp: false,
            targetId: null,
          });
        }
      }
    },
  });

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

  // 注册设备工具（传入公网IP配置）
  registerDeviceTools(toolManager, sessionManager, wsServer, config.publicIp || undefined);
  console.log("[工具] 设备工具已注册");

  // 注册控制工具
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

  // 将 WebSocket 服务器附加到 HTTP 服务器（共享端口）
  if (server.httpServer) {
    wsServer.attachToServer(server.httpServer, config.port);
  } else {
    console.error("[错误] HTTP 服务器未启动，无法附加 WebSocket");
    process.exit(1);
  }

  console.log("=".repeat(50));
  console.log("服务器就绪");
  console.log(`SSE: http://localhost:${config.port}${config.ssePath}`);
  console.log(`POST: http://localhost:${config.port}${config.postPath}`);
  console.log(`WebSocket: ws://localhost:${config.port}`);
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error("[致命错误]", error);
  process.exit(1);
});
