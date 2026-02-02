/**
 * @module continuous-playback
 * @description 持续播放管理器，负责循环发送波形数据到设备
 */

/**
 * 持续播放状态
 */
export interface ContinuousPlaybackState {
  /** 控制器 ID */
  controllerId: string;
  /** 通道 */
  channel: "A" | "B";
  /** 波形数据（循环播放） */
  waveforms: string[];
  /** 当前播放索引 */
  currentIndex: number;
  /** 每次发送的波形数量 */
  batchSize: number;
  /** 缓冲比例（0.5-1.0），用于计算等待时间 */
  bufferRatio: number;
  /** 播放时长（毫秒），= batchSize × 100 */
  playbackDuration: number;
  /** 定时器 ID（使用 setTimeout） */
  timerId: ReturnType<typeof setTimeout> | null;
  /** 是否正在播放 */
  active: boolean;
  /** 统计信息 */
  stats: {
    /** 发送次数 */
    sendCount: number;
    /** 总发送耗时（毫秒） */
    totalElapsedTime: number;
    /** 上次发送时间戳 */
    lastSendTime: number;
  };
}

/**
 * 持续播放状态（外部返回格式）
 */
export interface PlaybackStatus {
  waveformCount: number;
  batchSize: number;
  bufferRatio: number;
  playbackDuration: number;
  active: boolean;
  stats: {
    sendCount: number;
    totalElapsedTime: number;
    avgElapsedTime: number;
  };
}

/**
 * 波形发送函数类型
 */
export type SendWaveformFn = (
  controllerId: string,
  channel: "A" | "B",
  waveforms: string[]
) => boolean;

/**
 * 清空波形函数类型
 */
export type ClearWaveformFn = (
  controllerId: string,
  channel: "A" | "B"
) => boolean;

/**
 * 检查控制器是否已绑定函数类型
 */
export type IsControllerBoundFn = (controllerId: string) => boolean;

/**
 * 持续播放管理器
 *
 * 负责管理设备的持续播放状态，使用递归 setTimeout 实现动态等待机制。
 */
export class ContinuousPlaybackManager {
  /** 持续播放状态 Map，key 格式: controllerId-channel */
  private playbacks: Map<string, ContinuousPlaybackState> = new Map();
  /** 波形发送函数 */
  private sendWaveformFn: SendWaveformFn;
  /** 清空波形函数 */
  private clearWaveformFn: ClearWaveformFn;
  /** 检查绑定状态函数 */
  private isControllerBoundFn: IsControllerBoundFn;

  constructor(
    sendWaveformFn: SendWaveformFn,
    clearWaveformFn: ClearWaveformFn,
    isControllerBoundFn: IsControllerBoundFn
  ) {
    this.sendWaveformFn = sendWaveformFn;
    this.clearWaveformFn = clearWaveformFn;
    this.isControllerBoundFn = isControllerBoundFn;
  }

  /**
   * 生成播放状态的 key
   */
  private getKey(controllerId: string, channel: "A" | "B"): string {
    return `${controllerId}-${channel}`;
  }

  /**
   * 启动持续播放
   *
   * 循环发送波形数据到指定通道，直到手动停止。
   * 使用动态等待机制，根据实际播放时长和发送耗时计算等待时间。
   *
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @param waveforms - 要循环播放的波形数据
   * @param batchSize - 每次发送的波形数量，默认 5
   * @param bufferRatio - 缓冲比例（0.5-1.0），默认 0.9，用于计算等待时间
   * @returns 是否成功启动
   */
  start(
    controllerId: string,
    channel: "A" | "B",
    waveforms: string[],
    batchSize: number = 5,
    bufferRatio: number = 0.9
  ): boolean {
    // 检查控制器是否已绑定 APP
    if (!this.isControllerBoundFn(controllerId)) {
      console.log(
        `[持续播放] 启动失败: 控制器 ${controllerId} 未绑定 APP`
      );
      return false;
    }

    // 检查波形数据是否有效
    if (!waveforms || waveforms.length === 0) {
      console.log(`[持续播放] 启动失败: 波形数据为空`);
      return false;
    }

    const key = this.getKey(controllerId, channel);

    // 如果已有持续播放，先停止
    if (this.playbacks.has(key)) {
      this.stop(controllerId, channel);
    }

    // 验证 bufferRatio 范围（0.5-1.0），无效值使用默认值 0.9
    const validBufferRatio =
      bufferRatio >= 0.5 && bufferRatio <= 1.0 ? bufferRatio : 0.9;

    // 计算播放时长：每个 hexWaveform = 100ms
    const playbackDuration = batchSize * 100;

    // 创建持续播放状态
    const state: ContinuousPlaybackState = {
      controllerId,
      channel,
      waveforms,
      currentIndex: 0,
      batchSize,
      bufferRatio: validBufferRatio,
      playbackDuration,
      timerId: null,
      active: true,
      stats: {
        sendCount: 0,
        totalElapsedTime: 0,
        lastSendTime: 0,
      },
    };

    this.playbacks.set(key, state);
    console.log(
      `[持续播放] 已启动: ${key}，波形数: ${waveforms.length}，批次大小: ${batchSize}，播放时长: ${playbackDuration}ms，缓冲比例: ${validBufferRatio}`
    );

    // 使用递归 setTimeout 启动播放
    this.scheduleSend(state);
    return true;
  }

  /**
   * 调度发送波形（内部方法）
   *
   * 使用递归 setTimeout 实现动态等待机制：
   * 1. 记录发送开始时间
   * 2. 发送波形批次
   * 3. 计算发送耗时
   * 4. 计算等待时间 = 播放时长 × 缓冲比例 - 发送耗时
   * 5. 调度下次发送
   */
  private scheduleSend(state: ContinuousPlaybackState): void {
    if (!state.active) {
      return;
    }

    // 记录发送开始时间
    const startTime = Date.now();

    // 获取当前批次的波形
    const batch: string[] = [];
    for (let i = 0; i < state.batchSize; i++) {
      batch.push(state.waveforms[state.currentIndex]!);
      state.currentIndex = (state.currentIndex + 1) % state.waveforms.length;
    }

    // 发送波形
    const success = this.sendWaveformFn(
      state.controllerId,
      state.channel,
      batch
    );
    if (!success) {
      // 发送失败，停止播放
      console.log(
        `[持续播放] 发送失败，停止播放: ${state.controllerId}-${state.channel}`
      );
      this.stop(state.controllerId, state.channel);
      return;
    }

    // 计算发送耗时
    const elapsedTime = Date.now() - startTime;

    // 更新统计信息
    state.stats.sendCount++;
    state.stats.totalElapsedTime += elapsedTime;
    state.stats.lastSendTime = startTime;

    // 计算等待时间
    const targetWaitTime =
      state.playbackDuration * state.bufferRatio - elapsedTime;
    const actualWaitTime = Math.max(10, targetWaitTime); // 最小 10ms

    // 记录性能警告
    if (targetWaitTime < 0) {
      console.warn(
        `[持续播放] 发送太慢: 耗时 ${elapsedTime}ms > 目标时间 ${state.playbackDuration * state.bufferRatio}ms`
      );
    }

    // 调度下次发送
    state.timerId = setTimeout(() => this.scheduleSend(state), actualWaitTime);
  }

  /**
   * 停止持续播放
   *
   * 停止指定通道的持续播放并清空波形队列。
   *
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @returns 是否成功停止
   */
  stop(controllerId: string, channel: "A" | "B"): boolean {
    const key = this.getKey(controllerId, channel);
    const state = this.playbacks.get(key);

    if (!state) {
      console.log(`[持续播放] 停止失败: ${key} 不存在`);
      return false;
    }

    // 记录统计信息
    if (state.stats.sendCount > 0) {
      const avgElapsedTime = state.stats.totalElapsedTime / state.stats.sendCount;
      console.log(
        `[持续播放] 统计: ${key}，发送次数: ${state.stats.sendCount}，平均耗时: ${avgElapsedTime.toFixed(2)}ms`
      );
    }

    // 停止定时器
    state.active = false;
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    // 清空波形队列
    this.clearWaveformFn(controllerId, channel);

    // 移除状态
    this.playbacks.delete(key);
    console.log(`[持续播放] 已停止: ${key}`);
    return true;
  }

  /**
   * 停止指定控制器的所有持续播放
   *
   * @param controllerId - 控制器 ID
   */
  stopAll(controllerId: string): void {
    for (const channel of ["A", "B"] as const) {
      const key = this.getKey(controllerId, channel);
      if (this.playbacks.has(key)) {
        this.stop(controllerId, channel);
      }
    }
  }

  /**
   * 清理所有持续播放
   */
  cleanup(): void {
    for (const state of this.playbacks.values()) {
      state.active = false;
      if (state.timerId) {
        clearTimeout(state.timerId);
      }
    }
    this.playbacks.clear();
  }

  /**
   * 检查是否正在持续播放
   *
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @returns 是否正在持续播放
   */
  isPlaying(controllerId: string, channel: "A" | "B"): boolean {
    const key = this.getKey(controllerId, channel);
    const state = this.playbacks.get(key);
    return state?.active ?? false;
  }

  /**
   * 获取持续播放状态
   *
   * @param controllerId - 控制器 ID
   * @param channel - 目标通道 A 或 B
   * @returns 持续播放状态或 null
   */
  getState(controllerId: string, channel: "A" | "B"): PlaybackStatus | null {
    const key = this.getKey(controllerId, channel);
    const state = this.playbacks.get(key);
    if (!state) return null;

    return {
      waveformCount: state.waveforms.length,
      batchSize: state.batchSize,
      bufferRatio: state.bufferRatio,
      playbackDuration: state.playbackDuration,
      active: state.active,
      stats: {
        sendCount: state.stats.sendCount,
        totalElapsedTime: state.stats.totalElapsedTime,
        avgElapsedTime:
          state.stats.sendCount > 0
            ? state.stats.totalElapsedTime / state.stats.sendCount
            : 0,
      },
    };
  }
}
