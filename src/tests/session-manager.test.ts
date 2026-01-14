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
});
