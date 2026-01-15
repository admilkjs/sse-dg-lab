# DG-LAB MCP SSE Server

基于 MCP (Model Context Protocol) 的 DG-LAB 设备控制服务器，支持通过 AI 助手控制 DG-LAB 设备。

## 功能特性

- **MCP 协议支持**: 通过 SSE (Server-Sent Events) 实现 MCP 协议通信
- **内置 WebSocket 服务器**: 无需外部 WS 后端，直接与 DG-LAB APP 通信
- **单端口设计**: HTTP/SSE 和 WebSocket 共享同一端口
- **波形管理**: 支持解析、保存、发送 DG-LAB 波形数据
- **持续播放**: 支持波形持续循环播放
- **会话管理**: 支持设备别名、多设备管理
- **断线重连**: 设备断开后保留会话，支持在超时时间内重连而不丢失设置

## 安装

```bash
# 全局安装
npm install -g dg-lab-mcp

# 或使用 npx 直接运行
npx dg-lab-mcp
```

## 快速开始

### 直接运行

```bash
# 使用默认配置
npx dg-lab-mcpr

# 设置公网 IP
PUBLIC_IP=1.2.3.4 npx dg-lab-mcpr

# 设置端口
PORT=8080 npx dg-lab-mcpr
```

### 配置 MCP 客户端

在 Claude Desktop 或其他 MCP 客户端的配置文件中添加：

```json
{
  "mcpServers": {
    "dg-lab": {
      "command": "npx",
      "args": ["dg-lab-mcpr"],
      "env": {
        "PUBLIC_IP": "你的公网IP"
      }
    }
  }
}
```

**Windows 配置文件位置**: `%APPDATA%\Claude\claude_desktop_config.json`

**macOS 配置文件位置**: `~/Library/Application Support/Claude/claude_desktop_config.json`

### 完整配置示例

```json
{
  "mcpServers": {
    "dg-lab": {
      "command": "npx",
      "args": ["dg-lab-mcpr"],
      "env": {
        "PUBLIC_IP": "your.public.ip",
        "PORT": "3323",
        "CONNECTION_TIMEOUT_MINUTES": "10",
        "RECONNECTION_TIMEOUT_MINUTES": "5",
        "MCP_TRANSPORT": "sse" // 可选: sse | http | stdio
      }
    }
  }
}
```

## 环境变量

通过环境变量配置服务器：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3323 | 服务端口 (HTTP/WebSocket 共享) |
| `PUBLIC_IP` | (自动检测) | 公网 IP 地址，用于生成二维码。留空则使用本地 IP |
| `MCP_TRANSPORT` | sse | MCP 传输模式：`sse`(默认 SSE+POST)、`http`(纯 HTTP JSON-RPC)、`stdio`(标准输入输出，适合 npm 包内嵌) |
| `SSE_PATH` | /sse | SSE 端点路径 |
| `POST_PATH` | /message | POST 端点路径 |
| `HTTP_RPC_PATH` | /rpc | `http` 模式下的 JSON-RPC 路径 |
| `CONNECTION_TIMEOUT_MINUTES` | 5 | 未绑定设备的超时时间（分钟） |
| `RECONNECTION_TIMEOUT_MINUTES` | 5 | 已绑定设备断开后的重连等待时间（分钟），超时后会话将被删除 |
| `HEARTBEAT_INTERVAL` | 30000 | WebSocket 心跳间隔 (ms) |
| `STALE_DEVICE_TIMEOUT` | 3600000 | 设备活跃超时 (ms)，默认 1 小时 |
| `WAVEFORM_STORE_PATH` | ./data/waveforms.json | 波形存储路径 |

### 传输模式说明

- `sse`（默认）：Claude/HTTP 客户端使用 SSE + POST，保持原有行为。
- `http`：纯 HTTP JSON-RPC，同步响应，适合不需要 SSE 的客户端。
- `stdio`：从 stdin 读取 JSON-RPC，每行一条；有响应则写回 stdout（无需 HTTP 端口），便于作为 npm 包嵌入 MCP。

## 会话管理机制

### 连接超时 (CONNECTION_TIMEOUT_MINUTES)
- 创建设备后，如果在指定时间内未完成 APP 绑定，会话将自动销毁
- 默认 5 分钟，可通过环境变量配置

### 重连超时 (RECONNECTION_TIMEOUT_MINUTES)
- 已绑定的设备断开连接后，会话会保留一段时间等待重连
- 在此期间设备可以重新连接而不丢失设置（强度、波形等）
- 超时后会话将被自动删除
- 默认 5 分钟，可通过环境变量配置
- **注意**: 未绑定的设备断开后会立即删除，不会等待重连

### 状态查询
- 使用 `dg_list_devices` 可以看到设备的连接状态和剩余重连时间
- 使用 `dg_get_device_status` 可以获取详细的连接信息，包括 `disconnectedAt` 和 `reconnectionTimeRemaining`

## 使用流程

1. **创建设备**: 调用 `dg_create_device` 获取二维码内容
2. **扫码绑定**: 用户使用 DG-LAB APP 扫描二维码
3. **检查状态**: 调用 `dg_get_device_status` 确认 `boundToApp: true`
4. **控制设备**: 使用强度控制或波形控制工具

## 可用工具 (16 个)

### 设备管理
| 工具 | 说明 |
|------|------|
| `dg_create_device` | 创建新设备会话，返回二维码内容 |
| `dg_list_devices` | 列出所有设备及状态 |
| `dg_get_device_status` | 获取指定设备的详细状态 |
| `dg_delete_device` | 删除设备会话 |

### 强度控制
| 工具 | 说明 |
|------|------|
| `dg_set_strength` | 设置 A/B 通道强度 (0-200) |
| `dg_adjust_strength` | 增量调整强度 |
| `dg_get_strength` | 获取当前强度值 |

### 波形控制
| 工具 | 说明 |
|------|------|
| `dg_send_waveform` | 发送单次波形 |
| `dg_start_continuous_playback` | 开始持续播放波形 |
| `dg_stop_continuous_playback` | 停止持续播放 |
| `dg_get_playback_status` | 获取播放状态 |

### 波形管理
| 工具 | 说明 |
|------|------|
| `dg_parse_waveform` | 解析 DungeonLab+pulse 格式波形并保存 |
| `dg_list_waveforms` | 列出所有已保存的波形 |
| `dg_get_waveform` | 获取波形详情和 hexWaveforms |
| `dg_delete_waveform` | 删除已保存的波形 |

## 开发

### 从源码运行

```bash
# 克隆仓库
git clone https://github.com/admilkjs/sse-dg-lab.git
cd sse-dg-lab/dg-lab-mcp-server

# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 运行测试
bun test
```

### 项目结构

```
src/
├── index.ts           # 入口文件
├── cli.ts             # CLI 入口 (npx)
├── app.ts             # 应用初始化
├── config.ts          # 配置管理
├── server.ts          # HTTP/SSE 服务器
├── ws-server.ts       # WebSocket 服务器
├── session-manager.ts # 会话管理
├── tool-manager.ts    # MCP 工具管理
├── waveform-parser.ts # 波形解析
├── waveform-storage.ts # 波形存储
└── tools/
    ├── device-tools.ts   # 设备管理工具
    ├── control-tools.ts  # 设备控制工具
    └── waveform-tools.ts # 波形管理工具
```

## 许可证

MIT

## 声明

本项目基于 [DG-LAB 开源协议](https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE) 实现设备通信功能。DG-LAB 开源协议仅供爱好者自由使用设备，未经授权请勿将相关内容用于任何商业用途。
