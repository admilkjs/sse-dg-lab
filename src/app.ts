/**
 * @fileoverview 应用初始化模块
 * @description 封装应用的初始化逻辑，包括依赖注入和模块组装
 */

import { loadConfig, getEffectiveIP, getLocalIP, type ServerConfig } from "./config";
import { createServer, broadcastNotification, type MCPServer } from "./server";
import { registerMCPProtocol } from "./mcp-protocol";
import { ToolManager, registerToolHandlers } from "./tool-manager";
import { SessionManager } from "./session-manager";
import { DGLabWSServer } from "./ws-server";
import { registerDeviceTools } from "./tools/device-tools";
import { registerControlTools } from "./tools/control-tools";
import { getWaveformTools, initWaveformStorage } from "./tools/waveform-tools";
import { WaveformStorage, loadWaveforms } from "./waveform-storage";

/**
 * 应用实例，包含所有核心组件的引用
 */
export interface App {
  config: ServerConfig;
  server: MCPServer;
  toolManager: ToolManager;
  sessionManager: SessionManager;
  wsServer: DGLabWSServer;
  waveformStorage: WaveformStorage;
  shutdown: () => Promise<void>;
}

/**
 * 创建并初始化应用
 * 
 * 这个函数负责：
 * 1. 加载配置
 * 2. 创建各个核心组件
 * 3. 注册工具和协议处理器
 * 4. 设置组件间的回调关系
 * 
 * @returns 初始化完成的应用实例
 */
export function createApp(): App {
  // 加载配置
  const config = loadConfig();
  
  // 打印配置信息
  printConfigInfo(config);

  // 创建 MCP SSE 的 HTTP 服务器
  const server = createServer(config);

  // 创建工具管理器
  const toolManager = new ToolManager(() => {
    broadcastNotification(server, "notifications/tools/list_changed");
  });

  // 创建会话管理器（仅内存，配置化超时）
  const sessionManager = new SessionManager(
    config.connectionTimeoutMinutes,
    config.reconnectionTimeoutMinutes
  );
  console.log(`[会话] 仅内存模式（连接超时: ${config.connectionTimeoutMinutes} 分钟，重连超时: ${config.reconnectionTimeoutMinutes} 分钟，活跃超时: 1 小时）`);

  // 创建 WebSocket 服务器
  const wsServer = createWSServer(config, sessionManager);

  // 初始化波形存储
  const waveformStorage = initWaveforms(config);

  // 注册协议和工具
  registerProtocolAndTools(server, toolManager, sessionManager, wsServer, config);

  // 创建关闭函数
  const shutdown = async () => {
    console.log("\n[服务器] 正在关闭...");
    wsServer.stop();
    sessionManager.stopCleanupTimer();
    sessionManager.clearAll();
    await server.stop();
    console.log("[服务器] 已停止");
  };

  return {
    config,
    server,
    toolManager,
    sessionManager,
    wsServer,
    waveformStorage,
    shutdown,
  };
}

/**
 * 打印配置信息
 */
function printConfigInfo(config: ServerConfig): void {
  console.log("=".repeat(50));
  console.log("DG-LAB MCP SSE 服务器");
  console.log("=".repeat(50));
  console.log(`[配置] 端口: ${config.port}`);
  console.log(`[配置] SSE 路径: ${config.ssePath}`);
  console.log(`[配置] POST 路径: ${config.postPath}`);
  
  const effectiveIP = getEffectiveIP(config);
  const localIP = getLocalIP();
  console.log(`[配置] 本地 IP: ${localIP}`);
  console.log(`[配置] 公网 IP: ${config.publicIp || "(未设置)"}`);
  console.log(`[配置] 实际使用 IP: ${effectiveIP}`);
}

/**
 * 创建 WebSocket 服务器并设置回调
 */
function createWSServer(config: ServerConfig, sessionManager: SessionManager): DGLabWSServer {
  return new DGLabWSServer({
    heartbeatInterval: config.heartbeatInterval,
    onStrengthUpdate: (controllerId, a, b, limitA, limitB) => {
      console.log(`[WS] ${controllerId} 强度: A=${a}/${limitA}, B=${b}/${limitB}`);
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
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        sessionManager.updateConnectionState(session.deviceId, {
          boundToApp: !!appId,
          targetId: appId,
        });
        // 绑定 APP 时取消连接超时计时器
        if (appId) {
          sessionManager.onAppBound(session.deviceId);
        }
      }
    },
    onControllerDisconnect: (controllerId) => {
      console.log(`[WS] 控制器断开: ${controllerId}`);
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        // 使用 handleDisconnection 处理断开逻辑
        // 这会根据绑定状态决定是保留会话等待重连还是立即删除
        sessionManager.handleDisconnection(session.deviceId);
      }
    },
    onAppDisconnect: (appId) => {
      console.log(`[WS] APP 断开: ${appId}`);
      const sessions = sessionManager.listSessions();
      for (const session of sessions) {
        if (session.targetId === appId) {
          // APP 断开时，更新状态
          // 注意：控制器可能还在连接，所以只更新 boundToApp 和 targetId
          sessionManager.updateConnectionState(session.deviceId, {
            boundToApp: false,
            targetId: null,
          });
        }
      }
    },
  });
}

/**
 * 初始化波形存储
 */
function initWaveforms(config: ServerConfig): WaveformStorage {
  const waveformStorage = new WaveformStorage();
  if (loadWaveforms(waveformStorage, config.waveformStorePath)) {
    console.log(`[波形] 从磁盘加载了 ${waveformStorage.list().length} 个波形`);
  }
  initWaveformStorage(waveformStorage, config.waveformStorePath);
  return waveformStorage;
}

/**
 * 注册 MCP 协议和所有工具
 */
function registerProtocolAndTools(
  server: MCPServer,
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer,
  config: ServerConfig
): void {
  // 注册 MCP 协议处理函数
  registerMCPProtocol(server.jsonRpcHandler, () => {
    console.log("[MCP] 客户端已初始化");
  });

  // 注册工具处理函数
  registerToolHandlers(server.jsonRpcHandler, toolManager);

  // 注册设备工具
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
}

/**
 * 启动应用
 * 
 * 启动 HTTP 服务器并附加 WebSocket 服务器。
 * 在 stdio 模式下，WebSocket 服务器独立启动。
 * 
 * @param app - 应用实例
 */
export async function startApp(app: App): Promise<void> {
  // 启动 HTTP 服务器（或 stdio 桥接）
  await app.server.start();

  // 将 WebSocket 服务器附加到 HTTP 服务器或独立启动
  if (app.server.httpServer) {
    // SSE/HTTP 模式：附加到 HTTP 服务器，共享端口
    app.wsServer.attachToServer(app.server.httpServer, app.config.port);
  } else {
    // stdio 模式：独立启动 WebSocket 服务器
    app.wsServer.start(app.config.port);
  }

  // 打印就绪信息
  console.log("=".repeat(50));
  console.log("服务器就绪");
  if (app.server.httpServer) {
    console.log(`SSE: http://localhost:${app.config.port}${app.config.ssePath}`);
    console.log(`POST: http://localhost:${app.config.port}${app.config.postPath}`);
    console.log(`HTTP RPC: http://localhost:${app.config.port}${app.config.rpcPath}`);
    console.log(`WebSocket: ws://localhost:${app.config.port}`);
  } else {
    console.log("运行模式: stdio（使用 stdin/stdout 进行 MCP 通信）");
    console.log(`WebSocket: ws://localhost:${app.config.port}`);
  }
  console.log("=".repeat(50));
}
