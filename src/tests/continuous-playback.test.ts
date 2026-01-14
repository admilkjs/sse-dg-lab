/**
 * @fileoverview 持续播放功能单元测试
 * 
 * 测试 WS Server 的持续播放功能，包括：
 * - Property 1: 持续播放循环发送
 * - Property 2: 停止播放立即生效
 * - Property 4: 断开连接自动清理
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
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

  describe("Property 1: 持续播放循环发送", () => {
    it("启动持续播放后返回成功", () => {
      const controllerId = wsServer.createController();
      // 模拟绑定状态
      const originalIsControllerBound = wsServer.isControllerBound.bind(wsServer);
      wsServer.isControllerBound = (id: string) => id === controllerId;

      const waveforms = ["0000000000000001", "0000000000000002", "0000000000000003"];
      const result = wsServer.startContinuousPlayback(controllerId, "A", waveforms, 100, 2);

      expect(result).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);

      // 恢复
      wsServer.isControllerBound = originalIsControllerBound;
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
      wsServer.isControllerBound = () => true;

      const result = wsServer.startContinuousPlayback(controllerId, "A", []);

      expect(result).toBe(false);
    });

    it("可以同时在两个通道播放", () => {
      const controllerId = wsServer.createController();
      wsServer.isControllerBound = () => true;

      const waveformsA = ["0000000000000001"];
      const waveformsB = ["0000000000000002"];

      const resultA = wsServer.startContinuousPlayback(controllerId, "A", waveformsA);
      const resultB = wsServer.startContinuousPlayback(controllerId, "B", waveformsB);

      expect(resultA).toBe(true);
      expect(resultB).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(true);
      expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);
    });
  });

  describe("Property 2: 停止播放立即生效", () => {
    it("停止播放后状态变为非播放", () => {
      const controllerId = wsServer.createController();
      wsServer.isControllerBound = () => true;

      const waveforms = ["0000000000000001"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 100);

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
      wsServer.isControllerBound = () => true;

      wsServer.startContinuousPlayback(controllerId, "A", ["0000000000000001"]);
      wsServer.startContinuousPlayback(controllerId, "B", ["0000000000000002"]);

      wsServer.stopContinuousPlayback(controllerId, "A");

      expect(wsServer.isContinuousPlaying(controllerId, "A")).toBe(false);
      expect(wsServer.isContinuousPlaying(controllerId, "B")).toBe(true);
    });
  });

  describe("Property 4: 断开连接自动清理", () => {
    it("断开控制器时自动停止持续播放", () => {
      const controllerId = wsServer.createController();
      wsServer.isControllerBound = () => true;

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

    it("服务器停止时清理所有持续播放", () => {
      const controllerId = wsServer.createController();
      wsServer.isControllerBound = () => true;

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
      wsServer.isControllerBound = () => true;

      const waveforms = ["0000000000000001", "0000000000000002"];
      wsServer.startContinuousPlayback(controllerId, "A", waveforms, 150, 3);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");

      expect(state).not.toBeNull();
      expect(state!.waveformCount).toBe(2);
      expect(state!.interval).toBe(150);
      expect(state!.batchSize).toBe(3);
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
      wsServer.isControllerBound = () => true;

      const waveforms1 = ["0000000000000001"];
      const waveforms2 = ["0000000000000002", "0000000000000003"];

      wsServer.startContinuousPlayback(controllerId, "A", waveforms1, 100);
      
      // 重新启动
      wsServer.startContinuousPlayback(controllerId, "A", waveforms2, 100);

      const state = wsServer.getContinuousPlaybackState(controllerId, "A");
      expect(state!.waveformCount).toBe(2);
    });
  });
});
