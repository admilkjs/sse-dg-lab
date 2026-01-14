# v1.0.0 - 首次发布 🎉

DG-LAB MCP SSE 服务器的首个正式版本，提供完整的 MCP (Model Context Protocol) 支持，让 AI 助手能够控制 DG-LAB 设备。

## ✨ 核心功能

### MCP SSE 服务器
- 完整实现 MCP 2024-11-05 协议规范
- SSE (Server-Sent Events) 传输层，支持实时双向通信
- JSON-RPC 2.0 消息处理
- 支持工具动态注册和列表变更通知

### WebSocket 桥接
- 直接连接 DG-LAB APP，无需中间服务器
- 自动心跳保活机制
- 支持多设备同时连接
- 实时强度反馈同步

### 设备控制工具 (16 个 MCP 工具)

**设备管理:**
- `dg_create_device` - 创建新设备会话，生成二维码供 APP 扫描
- `dg_list_devices` - 列出所有已连接设备
- `dg_get_device_status` - 获取设备详细状态
- `dg_delete_device` - 删除设备会话

**强度控制:**
- `dg_set_strength` - 设置 A/B 通道强度 (0-200)
- `dg_adjust_strength` - 增量调整强度
- `dg_get_strength` - 获取当前强度值

**波形控制:**
- `dg_send_waveform` - 发送单次波形
- `dg_start_continuous_playback` - 开始持续播放波形
- `dg_stop_continuous_playback` - 停止持续播放
- `dg_get_playback_status` - 获取播放状态

**波形管理:**
- `dg_parse_waveform` - 解析 DungeonLab+pulse 格式波形
- `dg_list_waveforms` - 列出已保存的波形
- `dg_get_waveform` - 获取波形详情
- `dg_delete_waveform` - 删除波形

### 波形系统
- 支持 DungeonLab+pulse 格式解析
- 波形持久化存储 (JSON)
- 自动生成 V3 协议 HEX 波形数据
- 支持多段波形和循环播放

### 会话管理
- 设备别名支持 (大小写不敏感)
- 可配置的连接超时 (默认 5 分钟)
- 活跃超时自动清理 (1 小时)
- 内存存储，重启后自动清理

## 🔧 配置选项

通过环境变量配置:

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3323 | 服务器端口 |
| `PUBLIC_IP` | (自动检测) | 公网 IP，用于生成二维码 |
| `SSE_PATH` | /sse | SSE 端点路径 |
| `POST_PATH` | /message | POST 端点路径 |
| `CONNECTION_TIMEOUT_MINUTES` | 5 | 未绑定设备的超时时间 |
| `HEARTBEAT_INTERVAL` | 30000 | WebSocket 心跳间隔 (ms) |
| `WAVEFORM_STORE_PATH` | ./data/waveforms.json | 波形存储路径 |

## 📦 安装

```bash
# 全局安装
npm install -g dg-lab-mcp-server

# 或使用 npx 直接运行
npx dg-lab-mcp-server
```

## 🚀 使用方式

### 作为独立服务器
```bash
# 设置环境变量 (可选)
export PUBLIC_IP=your.public.ip
export PORT=3323

# 启动服务器
dg-lab-mcp-server
```

### 配置 MCP 客户端

在 Claude Desktop 或其他 MCP 客户端中添加:

```json
{
  "mcpServers": {
    "dg-lab": {
      "command": "npx",
      "args": ["dg-lab-mcp-server"],
      "env": {
        "PUBLIC_IP": "your.public.ip"
      }
    }
  }
}
```

## 🔗 连接流程

1. 启动服务器
2. 调用 `dg_create_device` 创建设备
3. 使用返回的二维码内容在 DG-LAB APP 中扫描
4. APP 连接后即可使用控制工具

## 📋 系统要求

- Node.js >= 18.0.0
- DG-LAB APP (支持 V3 协议)

## 🧪 测试

项目包含 161 个测试用例，覆盖:
- JSON-RPC 消息处理
- 会话管理
- 波形解析
- 工具功能
- 属性测试 (Property-Based Testing)

## 📄 许可证

MIT License
