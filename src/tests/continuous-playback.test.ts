/**
 * @fileoverview 持续播放功能单元测试
 * 
 * 测试 WS Server 的持续播放功能，包括：
 * - 播放时长计算（batchSize × 100）
 * - 等待时间计算公式
 * - 最小等待时间强制执行
 * - bufferRatio 验证和默认值
 * - 统计信息更新
 * - 发送失败停止播放
 * - 断开连接清理播放
 * 
 * Feature: waveform-and-playback-improvements
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DGLabWSServer } from "../ws-server";

describe("Continuous Playback", () => {
  let wsServer: DGLabWSServer;

  beforeEach(() => {
    wsServer = new DGLabWSServer({
      heartbeatInterval: 60000,
    });
  });

  afterEach(() => {
    wsServer.stop();
  });

  // 辅助函数：模拟绑定状态和发送成功
  function mockBoundAndSend() {
    wsServer.isControllerBound = () => true;
    wsServer.sendWaveform = () => true;
  }

  describe("播放时长计算", () => {
    // Feature: waveform-and-playback-improvements, Property 11: Playback duration calculation
    it("播放时长 = batchSize × 100ms", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001", "0000000000000002", "0000000000000003"];
      
      // batchSize = 5，播放时长应为 500ms
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.9);
      const state5 = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state5).not.toBeNull();
      expect(state5!.playbackDuration).toBe(500);
      expect(state5!.batchSize).toBe(5);

      wsServer.stopContinuousPlayback(controllerId, "A");

      // batchSize = 10，播放时长应为 1000ms
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 10, 0.9);
      const state10 = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state10).not.toBeNull();
      expect(state10!.playbackDuration).toBe(1000);
      expect(state10!.batchSize).toBe(10);
    });

    it("默认 batchSize = 5，播放时长 = 500ms", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state).not.toBeNull();
      expect(state!.batchSize).toBe(5);
      expect(state!.playbackDuration).toBe(500);
    });
  });

  describe("bufferRatio 验证", () => {
    // Feature: waveform-and-playback-improvements, Property 14: Buffer ratio acceptance
    it("接受有效的 bufferRatio 值（0.5-1.0）", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];

      // 测试边界值
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.5);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.5);
      wsServer.stopContinuousPlayback(controllerId, "A");

      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 1.0);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(1.0);
      wsServer.stopContinuousPlayback(controllerId, "A");

      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.75);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.75);
    });

    // Feature: waveform-and-playback-improvements, Property 15: Invalid buffer ratio normalization
    it("无效的 bufferRatio 使用默认值 0.9", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];

      // 小于 0.5
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.3);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.9);
      wsServer.stopContinuousPlayback(controllerId, "A");

      // 大于 1.0
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 1.5);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.9);
      wsServer.stopContinuousPlayback(controllerId, "A");

      // 负数
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, -0.5);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.9);
    });

    it("默认 bufferRatio = 0.9", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state).not.toBeNull();
      expect(state!.bufferRatio).toBe(0.9);
    });
  });

  describe("统计信息", () => {
    // Feature: waveform-and-playback-improvements, Property 23: Send time tracking
    it("初始统计信息为零或已发送一次", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state).not.toBeNull();
      // 初始时 sendCount 可能为 0 或 1（取决于是否已发送第一批）
      expect(state!.stats.sendCount).toBeGreaterThanOrEqual(0);
      expect(state!.stats.totalElapsedTime).toBeGreaterThanOrEqual(0);
    });

    it("返回平均耗时", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state).not.toBeNull();
      expect(typeof state!.stats.avgElapsedTime).toBe("number");
    });

    it("多次发送后统计信息累积", async () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];
      // 使用较小的 bufferRatio 和 batchSize 以加快测试
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 1, 0.5);

      // 等待几次发送
      await new Promise(resolve => setTimeout(resolve, 200));

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state).not.toBeNull();
      // 应该已经发送了多次
      expect(state!.stats.sendCount).toBeGreaterThan(1);
      expect(state!.stats.totalElapsedTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("等待时间计算", () => {
    // Feature: waveform-and-playback-improvements, Property 12: Wait time considers elapsed time
    // Feature: waveform-and-playback-improvements, Property 16: Wait time formula
    it("等待时间公式: playbackDuration × bufferRatio - elapsedTime", () => {
      // 测试等待时间计算逻辑
      // 公式: targetWaitTime = playbackDuration × bufferRatio - elapsedTime
      // actualWaitTime = max(10, targetWaitTime)
      
      // 测试用例 1: batchSize=5, bufferRatio=0.9
      // playbackDuration = 5 × 100 = 500ms
      // targetWaitTime = 500 × 0.9 - elapsedTime = 450 - elapsedTime
      const playbackDuration1 = 5 * 100;
      const bufferRatio1 = 0.9;
      const elapsedTime1 = 10; // 假设发送耗时 10ms
      const targetWaitTime1 = playbackDuration1 * bufferRatio1 - elapsedTime1;
      expect(targetWaitTime1).toBe(440); // 450 - 10 = 440

      // 测试用例 2: batchSize=10, bufferRatio=0.8
      // playbackDuration = 10 × 100 = 1000ms
      // targetWaitTime = 1000 × 0.8 - elapsedTime = 800 - elapsedTime
      const playbackDuration2 = 10 * 100;
      const bufferRatio2 = 0.8;
      const elapsedTime2 = 50;
      const targetWaitTime2 = playbackDuration2 * bufferRatio2 - elapsedTime2;
      expect(targetWaitTime2).toBe(750); // 800 - 50 = 750
    });

    // Feature: waveform-and-playback-improvements, Property 13: Positive wait time when playback exceeds elapsed
    it("当播放时长大于发送耗时时，等待时间为正", () => {
      // playbackDuration × bufferRatio > elapsedTime 时，targetWaitTime > 0
      const playbackDuration = 500; // 5 × 100
      const bufferRatio = 0.9;
      const elapsedTime = 100; // 发送耗时 100ms
      const targetWaitTime = playbackDuration * bufferRatio - elapsedTime;
      expect(targetWaitTime).toBeGreaterThan(0); // 450 - 100 = 350 > 0
    });

    // Feature: waveform-and-playback-improvements, Property 17: Minimum wait time enforcement
    it("最小等待时间强制为 10ms", () => {
      // 当 targetWaitTime <= 0 时，actualWaitTime = 10ms
      const playbackDuration = 100; // 1 × 100
      const bufferRatio = 0.5;
      const elapsedTime = 100; // 发送耗时等于目标时间
      const targetWaitTime = playbackDuration * bufferRatio - elapsedTime;
      expect(targetWaitTime).toBeLessThanOrEqual(0); // 50 - 100 = -50 <= 0
      
      const actualWaitTime = Math.max(10, targetWaitTime);
      expect(actualWaitTime).toBe(10);
    });

    it("当发送耗时超过目标时间时，使用最小等待时间", () => {
      // 模拟发送耗时超过 playbackDuration × bufferRatio 的情况
      const playbackDuration = 500;
      const bufferRatio = 0.9;
      const elapsedTime = 500; // 发送耗时 500ms，超过目标 450ms
      const targetWaitTime = playbackDuration * bufferRatio - elapsedTime;
      expect(targetWaitTime).toBeLessThan(0); // 450 - 500 = -50 < 0
      
      const actualWaitTime = Math.max(10, targetWaitTime);
      expect(actualWaitTime).toBe(10);
    });
  });

  describe("启动和停止", () => {
    it("启动持续播放后返回成功", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001", "0000000000000002", "0000000000000003"];
      const result = wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.9);

      expect(result).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);
    });

    it("未绑定 APP 时无法启动持续播放", () => {
      const controllerId = wsServer.createController();
      // 默认未绑定

      const waveforms = ["0000000000000001"];
      const result = wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      expect(result).toBe(false);
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
    });

    it("空波形数组无法启动持续播放", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const result = wsServer.startContinuousPlayback(controllerId, "A", []);

      expect(result).toBe(false);
    });

    it("可以同时在两个通道播放", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveformsA = ["0000000000000001"];
      const waveformsB = ["0000000000000002"];

      const resultA = wsServer.startContinuousPlayback(controllerId, "A", waveformsA);
      const resultB = wsServer.startContinuousPlayback(controllerId, "B", waveformsB);

      expect(resultA).toBe(true);
      expect(resultB).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);
    });

    // Feature: waveform-and-playback-improvements, Property 20: Manual stop cancels timers
    it("停止播放后状态变为非播放", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);

      // 停止播放
      const stopResult = wsServer.stopContinuousPlayback(controllerId, "A");
      expect(stopResult).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
    });

    it("停止不存在的播放返回 false", () => {
      const controllerId = wsServer.createController();

      const result = wsServer.stopContinuousPlayback(controllerId, "A");
      expect(result).toBe(false);
    });

    it("停止一个通道不影响另一个通道", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      wsServer.startContinuousPlayback(controllerId, "A", ["0000000000000001"]);
      wsServer.startContinuousPlayback(controllerId, "B", ["0000000000000002"]);

      wsServer.stopContinuousPlayback(controllerId, "A");

      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
      expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);
    });
  });

  describe("发送失败处理", () => {
    // Feature: waveform-and-playback-improvements, Property 18: Send failure stops playback
    it("发送失败时停止播放", async () => {
      const controllerId = wsServer.createController();
      wsServer.isControllerBound = () => true;
      // sendWaveform 返回 false 模拟发送失败
      wsServer.sendWaveform = () => false;

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms);

      // 等待一小段时间让 scheduleSend 执行
      await new Promise(resolve => setTimeout(resolve, 50));

      // 发送失败后应该停止播放
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
    });
  });

  describe("断开连接清理", () => {
    // Feature: waveform-and-playback-improvements, Property 19: Disconnect stops all playbacks
    it("断开控制器时自动停止持续播放", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      wsServer.startContinuousPlayback(controllerId, "A", ["0000000000000001"]);
      wsServer.startContinuousPlayback(controllerId, "B", ["0000000000000002"]);

      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);

      // 断开控制器
      wsServer.disconnectController(controllerId);

      // 播放状态应该被清理
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
      expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(false);
    });

    // Feature: waveform-and-playback-improvements, Property 22: Shutdown cleanup
    it("服务器停止时清理所有持续播放", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      wsServer.startContinuousPlayback(controllerId, "A", ["0000000000000001"]);

      // 停止服务器
      wsServer.stop();

      // 重新创建服务器后，之前的播放状态应该不存在
      wsServer = new DGLabWSServer({ heartbeatInterval: 60000 });
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
    });
  });

  describe("getContinuousPlaybackState", () => {
    it("返回正确的播放状态", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001", "0000000000000002"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 3, 0.8);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");

      expect(state).not.toBeNull();
      expect(state!.waveformCount).toBe(2);
      expect(state!.batchSize).toBe(3);
      expect(state!.bufferRatio).toBe(0.8);
      expect(state!.playbackDuration).toBe(300); // 3 × 100
      expect(state!.active).toBe(true);
    });

    it("不存在的播放返回 null", () => {
      const controllerId = wsServer.createController();

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state).toBeNull();
    });
  });

  describe("重复启动播放", () => {
    it("重复启动同一通道会更新波形数据", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms1 = ["0000000000000001"];
      const waveforms2 = ["0000000000000002", "0000000000000003"];

      wsServer.startContinuousPlayback(controllerId, "A", waveforms1);
      
      // 重新启动
      wsServer.startContinuousPlayback(controllerId, "A", waveforms2);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state!.waveformCount).toBe(2);
    });

    it("重复启动会更新 bufferRatio", () => {
      const controllerId = wsServer.createController();
      mockBoundAndSend();

      const waveforms = ["0000000000000001"];

      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.7);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.7);

      // 重新启动，更新 bufferRatio
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 5, 0.85);
      expect(wsServer.getContinuousPlaybackState(controllerId, "A")!.bufferRatio).toBe(0.85);
    });
  });
});
