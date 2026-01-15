/**
 * Device Tools Tests
 * Feature: dg-lab-sse-tool
 * Property 13: Device List Completeness
 * Property 10: Alias Setting Persistence
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { SessionManager } from "../session-manager";

describe("Device Tools", () => {
  /**
   * Property 13: Device List Completeness
   * For any set of created devices, calling listSessions SHALL return all
   * devices with their complete status information.
   */
  describe("Property 13: Device List Completeness", () => {
    test("All created devices appear in list with complete info", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (count) => {
            const manager = new SessionManager();
            const createdIds: string[] = [];

            // Create devices
            for (let i = 0; i < count; i++) {
              const session = manager.createSession();
              createdIds.push(session.deviceId);
            }

            // List all devices
            const sessions = manager.listSessions();

            // All created devices should be in the list
            expect(sessions.length).toBe(count);

            for (const id of createdIds) {
              const found = sessions.find((s) => s.deviceId === id);
              expect(found).not.toBeUndefined();

              // Check all required fields exist
              expect(found!.deviceId).toBe(id);
              expect(typeof found!.alias).toBe("object"); // null or string
              expect(typeof found!.connected).toBe("boolean");
              expect(typeof found!.boundToApp).toBe("boolean");
              expect(typeof found!.strengthA).toBe("number");
              expect(typeof found!.strengthB).toBe("number");
              expect(typeof found!.strengthLimitA).toBe("number");
              expect(typeof found!.strengthLimitB).toBe("number");
              expect(found!.lastActive instanceof Date).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test("Device list includes all status fields", () => {
      const manager = new SessionManager();
      const session = manager.createSession();

      // Set some values
      manager.setAlias(session.deviceId, "TestUser");
      manager.updateStrength(session.deviceId, 50, 75, 100, 150);
      manager.updateConnectionState(session.deviceId, {
        connected: true,
        boundToApp: true,
        clientId: "client-123",
        targetId: "target-456",
      });

      const sessions = manager.listSessions();
      const found = sessions.find((s) => s.deviceId === session.deviceId);

      expect(found).not.toBeUndefined();
      expect(found!.alias).toBe("TestUser");
      expect(found!.connected).toBe(true);
      expect(found!.boundToApp).toBe(true);
      expect(found!.strengthA).toBe(50);
      expect(found!.strengthB).toBe(75);
      expect(found!.strengthLimitA).toBe(100);
      expect(found!.strengthLimitB).toBe(150);
    });

    test("Deleted devices do not appear in list", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 0, max: 9 }),
          (count, deleteIndex) => {
            const manager = new SessionManager();
            const createdIds: string[] = [];

            // Create devices
            for (let i = 0; i < count; i++) {
              const session = manager.createSession();
              createdIds.push(session.deviceId);
            }

            // Delete one device
            const actualDeleteIndex = deleteIndex % count;
            const deletedId = createdIds[actualDeleteIndex];
            manager.deleteSession(deletedId);

            // List should not include deleted device
            const sessions = manager.listSessions();
            expect(sessions.length).toBe(count - 1);
            expect(sessions.find((s) => s.deviceId === deletedId)).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 10: Alias Setting Persistence
   * For any device, after calling setAlias with a given alias,
   * the device SHALL have that alias in subsequent queries.
   */
  describe("Property 10: Alias Setting Persistence", () => {
    test("Set alias persists in session", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (alias) => {
            const manager = new SessionManager();
            const session = manager.createSession();

            // Set alias
            const result = manager.setAlias(session.deviceId, alias);
            expect(result.success).toBe(true);

            // Get session and verify alias
            const retrieved = manager.getSession(session.deviceId);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.alias).toBe(alias);

            manager.stopCleanupTimer();
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Alias appears in list sessions", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (alias) => {
            const manager = new SessionManager();
            const session = manager.createSession();

            manager.setAlias(session.deviceId, alias);

            const sessions = manager.listSessions();
            const found = sessions.find((s) => s.deviceId === session.deviceId);

            expect(found).not.toBeUndefined();
            expect(found!.alias).toBe(alias);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Alias can be updated", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (alias1, alias2) => {
            const manager = new SessionManager();
            const session = manager.createSession();

            // Set first alias
            manager.setAlias(session.deviceId, alias1);
            expect(manager.getSession(session.deviceId)!.alias).toBe(alias1);

            // Update to second alias
            manager.setAlias(session.deviceId, alias2);
            expect(manager.getSession(session.deviceId)!.alias).toBe(alias2);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("Alias is found by findByAlias", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (alias) => {
            const manager = new SessionManager();
            const session = manager.createSession();

            manager.setAlias(session.deviceId, alias);

            const found = manager.findByAlias(alias);
            expect(found.length).toBe(1);
            expect(found[0].deviceId).toBe(session.deviceId);
            expect(found[0].alias).toBe(alias);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
