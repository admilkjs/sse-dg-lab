/**
 * Control Tools Tests
 * Feature: dg-lab-sse-tool
 * Property 5: Device ID Required for Control Tools
 * Property 6: Invalid Device ID Error
 * Property 7: Channel Validation
 * Property 8: Strength Value Range Validation
 * Property 9: Waveform Array Validation
 * Property 16: Tool Error Format
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  validateDeviceId,
  validateChannel,
  validateStrengthValue,
  validateStrengthMode,
  validateWaveforms,
  resolveDevice,
} from "../tools/control-tools";
import { SessionManager } from "../session-manager";
import { createToolError } from "../tool-manager";

describe("Control Tools Validation", () => {
  /**
   * Property 5: Device ID Required for Control Tools
   * For any call to control tools without a deviceId parameter,
   * the MCP_Server SHALL return a validation error.
   */
  describe("Property 5: Device ID Required", () => {
    test("Missing deviceId returns error", () => {
      const manager = new SessionManager();

      // Test with undefined
      const result1 = validateDeviceId(manager, undefined);
      expect("error" in result1).toBe(true);

      // Test with empty string
      const result2 = validateDeviceId(manager, "");
      expect("error" in result2).toBe(true);
    });

    test("Valid deviceId returns session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();

      const result = validateDeviceId(manager, session.deviceId);
      expect("session" in result).toBe(true);
      expect(result.session?.deviceId).toBe(session.deviceId);
    });
  });

  /**
   * Property 6: Invalid Device ID Error
   * For any call with a deviceId that does not exist,
   * the MCP_Server SHALL return a tool error.
   */
  describe("Property 6: Invalid Device ID Error", () => {
    test("Non-existent deviceId returns error", () => {
      fc.assert(
        fc.property(fc.uuid(), (fakeId) => {
          const manager = new SessionManager();
          // Don't create any session

          const result = validateDeviceId(manager, fakeId);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toContain(fakeId);
          }
        }),
        { numRuns: 50 }
      );
    });

    test("Deleted deviceId returns error", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      const deviceId = session.deviceId;

      // Delete the session
      manager.deleteSession(deviceId);

      const result = validateDeviceId(manager, deviceId);
      expect("error" in result).toBe(true);
    });
  });

  /**
   * Property 7: Channel Validation
   * For any call with a channel value that is not "A" or "B",
   * the MCP_Server SHALL return a validation error.
   */
  describe("Property 7: Channel Validation", () => {
    test("Valid channels A and B are accepted", () => {
      const resultA = validateChannel("A");
      expect("channel" in resultA).toBe(true);
      expect(resultA.channel).toBe("A");

      const resultB = validateChannel("B");
      expect("channel" in resultB).toBe(true);
      expect(resultB.channel).toBe("B");
    });

    test("Invalid channels return error", () => {
      const invalidChannels = fc.string().filter((s) => s !== "A" && s !== "B");

      fc.assert(
        fc.property(invalidChannels, (channel) => {
          const result = validateChannel(channel);
          expect("error" in result).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    test("Missing channel returns error", () => {
      const result = validateChannel(undefined);
      expect("error" in result).toBe(true);
    });

    test("Lowercase channels are rejected", () => {
      expect("error" in validateChannel("a")).toBe(true);
      expect("error" in validateChannel("b")).toBe(true);
    });
  });

  /**
   * Property 8: Strength Value Range Validation
   * For any call with a value outside the range 0-200,
   * the MCP_Server SHALL return a validation error.
   */
  describe("Property 8: Strength Value Range Validation", () => {
    test("Valid values 0-200 are accepted", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 200 }), (value) => {
          const result = validateStrengthValue(value);
          expect("value" in result).toBe(true);
          expect(result.value).toBe(value);
        }),
        { numRuns: 100 }
      );
    });

    test("Values below 0 are rejected", () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000, max: -1 }), (value) => {
          const result = validateStrengthValue(value);
          expect("error" in result).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    test("Values above 200 are rejected", () => {
      fc.assert(
        fc.property(fc.integer({ min: 201, max: 1000 }), (value) => {
          const result = validateStrengthValue(value);
          expect("error" in result).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    test("Non-numeric values are rejected", () => {
      expect("error" in validateStrengthValue("abc")).toBe(true);
      expect("error" in validateStrengthValue(null)).toBe(true);
      expect("error" in validateStrengthValue(undefined)).toBe(true);
      expect("error" in validateStrengthValue(NaN)).toBe(true);
    });

    test("Edge values 0 and 200 are accepted", () => {
      expect("value" in validateStrengthValue(0)).toBe(true);
      expect("value" in validateStrengthValue(200)).toBe(true);
    });
  });

  /**
   * Property 9: Waveform Array Validation
   * For any call with invalid waveforms array,
   * the MCP_Server SHALL return a validation error.
   */
  describe("Property 9: Waveform Array Validation", () => {
    test("Valid 16-char hex strings are accepted", () => {
      // Generate valid 16-char hex strings
      const hexCharArb = fc.constantFrom(..."0123456789abcdef".split(""));
      const validHexArb = fc.array(hexCharArb, { minLength: 16, maxLength: 16 }).map((arr) => arr.join(""));

      fc.assert(
        fc.property(
          fc.array(validHexArb, { minLength: 1, maxLength: 10 }),
          (waveforms) => {
            const result = validateWaveforms(waveforms);
            expect("waveforms" in result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("Invalid hex strings are rejected", () => {
      // Wrong length
      expect("error" in validateWaveforms(["abc"])).toBe(true);
      expect("error" in validateWaveforms(["0123456789abcdef0"])).toBe(true); // 17 chars

      // Non-hex characters
      expect("error" in validateWaveforms(["ghijklmnopqrstuv"])).toBe(true);
    });

    test("Array length > 100 is rejected", () => {
      const validHex = "0123456789abcdef";
      const longArray = Array(101).fill(validHex);

      const result = validateWaveforms(longArray);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("100");
      }
    });

    test("Empty array is rejected", () => {
      const result = validateWaveforms([]);
      expect("error" in result).toBe(true);
    });

    test("Non-array is rejected", () => {
      expect("error" in validateWaveforms("not an array")).toBe(true);
      expect("error" in validateWaveforms(null)).toBe(true);
      expect("error" in validateWaveforms(undefined)).toBe(true);
    });

    test("Array with exactly 100 items is accepted", () => {
      const validHex = "0123456789abcdef";
      const maxArray = Array(100).fill(validHex);

      const result = validateWaveforms(maxArray);
      expect("waveforms" in result).toBe(true);
    });
  });

  /**
   * Property 16: Tool Error Format
   * For any tool execution that fails, the result SHALL contain
   * isError: true and a content array with descriptive error text.
   */
  describe("Property 16: Tool Error Format", () => {
    test("createToolError returns correct format", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (message) => {
          const result = createToolError(message);

          // Must have isError: true
          expect(result.isError).toBe(true);

          // Must have content array
          expect(Array.isArray(result.content)).toBe(true);
          expect(result.content.length).toBeGreaterThan(0);

          // Content must have type and text
          expect(result.content[0].type).toBe("text");
          expect(typeof result.content[0].text).toBe("string");

          // Text should contain the error message
          expect(result.content[0].text).toContain(message);
        }),
        { numRuns: 50 }
      );
    });

    test("Error text is descriptive", () => {
      const result = createToolError("Device not found");

      expect(result.isError).toBe(true);
      expect(result.content[0].text.length).toBeGreaterThan(5);
    });
  });

  describe("Strength Mode Validation", () => {
    test("Valid modes are accepted", () => {
      expect("mode" in validateStrengthMode("increase")).toBe(true);
      expect("mode" in validateStrengthMode("decrease")).toBe(true);
      expect("mode" in validateStrengthMode("set")).toBe(true);
    });

    test("Invalid modes are rejected", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !["increase", "decrease", "set"].includes(s)),
          (mode) => {
            const result = validateStrengthMode(mode);
            expect("error" in result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 5: Alias Resolution Consistency
   * For any control tool call, using a valid alias should correctly identify
   * and operate on the corresponding device, with the same effect as using deviceId.
   * Validates: Requirements 2.1, 2.4
   */
  describe("Property 5: Alias Resolution Consistency", () => {
    test("resolveDevice with deviceId returns correct session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();

      const result = resolveDevice(manager, session.deviceId, undefined);
      expect("session" in result).toBe(true);
      if ("session" in result) {
        expect(result.session.deviceId).toBe(session.deviceId);
      }

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("resolveDevice with alias returns correct session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.setAlias(session.deviceId, "test-device");

      const result = resolveDevice(manager, undefined, "test-device");
      expect("session" in result).toBe(true);
      if ("session" in result) {
        expect(result.session.deviceId).toBe(session.deviceId);
      }

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("Property: For any device with alias, resolveDevice finds it", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          (alias) => {
            const manager = new SessionManager();
            const session = manager.createSession();
            manager.setAlias(session.deviceId, alias);

            const result = resolveDevice(manager, undefined, alias);
            expect("session" in result).toBe(true);
            if ("session" in result) {
              expect(result.session.deviceId).toBe(session.deviceId);
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
   * Property 6: deviceId Priority
   * For any tool call that provides both deviceId and alias,
   * the system should use the deviceId and ignore the alias.
   * Validates: Requirements 2.2
   */
  describe("Property 6: deviceId Priority", () => {
    test("deviceId takes priority over alias", () => {
      const manager = new SessionManager();
      const session1 = manager.createSession();
      const session2 = manager.createSession();
      manager.setAlias(session1.deviceId, "device-one");
      manager.setAlias(session2.deviceId, "device-two");

      // Provide deviceId of session1 but alias of session2
      const result = resolveDevice(manager, session1.deviceId, "device-two");
      expect("session" in result).toBe(true);
      if ("session" in result) {
        // Should return session1 (by deviceId), not session2 (by alias)
        expect(result.session.deviceId).toBe(session1.deviceId);
      }

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("Property: deviceId always wins over alias", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (alias1, alias2) => {
            const manager = new SessionManager();
            const session1 = manager.createSession();
            const session2 = manager.createSession();
            manager.setAlias(session1.deviceId, alias1);
            manager.setAlias(session2.deviceId, alias2);

            // Provide deviceId of session1 but alias of session2
            const result = resolveDevice(manager, session1.deviceId, alias2);
            expect("session" in result).toBe(true);
            if ("session" in result) {
              expect(result.session.deviceId).toBe(session1.deviceId);
            }

            manager.stopCleanupTimer();
            manager.clearAll();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Multiple alias match error
   * Validates: Requirements 2.3
   */
  describe("Multiple Alias Match Error", () => {
    test("Multiple devices with same alias returns error", () => {
      const manager = new SessionManager();
      const session1 = manager.createSession();
      const session2 = manager.createSession();
      manager.setAlias(session1.deviceId, "shared-alias");
      manager.setAlias(session2.deviceId, "shared-alias");

      const result = resolveDevice(manager, undefined, "shared-alias");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("多个设备");
      }

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("Non-existent alias returns error", () => {
      const manager = new SessionManager();
      manager.createSession();

      const result = resolveDevice(manager, undefined, "non-existent");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("未找到");
      }

      manager.stopCleanupTimer();
      manager.clearAll();
    });

    test("Neither deviceId nor alias returns error", () => {
      const manager = new SessionManager();

      const result = resolveDevice(manager, undefined, undefined);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("必须提供");
      }

      manager.stopCleanupTimer();
    });
  });
});
