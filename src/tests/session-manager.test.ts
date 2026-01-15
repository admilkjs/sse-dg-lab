/**
 * Session Manager Tests
 * Feature: dg-lab-sse-tool
 * Property 11: Alias Case-Insensitive Search
 * Property 12: Multiple Devices Same Alias
 * Property 7: Connection Timeout Timer Lifecycle
 * Property 8: Unbound Session Auto-Destroy
 * 
 * Note: Session persistence tests removed - sessions are now memory-only
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fc from "fast-check";
import { SessionManager } from "../session-manager";

describe("Session Manager", () => {
  /**
   * Property 11: Alias Case-Insensitive Search
   * For any alias string, calling findByAlias with the alias in any case
   * SHALL return the same set of devices.
   */
  describe("Property 11: Alias Case-Insensitive Search", () => {
    test("findByAlias is case-insensitive", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /[a-zA-Z]/.test(s)),
          (alias) => {
            const manager = new SessionManager();
            const session = manager.createSession();
            manager.setAlias(session.deviceId, alias);

            // Search with different cases
            const lower = manager.findByAlias(alias.toLowerCase());
            const upper = manager.findByAlias(alias.toUpperCase());
            const original = manager.findByAlias(alias);

            // All should return the same session
            expect(lower.length).toBe(1);
            expect(upper.length).toBe(1);
            expect(original.length).toBe(1);

            expect(lower[0].deviceId).toBe(session.deviceId);
            expect(upper[0].deviceId).toBe(session.deviceId);
            expect(original[0].deviceId).toBe(session.deviceId);

            manager.stopCleanupTimer();
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Mixed case aliases are found regardless of search case", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.setAlias(session.deviceId, "TestUser123");

      expect(manager.findByAlias("testuser123").length).toBe(1);
      expect(manager.findByAlias("TESTUSER123").length).toBe(1);
      expect(manager.findByAlias("TestUser123").length).toBe(1);
      expect(manager.findByAlias("tEsTuSeR123").length).toBe(1);

      manager.stopCleanupTimer();
    });
  });

  /**
   * Property 12: Multiple Devices Same Alias
   * For any alias, multiple devices can be assigned the same alias,
   * and findByAlias SHALL return all of them.
   */
  describe("Property 12: Multiple Devices Same Alias", () => {
    test("Multiple devices can have the same alias", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.integer({ min: 1, max: 5 }),
          (alias, count) => {
            const manager = new SessionManager();
            const deviceIds: string[] = [];

            // Create multiple sessions with same alias
            for (let i = 0; i < count; i++) {
              const session = manager.createSession();
              manager.setAlias(session.deviceId, alias);
              deviceIds.push(session.deviceId);
            }

            // Find by alias should return all
            const found = manager.findByAlias(alias);
            expect(found.length).toBe(count);

            // All device IDs should be in the result
            const foundIds = found.map((s) => s.deviceId);
            for (const id of deviceIds) {
              expect(foundIds).toContain(id);
            }

            manager.stopCleanupTimer();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Basic Operations", () => {
    test("createSession generates unique deviceIds", () => {
      const manager = new SessionManager();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const session = manager.createSession();
        expect(ids.has(session.deviceId)).toBe(false);
        ids.add(session.deviceId);
      }

      manager.stopCleanupTimer();
    });

    test("getSession returns null for non-existent deviceId", () => {
      const manager = new SessionManager();
      expect(manager.getSession("non-existent")).toBeNull();
      manager.stopCleanupTimer();
    });

    test("deleteSession removes session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();

      expect(manager.getSession(session.deviceId)).not.toBeNull();
      expect(manager.deleteSession(session.deviceId)).toBe(true);
      expect(manager.getSession(session.deviceId)).toBeNull();

      manager.stopCleanupTimer();
    });

    test("setAlias returns false for non-existent deviceId", () => {
      const manager = new SessionManager();
      expect(manager.setAlias("non-existent", "alias")).toBe(false);
      manager.stopCleanupTimer();
    });

    test("touchSession updates lastActive", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      const originalTime = session.lastActive.getTime();

      // Wait a bit
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      wait(10).then(() => {
        manager.touchSession(session.deviceId);
        const updated = manager.getSession(session.deviceId);
        expect(updated!.lastActive.getTime()).toBeGreaterThanOrEqual(originalTime);
        manager.stopCleanupTimer();
      });
    });

    test("getSessionByClientId finds session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.updateConnectionState(session.deviceId, { clientId: "test-client-id" });

      const found = manager.getSessionByClientId("test-client-id");
      expect(found).not.toBeNull();
      expect(found!.deviceId).toBe(session.deviceId);

      manager.stopCleanupTimer();
    });

    test("clearAll removes all sessions", () => {
      const manager = new SessionManager();
      manager.createSession();
      manager.createSession();
      manager.createSession();

      expect(manager.sessionCount).toBe(3);
      manager.clearAll();
      expect(manager.sessionCount).toBe(0);

      manager.stopCleanupTimer();
    });
  });

  describe("Memory-only behavior", () => {
    test("Sessions are stored in memory only", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.setAlias(session.deviceId, "test-alias");

      // Session exists in this manager
      expect(manager.getSession(session.deviceId)).not.toBeNull();

      // New manager has no sessions
      const manager2 = new SessionManager();
      expect(manager2.getSession(session.deviceId)).toBeNull();
      expect(manager2.sessionCount).toBe(0);

      manager.stopCleanupTimer();
      manager2.stopCleanupTimer();
    });
  });

  /**
   * Property 7: Connection Timeout Timer Lifecycle
   * For any newly created session, a connection timeout timer should be started;
   * when the session successfully binds to APP, the timer should be cancelled.
   * Validates: Requirements 4.1, 4.4
   */
  describe("Property 7: Connection Timeout Timer Lifecycle", () => {
    test("createSession starts connection timeout timer", () => {
      const manager = new SessionManager(5); // 5 minutes timeout
      const session = manager.createSession();

      // Timer should be set
      expect(session.connectionTimeoutId).not.toBeNull();

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("onAppBound cancels connection timeout timer", () => {
      const manager = new SessionManager(5);
      const session = manager.createSession();

      // Timer should be set initially
      expect(session.connectionTimeoutId).not.toBeNull();

      // Bind to APP
      manager.onAppBound(session.deviceId);

      // Timer should be cancelled
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.connectionTimeoutId).toBeNull();
      expect(updatedSession!.boundToApp).toBe(true);

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("deleteSession clears connection timeout timer", () => {
      const manager = new SessionManager(5);
      const session = manager.createSession();

      // Timer should be set
      expect(session.connectionTimeoutId).not.toBeNull();

      // Delete session - should not throw
      expect(manager.deleteSession(session.deviceId)).toBe(true);

      manager.stopCleanupTimer();
    });

    test("Property: For any session, timer lifecycle is consistent", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // timeout minutes
          fc.boolean(), // whether to bind
          (timeoutMinutes, shouldBind) => {
            const manager = new SessionManager(timeoutMinutes);
            const session = manager.createSession();

            // Timer should always be set on creation
            expect(session.connectionTimeoutId).not.toBeNull();

            if (shouldBind) {
              manager.onAppBound(session.deviceId);
              const updated = manager.getSession(session.deviceId);
              // Timer should be cancelled after binding
              expect(updated!.connectionTimeoutId).toBeNull();
              expect(updated!.boundToApp).toBe(true);
            }

            manager.stopCleanupTimer();
            manager.clearAll();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 8: Unbound Session Auto-Destroy
   * For any session created that is not bound to APP within the timeout period,
   * it should be automatically destroyed.
   * Validates: Requirements 4.2, 4.3
   */
  describe("Property 8: Unbound Session Auto-Destroy", () => {
    test("Session is destroyed after connection timeout if not bound", async () => {
      // Use a very short timeout for testing (0.05 minutes = 3 seconds)
      const manager = new SessionManager(0.05);
      const session = manager.createSession();

      // Session should exist initially
      expect(manager.getSession(session.deviceId)).not.toBeNull();

      // Wait for timeout (3 seconds + buffer)
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Session should be destroyed
      expect(manager.getSession(session.deviceId)).toBeNull();

      manager.stopCleanupTimer();
    }, 10000); // 10 second test timeout

    test("Bound session is not destroyed after connection timeout", async () => {
      // Use a very short timeout for testing
      const manager = new SessionManager(0.05);
      const session = manager.createSession();

      // Bind to APP immediately
      manager.onAppBound(session.deviceId);

      // Wait for what would be the timeout
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Session should still exist because it was bound
      expect(manager.getSession(session.deviceId)).not.toBeNull();

      manager.stopCleanupTimer();
      manager.clearAll();
    }, 10000);

    test("Custom timeout is respected", () => {
      const manager1 = new SessionManager(1); // 1 minute
      const manager2 = new SessionManager(10); // 10 minutes

      // Both should create sessions with timers
      const session1 = manager1.createSession();
      const session2 = manager2.createSession();

      expect(session1.connectionTimeoutId).not.toBeNull();
      expect(session2.connectionTimeoutId).not.toBeNull();

      manager1.stopCleanupTimer();
      manager2.stopCleanupTimer();
      manager1.clearAll();
      manager2.clearAll();
    });
  });

  /**
   * Feature: device-reconnection-timeout
   * Property 3: Session Preservation on Bound Device Disconnection
   * 
   * 属性：对于任何已绑定的设备会话，当设备断开连接时，会话应保留在内存中，
   * 状态为 connected=false, boundToApp=true，并且 reconnectionTimeoutId 不为 null
   * 
   * Validates: Requirements 2.1, 2.2
   */
  describe("Property 3: Session Preservation on Bound Device Disconnection", () => {
  test("已绑定设备断开后会话被保留", () => {
    const manager = new SessionManager(5, 5);
    const session = manager.createSession();

    // 绑定设备
    manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });

    // 断开连接
    const preserved = manager.handleDisconnection(session.deviceId);

    // 会话应该被保留
    expect(preserved).toBe(true);

    // 检查会话状态
    const updatedSession = manager.getSession(session.deviceId);
    expect(updatedSession).not.toBeNull();
    expect(updatedSession!.connected).toBe(false);
    expect(updatedSession!.boundToApp).toBe(true);
    expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();
    expect(updatedSession!.disconnectedAt).not.toBeNull();
    expect(updatedSession!.ws).toBeNull();

    manager.stopCleanupTimer();
    manager.clearAll();
  });

  test("属性测试：所有已绑定设备断开后都应保留会话", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }), // reconnection timeout
        fc.string({ minLength: 1, maxLength: 20 }), // alias
        fc.integer({ min: 0, max: 200 }), // strengthA
        fc.integer({ min: 0, max: 200 }), // strengthB
        (timeout, alias, strengthA, strengthB) => {
          const manager = new SessionManager(5, timeout);
          const session = manager.createSession();

          // 设置会话数据
          manager.setAlias(session.deviceId, alias);
          manager.updateStrength(session.deviceId, strengthA, strengthB, 200, 200);
          manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });

          // 断开连接
          const preserved = manager.handleDisconnection(session.deviceId);

          // 验证会话被保留
          const result = preserved === true;
          const updatedSession = manager.getSession(session.deviceId);
          const stateCorrect =
            updatedSession !== null &&
            updatedSession.connected === false &&
            updatedSession.boundToApp === true &&
            updatedSession.reconnectionTimeoutId !== null &&
            updatedSession.disconnectedAt !== null;

          manager.stopCleanupTimer();
          manager.clearAll();

          return result && stateCorrect;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: device-reconnection-timeout
 * Property 5: Unbound Device Immediate Deletion
 * 
 * 属性：对于任何未绑定的设备会话（boundToApp=false），当设备断开连接时，
 * 会话应立即从内存中删除
 * 
 * Validates: Requirements 2.4
 */
describe("Property 5: Unbound Device Immediate Deletion", () => {
  test("未绑定设备断开后会话被立即删除", () => {
    const manager = new SessionManager(5, 5);
    const session = manager.createSession();

    // 不绑定设备，直接断开
    const preserved = manager.handleDisconnection(session.deviceId);

    // 会话应该被删除
    expect(preserved).toBe(false);
    expect(manager.getSession(session.deviceId)).toBeNull();

    manager.stopCleanupTimer();
  });

  test("属性测试：所有未绑定设备断开后都应立即删除", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }), // reconnection timeout
        (timeout) => {
          const manager = new SessionManager(5, timeout);
          const session = manager.createSession();

          // 确保设备未绑定
          expect(session.boundToApp).toBe(false);

          // 断开连接
          const preserved = manager.handleDisconnection(session.deviceId);

          // 验证会话被删除
          const deleted = preserved === false && manager.getSession(session.deviceId) === null;

          manager.stopCleanupTimer();
          manager.clearAll();

          return deleted;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: device-reconnection-timeout
 * Property 4: Session Data Invariance
 * 
 * 属性：对于任何具有特定别名和强度值的设备会话，断开连接和重新连接应保持所有这些值不变
 * 
 * Validates: Requirements 2.3, 3.3
 */
describe("Property 4: Session Data Invariance", () => {
  test("断开连接保留会话数据", () => {
    const manager = new SessionManager(5, 5);
    const session = manager.createSession();

    // 设置会话数据
    const alias = "test-device";
    const strengthA = 100;
    const strengthB = 150;
    const limitA = 180;
    const limitB = 190;

    manager.setAlias(session.deviceId, alias);
    manager.updateStrength(session.deviceId, strengthA, strengthB, limitA, limitB);
    manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });

    // 断开连接
    manager.handleDisconnection(session.deviceId);

    // 验证数据未改变
    const updatedSession = manager.getSession(session.deviceId);
    expect(updatedSession).not.toBeNull();
    expect(updatedSession!.alias).toBe(alias);
    expect(updatedSession!.strengthA).toBe(strengthA);
    expect(updatedSession!.strengthB).toBe(strengthB);
    expect(updatedSession!.strengthLimitA).toBe(limitA);
    expect(updatedSession!.strengthLimitB).toBe(limitB);

    manager.stopCleanupTimer();
    manager.clearAll();
  });

  test("属性测试：断开连接不改变任何会话数据", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }), // alias
        fc.integer({ min: 0, max: 200 }), // strengthA
        fc.integer({ min: 0, max: 200 }), // strengthB
        fc.integer({ min: 0, max: 200 }), // limitA
        fc.integer({ min: 0, max: 200 }), // limitB
        (alias, strengthA, strengthB, limitA, limitB) => {
          const manager = new SessionManager(5, 5);
          const session = manager.createSession();

          // 设置会话数据
          manager.setAlias(session.deviceId, alias);
          manager.updateStrength(session.deviceId, strengthA, strengthB, limitA, limitB);
          manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });

          // 断开连接
          manager.handleDisconnection(session.deviceId);

          // 验证所有数据不变
          const updatedSession = manager.getSession(session.deviceId);
          const dataPreserved =
            updatedSession !== null &&
            updatedSession.alias === alias &&
            updatedSession.strengthA === strengthA &&
            updatedSession.strengthB === strengthB &&
            updatedSession.strengthLimitA === limitA &&
            updatedSession.strengthLimitB === limitB;

          manager.stopCleanupTimer();
          manager.clearAll();

          return dataPreserved;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: device-reconnection-timeout
   * Property 7: Successful Reconnection
   * 
   * 属性：对于任何断开的设备会话，当设备在超时窗口内重连时，
   * 会话应转换为 connected=true 且 reconnectionTimeoutId=null
   * 
   * Validates: Requirements 3.1, 3.2
   */
  describe("Property 7: Successful Reconnection", () => {
    test("设备重连后恢复连接状态", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定并断开
      manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });
      manager.handleDisconnection(session.deviceId);

      // 模拟重连
      const mockWs = {} as WebSocket;
      const newClientId = "new-client-123";
      const success = manager.handleReconnection(session.deviceId, mockWs, newClientId);

      expect(success).toBe(true);

      // 验证状态
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession).not.toBeNull();
      expect(updatedSession!.connected).toBe(true);
      expect(updatedSession!.reconnectionTimeoutId).toBeNull();
      expect(updatedSession!.disconnectedAt).toBeNull();
      expect(updatedSession!.ws).toBe(mockWs);
      expect(updatedSession!.clientId).toBe(newClientId);

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("属性测试：所有断开的设备重连后都应恢复状态", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          fc.string({ minLength: 5, maxLength: 20 }), // clientId
          (timeout, clientId) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            // 绑定并断开
            manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });
            manager.handleDisconnection(session.deviceId);

            // 重连
            const mockWs = {} as WebSocket;
            const success = manager.handleReconnection(session.deviceId, mockWs, clientId);

            // 验证
            const updatedSession = manager.getSession(session.deviceId);
            const stateCorrect =
              success === true &&
              updatedSession !== null &&
              updatedSession.connected === true &&
              updatedSession.reconnectionTimeoutId === null &&
              updatedSession.disconnectedAt === null &&
              updatedSession.ws === mockWs &&
              updatedSession.clientId === clientId;

            manager.stopCleanupTimer();
            manager.clearAll();

            return stateCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: device-reconnection-timeout
   * Property 8: WebSocket Reference Update on Reconnection
   * 
   * 属性：对于任何重连的设备，会话的 ws 字段应更新为新的 WebSocket 连接
   * 
   * Validates: Requirements 3.4
   */
  describe("Property 8: WebSocket Reference Update on Reconnection", () => {
    test("重连时更新 WebSocket 引用", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定并断开
      const oldWs = {} as WebSocket;
      manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true, ws: oldWs });
      manager.handleDisconnection(session.deviceId);

      // 验证断开后 ws 为 null
      let updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.ws).toBeNull();

      // 重连
      const newWs = {} as WebSocket;
      manager.handleReconnection(session.deviceId, newWs, "new-client");

      // 验证 ws 已更新
      updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.ws).toBe(newWs);
      expect(updatedSession!.ws).not.toBe(oldWs);

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("属性测试：重连总是更新 WebSocket 引用", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // 重连次数
          (reconnectCount) => {
            const manager = new SessionManager(5, 5);
            const session = manager.createSession();

            // 绑定
            manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });

            let lastWs: WebSocket | null = null;
            for (let i = 0; i < reconnectCount; i++) {
              // 断开
              manager.handleDisconnection(session.deviceId);

              // 重连
              const newWs = { id: i } as WebSocket;
              manager.handleReconnection(session.deviceId, newWs, `client-${i}`);

              // 验证 ws 已更新
              const updatedSession = manager.getSession(session.deviceId);
              if (updatedSession!.ws !== newWs || (lastWs && updatedSession!.ws === lastWs)) {
                manager.stopCleanupTimer();
                manager.clearAll();
                return false;
              }

              lastWs = newWs;
            }

            manager.stopCleanupTimer();
            manager.clearAll();
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Feature: device-reconnection-timeout
   * Property 10: Timer Cleanup on Manual Deletion
   * 
   * 属性：对于任何具有活动重连超时计时器的会话，手动删除会话应取消计时器
   * 
   * Validates: Requirements 5.3
   */
  describe("Property 10: Timer Cleanup on Manual Deletion", () => {
    test("删除会话时清理重连计时器", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定并断开（启动重连计时器）
      manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });
      manager.handleDisconnection(session.deviceId);

      // 验证计时器存在
      let updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();

      // 删除会话
      const deleted = manager.deleteSession(session.deviceId);
      expect(deleted).toBe(true);

      // 会话应该被删除
      expect(manager.getSession(session.deviceId)).toBeNull();

      manager.stopCleanupTimer();
    });

    test("属性测试：删除任何有重连计时器的会话都应清理计时器", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          (timeout) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            // 绑定并断开
            manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });
            manager.handleDisconnection(session.deviceId);

            // 删除会话（应该清理计时器）
            const deleted = manager.deleteSession(session.deviceId);

            // 验证会话已删除
            const result = deleted === true && manager.getSession(session.deviceId) === null;

            manager.stopCleanupTimer();
            manager.clearAll();

            return result;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: device-reconnection-timeout
   * clearAll 计时器清理测试
   * 
   * Validates: Requirements 5.4
   */
  describe("clearAll Timer Cleanup", () => {
    test("clearAll 清理所有重连计时器", () => {
      const manager = new SessionManager(5, 5);

      // 创建多个会话，有些有重连计时器
      const session1 = manager.createSession();
      const session2 = manager.createSession();
      const session3 = manager.createSession();

      // session1: 有连接超时计时器（未绑定）
      // session2: 有重连超时计时器（已绑定并断开）
      manager.updateConnectionState(session2.deviceId, { boundToApp: true, connected: true });
      manager.handleDisconnection(session2.deviceId);

      // session3: 已连接（无计时器）
      manager.updateConnectionState(session3.deviceId, { boundToApp: true, connected: true });

      expect(manager.sessionCount).toBe(3);

      // 清理所有会话
      manager.clearAll();

      // 所有会话应该被删除
      expect(manager.sessionCount).toBe(0);
      expect(manager.getSession(session1.deviceId)).toBeNull();
      expect(manager.getSession(session2.deviceId)).toBeNull();
      expect(manager.getSession(session3.deviceId)).toBeNull();

      manager.stopCleanupTimer();
    });
  });
});
});

  /**
   * Feature: device-reconnection-timeout
   * Property 11: Separate Timer Management
   * 
   * 属性：连接超时计时器和重连超时计时器应该独立管理，互不干扰
   * 
   * Validates: Requirements 6.2
   */
  describe("Property 11: Separate Timer Management", () => {
    test("连接超时和重连超时计时器独立管理", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 初始状态：只有连接超时计时器
      expect(session.connectionTimeoutId).not.toBeNull();
      expect(session.reconnectionTimeoutId).toBeNull();

      // 绑定 APP（取消连接超时）
      manager.onAppBound(session.deviceId);
      let updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.connectionTimeoutId).toBeNull();
      expect(updatedSession!.reconnectionTimeoutId).toBeNull();

      // 断开连接（启动重连超时）
      manager.handleDisconnection(session.deviceId);
      updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.connectionTimeoutId).toBeNull();
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();

      // 重连（取消重连超时）
      const mockWs = {} as any;
      manager.handleReconnection(session.deviceId, mockWs, "client-123");
      updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.connectionTimeoutId).toBeNull();
      expect(updatedSession!.reconnectionTimeoutId).toBeNull();

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("属性测试：计时器在不同阶段独立工作", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // connection timeout
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          (connTimeout, reconTimeout) => {
            const manager = new SessionManager(connTimeout, reconTimeout);
            const session = manager.createSession();

            // 阶段 1: 创建后只有连接超时
            const phase1 =
              session.connectionTimeoutId !== null && session.reconnectionTimeoutId === null;

            // 阶段 2: 绑定后两个都为 null
            manager.onAppBound(session.deviceId);
            let updatedSession = manager.getSession(session.deviceId);
            const phase2 =
              updatedSession!.connectionTimeoutId === null &&
              updatedSession!.reconnectionTimeoutId === null;

            // 阶段 3: 断开后只有重连超时
            manager.handleDisconnection(session.deviceId);
            updatedSession = manager.getSession(session.deviceId);
            const phase3 =
              updatedSession!.connectionTimeoutId === null &&
              updatedSession!.reconnectionTimeoutId !== null;

            // 阶段 4: 重连后两个都为 null
            const mockWs = {} as any;
            manager.handleReconnection(session.deviceId, mockWs, "client");
            updatedSession = manager.getSession(session.deviceId);
            const phase4 =
              updatedSession!.connectionTimeoutId === null &&
              updatedSession!.reconnectionTimeoutId === null;

            manager.stopCleanupTimer();
            manager.clearAll();

            return phase1 && phase2 && phase3 && phase4;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: device-reconnection-timeout
   * Property 13: Conditional Reconnection Timer Creation
   * 
   * 属性：只有已绑定的设备断开时才应创建重连超时计时器，未绑定的设备不应创建
   * 
   * Validates: Requirements 6.4
   */
  describe("Property 13: Conditional Reconnection Timer Creation", () => {
    test("只有已绑定设备断开时才创建重连计时器", () => {
      const manager = new SessionManager(5, 5);

      // 场景 1: 未绑定设备断开 - 不创建重连计时器（会话被删除）
      const unboundSession = manager.createSession();
      manager.handleDisconnection(unboundSession.deviceId);
      expect(manager.getSession(unboundSession.deviceId)).toBeNull();

      // 场景 2: 已绑定设备断开 - 创建重连计时器
      const boundSession = manager.createSession();
      manager.updateConnectionState(boundSession.deviceId, { boundToApp: true, connected: true });
      manager.handleDisconnection(boundSession.deviceId);
      const updatedSession = manager.getSession(boundSession.deviceId);
      expect(updatedSession).not.toBeNull();
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("属性测试：重连计时器创建取决于绑定状态", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          fc.boolean(), // is bound
          (timeout, isBound) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            if (isBound) {
              manager.updateConnectionState(session.deviceId, { boundToApp: true, connected: true });
            }

            // 断开连接
            const preserved = manager.handleDisconnection(session.deviceId);
            const updatedSession = manager.getSession(session.deviceId);

            let result: boolean;
            if (isBound) {
              // 已绑定：会话保留，有重连计时器
              result =
                preserved === true &&
                updatedSession !== null &&
                updatedSession.reconnectionTimeoutId !== null;
            } else {
              // 未绑定：会话删除，无重连计时器
              result = preserved === false && updatedSession === null;
            }

            manager.stopCleanupTimer();
            manager.clearAll();

            return result;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Feature: waveform-and-playback-improvements
   * APP Disconnect Triggers Reconnection Tests
   * 
   * Tests for APP disconnect behavior - when APP disconnects, the system should
   * call handleDisconnection to start reconnection timeout instead of immediately
   * setting boundToApp to false.
   * 
   * Validates: Requirements 10.1-10.4
   */
  describe("APP Disconnect Triggers Reconnection", () => {
    test("APP 断开触发 handleDisconnection 而不是直接解绑", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();
      const targetId = "app-123";

      // 绑定 APP
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: targetId,
      });

      // 模拟 APP 断开 - 调用 handleDisconnection
      const preserved = manager.handleDisconnection(session.deviceId);

      // 验证会话被保留
      expect(preserved).toBe(true);

      // 验证状态
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession).not.toBeNull();
      expect(updatedSession!.boundToApp).toBe(true); // boundToApp 保持为 true
      expect(updatedSession!.connected).toBe(false); // connected 设置为 false
      expect(updatedSession!.disconnectedAt).not.toBeNull(); // disconnectedAt 被记录
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull(); // 重连超时被启动

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("APP 断开后 boundToApp 保持为 true", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定 APP
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: "app-456",
      });

      // 验证绑定状态
      expect(manager.getSession(session.deviceId)!.boundToApp).toBe(true);

      // APP 断开
      manager.handleDisconnection(session.deviceId);

      // boundToApp 应该保持为 true
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.boundToApp).toBe(true);

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("APP 断开后 connected 设置为 false", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定并连接
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: "app-789",
      });

      // 验证连接状态
      expect(manager.getSession(session.deviceId)!.connected).toBe(true);

      // APP 断开
      manager.handleDisconnection(session.deviceId);

      // connected 应该设置为 false
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.connected).toBe(false);

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("APP 断开后 disconnectedAt 被记录", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定 APP
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: "app-abc",
      });

      // 验证初始状态
      expect(manager.getSession(session.deviceId)!.disconnectedAt).toBeNull();

      // 记录断开前的时间
      const beforeDisconnect = new Date();

      // APP 断开
      manager.handleDisconnection(session.deviceId);

      // disconnectedAt 应该被记录
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.disconnectedAt).not.toBeNull();
      expect(updatedSession!.disconnectedAt!.getTime()).toBeGreaterThanOrEqual(beforeDisconnect.getTime());

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("APP 断开后重连超时被启动", () => {
      const manager = new SessionManager(5, 5);
      const session = manager.createSession();

      // 绑定 APP
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: "app-def",
      });

      // 验证初始状态
      expect(manager.getSession(session.deviceId)!.reconnectionTimeoutId).toBeNull();

      // APP 断开
      manager.handleDisconnection(session.deviceId);

      // reconnectionTimeoutId 应该不为 null
      const updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("多个设备同时 APP 断开", () => {
      const manager = new SessionManager(5, 5);
      const appId = "shared-app-123";

      // 创建多个会话并绑定到同一个 APP
      const session1 = manager.createSession();
      const session2 = manager.createSession();
      const session3 = manager.createSession();

      manager.updateConnectionState(session1.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: appId,
      });
      manager.updateConnectionState(session2.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: appId,
      });
      manager.updateConnectionState(session3.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: appId,
      });

      // 模拟 APP 断开 - 对所有绑定到该 APP 的设备调用 handleDisconnection
      const sessions = manager.listSessions();
      for (const s of sessions) {
        if (s.targetId === appId) {
          manager.handleDisconnection(s.deviceId);
        }
      }

      // 验证所有会话都被正确处理
      for (const deviceId of [session1.deviceId, session2.deviceId, session3.deviceId]) {
        const updatedSession = manager.getSession(deviceId);
        expect(updatedSession).not.toBeNull();
        expect(updatedSession!.boundToApp).toBe(true);
        expect(updatedSession!.connected).toBe(false);
        expect(updatedSession!.disconnectedAt).not.toBeNull();
        expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();
      }

      manager.stopCleanupTimer();
      manager.clearAll();
    });
  });


  /**
   * Feature: waveform-and-playback-improvements
   * Property 24: APP disconnect triggers reconnection
   * 
   * For any bound device session, when APP disconnects, handleDisconnection
   * should be called to start reconnection timeout
   * 
   * Validates: Requirements 10.1
   */
  describe("Property 24: APP disconnect triggers reconnection", () => {
    // Feature: waveform-and-playback-improvements, Property 24: APP disconnect triggers reconnection
    test("属性测试：所有已绑定设备 APP 断开后都应触发重连机制", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          fc.string({ minLength: 5, maxLength: 20 }), // targetId (APP ID)
          (timeout, targetId) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            // 绑定 APP
            manager.updateConnectionState(session.deviceId, {
              boundToApp: true,
              connected: true,
              targetId: targetId,
            });

            // 模拟 APP 断开 - 调用 handleDisconnection
            const preserved = manager.handleDisconnection(session.deviceId);

            // 验证重连机制被触发
            const updatedSession = manager.getSession(session.deviceId);
            const reconnectionTriggered =
              preserved === true &&
              updatedSession !== null &&
              updatedSession.reconnectionTimeoutId !== null;

            manager.stopCleanupTimer();
            manager.clearAll();

            return reconnectionTriggered;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: waveform-and-playback-improvements
   * Property 25: APP disconnect preserves bound state
   * 
   * For any bound device session, when APP disconnects, boundToApp should remain true
   * 
   * Validates: Requirements 10.2
   */
  describe("Property 25: APP disconnect preserves bound state", () => {
    // Feature: waveform-and-playback-improvements, Property 25: APP disconnect preserves bound state
    test("属性测试：所有已绑定设备 APP 断开后 boundToApp 保持为 true", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          fc.string({ minLength: 5, maxLength: 20 }), // targetId (APP ID)
          fc.string({ minLength: 1, maxLength: 30 }), // alias
          (timeout, targetId, alias) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            // 设置会话数据
            manager.setAlias(session.deviceId, alias);
            manager.updateConnectionState(session.deviceId, {
              boundToApp: true,
              connected: true,
              targetId: targetId,
            });

            // 验证绑定状态
            const beforeDisconnect = manager.getSession(session.deviceId);
            if (!beforeDisconnect || !beforeDisconnect.boundToApp) {
              manager.stopCleanupTimer();
              manager.clearAll();
              return false;
            }

            // APP 断开
            manager.handleDisconnection(session.deviceId);

            // 验证 boundToApp 保持为 true
            const afterDisconnect = manager.getSession(session.deviceId);
            const boundStatePreserved =
              afterDisconnect !== null && afterDisconnect.boundToApp === true;

            manager.stopCleanupTimer();
            manager.clearAll();

            return boundStatePreserved;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: waveform-and-playback-improvements
   * Property 26: APP disconnect sets connected false
   * 
   * For any device session, when APP disconnects, connected should be set to false
   * 
   * Validates: Requirements 10.3
   */
  describe("Property 26: APP disconnect sets connected false", () => {
    // Feature: waveform-and-playback-improvements, Property 26: APP disconnect sets connected false
    test("属性测试：所有设备 APP 断开后 connected 设置为 false", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          fc.string({ minLength: 5, maxLength: 20 }), // targetId (APP ID)
          fc.integer({ min: 0, max: 200 }), // strengthA
          fc.integer({ min: 0, max: 200 }), // strengthB
          (timeout, targetId, strengthA, strengthB) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            // 设置会话数据
            manager.updateStrength(session.deviceId, strengthA, strengthB, 200, 200);
            manager.updateConnectionState(session.deviceId, {
              boundToApp: true,
              connected: true,
              targetId: targetId,
            });

            // 验证连接状态
            const beforeDisconnect = manager.getSession(session.deviceId);
            if (!beforeDisconnect || !beforeDisconnect.connected) {
              manager.stopCleanupTimer();
              manager.clearAll();
              return false;
            }

            // APP 断开
            manager.handleDisconnection(session.deviceId);

            // 验证 connected 设置为 false
            const afterDisconnect = manager.getSession(session.deviceId);
            const connectedSetFalse =
              afterDisconnect !== null && afterDisconnect.connected === false;

            manager.stopCleanupTimer();
            manager.clearAll();

            return connectedSetFalse;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: waveform-and-playback-improvements
   * Property 27: APP disconnect records timestamp
   * 
   * For any device session, when APP disconnects, disconnectedAt should be set to current timestamp
   * 
   * Validates: Requirements 10.4
   */
  describe("Property 27: APP disconnect records timestamp", () => {
    // Feature: waveform-and-playback-improvements, Property 27: APP disconnect records timestamp
    test("属性测试：所有设备 APP 断开后 disconnectedAt 被记录", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }), // reconnection timeout
          fc.string({ minLength: 5, maxLength: 20 }), // targetId (APP ID)
          (timeout, targetId) => {
            const manager = new SessionManager(5, timeout);
            const session = manager.createSession();

            // 绑定 APP
            manager.updateConnectionState(session.deviceId, {
              boundToApp: true,
              connected: true,
              targetId: targetId,
            });

            // 验证初始状态
            const beforeDisconnect = manager.getSession(session.deviceId);
            if (!beforeDisconnect || beforeDisconnect.disconnectedAt !== null) {
              manager.stopCleanupTimer();
              manager.clearAll();
              return false;
            }

            // 记录断开前的时间
            const beforeTime = Date.now();

            // APP 断开
            manager.handleDisconnection(session.deviceId);

            // 记录断开后的时间
            const afterTime = Date.now();

            // 验证 disconnectedAt 被记录
            const afterDisconnect = manager.getSession(session.deviceId);
            const timestampRecorded =
              afterDisconnect !== null &&
              afterDisconnect.disconnectedAt !== null &&
              afterDisconnect.disconnectedAt.getTime() >= beforeTime &&
              afterDisconnect.disconnectedAt.getTime() <= afterTime;

            manager.stopCleanupTimer();
            manager.clearAll();

            return timestampRecorded;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Feature: waveform-and-playback-improvements
   * Integration Tests for APP Disconnect Reconnection Flow
   * 
   * Tests the complete flow of APP disconnect → reconnection timeout → session recovery/deletion
   * 
   * Validates: Requirements 10.5
   */
  describe("APP Disconnect Integration Tests", () => {
    test("APP 断开 → 重连超时内重连 → 恢复会话", async () => {
      // 使用短超时便于测试
      const manager = new SessionManager(5, 0.05); // 0.05 分钟 = 3 秒
      const session = manager.createSession();
      const targetId = "app-integration-1";

      // 绑定 APP
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: targetId,
      });

      // 设置一些会话数据
      manager.setAlias(session.deviceId, "test-device");
      manager.updateStrength(session.deviceId, 100, 150, 180, 190);

      // APP 断开
      manager.handleDisconnection(session.deviceId);

      // 验证断开状态
      let updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession).not.toBeNull();
      expect(updatedSession!.connected).toBe(false);
      expect(updatedSession!.boundToApp).toBe(true);
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();

      // 在超时前重连（等待 1 秒）
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 模拟重连
      const mockWs = {} as WebSocket;
      const newClientId = "new-client-integration-1";
      const success = manager.handleReconnection(session.deviceId, mockWs, newClientId);

      expect(success).toBe(true);

      // 验证恢复状态
      updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession).not.toBeNull();
      expect(updatedSession!.connected).toBe(true);
      expect(updatedSession!.reconnectionTimeoutId).toBeNull();
      expect(updatedSession!.disconnectedAt).toBeNull();
      expect(updatedSession!.ws).toBe(mockWs);
      expect(updatedSession!.clientId).toBe(newClientId);

      // 验证会话数据保留
      expect(updatedSession!.alias).toBe("test-device");
      expect(updatedSession!.strengthA).toBe(100);
      expect(updatedSession!.strengthB).toBe(150);
      expect(updatedSession!.strengthLimitA).toBe(180);
      expect(updatedSession!.strengthLimitB).toBe(190);

      manager.stopCleanupTimer();
      manager.clearAll();
    }, 10000);

    test("APP 断开 → 超时 → 会话删除", async () => {
      // 使用非常短的超时便于测试
      const manager = new SessionManager(5, 0.05); // 0.05 分钟 = 3 秒
      const session = manager.createSession();
      const targetId = "app-integration-2";

      // 绑定 APP
      manager.updateConnectionState(session.deviceId, {
        boundToApp: true,
        connected: true,
        targetId: targetId,
      });

      // APP 断开
      manager.handleDisconnection(session.deviceId);

      // 验证断开状态
      let updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession).not.toBeNull();
      expect(updatedSession!.reconnectionTimeoutId).not.toBeNull();

      // 等待超时（3 秒 + 缓冲）
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // 验证会话已被删除
      updatedSession = manager.getSession(session.deviceId);
      expect(updatedSession).toBeNull();

      manager.stopCleanupTimer();
    }, 10000);

    test("多个设备同时 APP 断开 → 部分重连 → 部分超时", async () => {
      // 使用短超时便于测试
      const manager = new SessionManager(5, 0.05); // 0.05 分钟 = 3 秒
      const appId = "shared-app-integration";

      // 创建 3 个会话并绑定到同一个 APP
      const session1 = manager.createSession();
      const session2 = manager.createSession();
      const session3 = manager.createSession();

      for (const s of [session1, session2, session3]) {
        manager.updateConnectionState(s.deviceId, {
          boundToApp: true,
          connected: true,
          targetId: appId,
        });
      }

      // 模拟 APP 断开 - 对所有绑定到该 APP 的设备调用 handleDisconnection
      const sessions = manager.listSessions();
      for (const s of sessions) {
        if (s.targetId === appId) {
          manager.handleDisconnection(s.deviceId);
        }
      }

      // 验证所有会话都处于断开状态
      for (const deviceId of [session1.deviceId, session2.deviceId, session3.deviceId]) {
        const s = manager.getSession(deviceId);
        expect(s).not.toBeNull();
        expect(s!.connected).toBe(false);
        expect(s!.reconnectionTimeoutId).not.toBeNull();
      }

      // 等待 1 秒后，只重连 session1
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockWs1 = {} as WebSocket;
      manager.handleReconnection(session1.deviceId, mockWs1, "client-1");

      // 验证 session1 已重连
      let s1 = manager.getSession(session1.deviceId);
      expect(s1).not.toBeNull();
      expect(s1!.connected).toBe(true);

      // 等待超时（再等 3 秒）
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // 验证 session1 仍然存在（已重连）
      s1 = manager.getSession(session1.deviceId);
      expect(s1).not.toBeNull();
      expect(s1!.connected).toBe(true);

      // 验证 session2 和 session3 已被删除（超时）
      expect(manager.getSession(session2.deviceId)).toBeNull();
      expect(manager.getSession(session3.deviceId)).toBeNull();

      manager.stopCleanupTimer();
      manager.clearAll();
    }, 15000);
  });
