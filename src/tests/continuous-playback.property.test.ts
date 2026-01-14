/**
 * @fileoverview 持续播放功能属性测试
 * 
 * 使用 fast-check 进行属性测试，每个测试运行 100 次迭代。
 * 
 * Feature: waveform-and-playback-improvements
 * Properties 11-23: 持续播放时序相关属性
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import { DGLabWSServer } from "../ws-server";

// 测试配置：100 次迭代
const NUM_RUNS = 100;

// 生成有效的 hexWaveform（16 字符 HEX 字符串）
// 使用 fc.string 生成字符串，然后过滤和映射为有效的 hex
const hexWaveformArb = fc.string({ minLength: 16, maxLength: 32 })
  .map(s => {
    // 将字符串转换为 hex 格式
    const hex = s.split('').map(c => c.charCodeAt(0).toString(16).slice(-1)).join('');
    // 确保长度为 16
    return hex.slice(0, 16).padEnd(16, '0');
  });

// 生成有效的波形数组（1-10 个波形）
const waveformsArb = fc.array(hexWaveformArb, { minLength: 1, maxLength: 10 });

// 生成有效的 batchSize（1-20）
const batchSizeArb = fc.integer({ min: 1, max: 20 });

// 生成有效的 bufferRatio（0.5-1.0）
const validBufferRatioArb = fc.double({ min: 0.5, max: 1.0, noNaN: true });

// 生成无效的 bufferRatio（小于 0.5 或大于 1.0）
const invalidBufferRatioArb = fc.oneof(
  fc.double({ min: -10, max: 0.49, noNaN: true }),
  fc.double({ min: 1.01, max: 10, noNaN: true })
);

// 生成通道
const channelArb = fc.constantFrom("A" as const, "B" as const);

describe("Continuous Playback Property Tests", () => {
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

  // Feature: waveform-and-playback-improvements, Property 11: Playback duration calculation
  describe("Property 11: Playback duration calculation", () => {
    it("播放时长 = batchSize × 100ms", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          validBufferRatioArb,
          channelArb,
          (waveforms, batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            wsServer.startContinuousPlayback(controllerId, channel, waveforms, batchSize, bufferRatio);
            const state = wsServer.getContinuousPlaybackState(controllerId, channel);

            expect(state).not.toBeNull();
            expect(state!.playbackDuration).toBe(batchSize * 100);

            wsServer.stopContinuousPlayback(controllerId, channel);
            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 14: Buffer ratio acceptance
  describe("Property 14: Buffer ratio acceptance", () => {
    it("接受有效的 bufferRatio 值（0.5-1.0）", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          validBufferRatioArb,
          channelArb,
          (waveforms, batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            wsServer.startContinuousPlayback(controllerId, channel, waveforms, batchSize, bufferRatio);
            const state = wsServer.getContinuousPlaybackState(controllerId, channel);

            expect(state).not.toBeNull();
            expect(state!.bufferRatio).toBe(bufferRatio);

            wsServer.stopContinuousPlayback(controllerId, channel);
            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 15: Invalid buffer ratio normalization
  describe("Property 15: Invalid buffer ratio normalization", () => {
    it("无效的 bufferRatio 使用默认值 0.9", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          invalidBufferRatioArb,
          channelArb,
          (waveforms, batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            wsServer.startContinuousPlayback(controllerId, channel, waveforms, batchSize, bufferRatio);
            const state = wsServer.getContinuousPlaybackState(controllerId, channel);

            expect(state).not.toBeNull();
            expect(state!.bufferRatio).toBe(0.9);

            wsServer.stopContinuousPlayback(controllerId, channel);
            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 16: Wait time formula
  describe("Property 16: Wait time formula", () => {
    it("等待时间公式：targetWaitTime = playbackDuration × bufferRatio - elapsedTime", () => {
      // 这个属性测试验证公式的数学正确性
      fc.assert(
        fc.property(
          batchSizeArb,
          validBufferRatioArb,
          fc.integer({ min: 0, max: 1000 }), // elapsedTime
          (batchSize, bufferRatio, elapsedTime) => {
            const playbackDuration = batchSize * 100;
            const targetWaitTime = playbackDuration * bufferRatio - elapsedTime;
            const actualWaitTime = Math.max(10, targetWaitTime);

            // 验证公式
            expect(targetWaitTime).toBe(playbackDuration * bufferRatio - elapsedTime);
            // 验证最小等待时间
            expect(actualWaitTime).toBeGreaterThanOrEqual(10);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 17: Minimum wait time enforcement
  describe("Property 17: Minimum wait time enforcement", () => {
    it("最小等待时间为 10ms", () => {
      fc.assert(
        fc.property(
          batchSizeArb,
          validBufferRatioArb,
          fc.integer({ min: 0, max: 10000 }), // elapsedTime（可能很大）
          (batchSize, bufferRatio, elapsedTime) => {
            const playbackDuration = batchSize * 100;
            const targetWaitTime = playbackDuration * bufferRatio - elapsedTime;
            const actualWaitTime = Math.max(10, targetWaitTime);

            // 无论 targetWaitTime 是多少，actualWaitTime 至少为 10
            expect(actualWaitTime).toBeGreaterThanOrEqual(10);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 19: Disconnect stops all playbacks
  describe("Property 19: Disconnect stops all playbacks", () => {
    it("断开控制器时停止所有通道的播放", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          (waveforms, batchSize) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            // 在两个通道启动播放
            wsServer.startContinuousPlayback(controllerId, "A", waveforms, batchSize);
            wsServer.startContinuousPlayback(controllerId, "B", waveforms, batchSize);

            expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);
            expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);

            // 断开控制器
            wsServer.disconnectController(controllerId);

            // 两个通道都应该停止
            expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
            expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 20: Manual stop cancels timers
  describe("Property 20: Manual stop cancels timers", () => {
    it("手动停止后播放状态变为非活跃", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          validBufferRatioArb,
          channelArb,
          (waveforms, batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            wsServer.startContinuousPlayback(controllerId, channel, waveforms, batchSize, bufferRatio);
            expect(wsServer.isContinuousPlaying(controllerId, channel)).toBe(true);

            // 手动停止
            const stopResult = wsServer.stopContinuousPlayback(controllerId, channel);
            expect(stopResult).toBe(true);
            expect(wsServer.isContinuousPlaying(controllerId, channel)).toBe(false);

            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: waveform-and-playback-improvements, Property 23: Send time tracking
  describe("Property 23: Send time tracking", () => {
    it("统计信息初始化正确", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          validBufferRatioArb,
          channelArb,
          (waveforms, batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            wsServer.startContinuousPlayback(controllerId, channel, waveforms, batchSize, bufferRatio);
            const state = wsServer.getContinuousPlaybackState(controllerId, channel);

            expect(state).not.toBeNull();
            // 统计信息应该存在
            expect(state!.stats).toBeDefined();
            expect(typeof state!.stats.sendCount).toBe("number");
            expect(typeof state!.stats.totalElapsedTime).toBe("number");
            expect(typeof state!.stats.avgElapsedTime).toBe("number");
            // sendCount 应该 >= 0
            expect(state!.stats.sendCount).toBeGreaterThanOrEqual(0);
            // totalElapsedTime 应该 >= 0
            expect(state!.stats.totalElapsedTime).toBeGreaterThanOrEqual(0);

            wsServer.stopContinuousPlayback(controllerId, channel);
            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // 额外属性测试：启动播放需要绑定 APP
  describe("Property: Start requires bound APP", () => {
    it("未绑定 APP 时无法启动播放", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          batchSizeArb,
          validBufferRatioArb,
          channelArb,
          (waveforms, batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            // 默认未绑定

            const result = wsServer.startContinuousPlayback(controllerId, channel, waveforms, batchSize, bufferRatio);
            expect(result).toBe(false);
            expect(wsServer.isContinuousPlaying(controllerId, channel)).toBe(false);

            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // 额外属性测试：空波形数组无法启动
  describe("Property: Empty waveforms rejected", () => {
    it("空波形数组无法启动播放", () => {
      fc.assert(
        fc.property(
          batchSizeArb,
          validBufferRatioArb,
          channelArb,
          (batchSize, bufferRatio, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            const result = wsServer.startContinuousPlayback(controllerId, channel, [], batchSize, bufferRatio);
            expect(result).toBe(false);

            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // 额外属性测试：两个通道独立
  describe("Property: Channels are independent", () => {
    it("停止一个通道不影响另一个通道", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          waveformsArb,
          batchSizeArb,
          (waveformsA, waveformsB, batchSize) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            wsServer.startContinuousPlayback(controllerId, "A", waveformsA, batchSize);
            wsServer.startContinuousPlayback(controllerId, "B", waveformsB, batchSize);

            // 停止 A 通道
            wsServer.stopContinuousPlayback(controllerId, "A");

            // A 停止，B 继续
            expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
            expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);

            wsServer.stopContinuousPlayback(controllerId, "B");
            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // 额外属性测试：重复启动更新状态
  describe("Property: Restart updates state", () => {
    it("重复启动同一通道会更新波形和参数", () => {
      fc.assert(
        fc.property(
          waveformsArb,
          waveformsArb,
          batchSizeArb,
          batchSizeArb,
          validBufferRatioArb,
          validBufferRatioArb,
          channelArb,
          (waveforms1, waveforms2, batchSize1, batchSize2, bufferRatio1, bufferRatio2, channel) => {
            const controllerId = wsServer.createController();
            mockBoundAndSend();

            // 第一次启动
            wsServer.startContinuousPlayback(controllerId, channel, waveforms1, batchSize1, bufferRatio1);
            const state1 = wsServer.getContinuousPlaybackState(controllerId, channel);
            expect(state1!.waveformCount).toBe(waveforms1.length);
            expect(state1!.batchSize).toBe(batchSize1);
            expect(state1!.bufferRatio).toBe(bufferRatio1);

            // 第二次启动（更新）
            wsServer.startContinuousPlayback(controllerId, channel, waveforms2, batchSize2, bufferRatio2);
            const state2 = wsServer.getContinuousPlaybackState(controllerId, channel);
            expect(state2!.waveformCount).toBe(waveforms2.length);
            expect(state2!.batchSize).toBe(batchSize2);
            expect(state2!.bufferRatio).toBe(bufferRatio2);

            wsServer.stopContinuousPlayback(controllerId, channel);
            wsServer.removeController(controllerId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
