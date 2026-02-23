// Run this test to verify Ollama CLI transformation

import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  isCliBackendCommand,
  isOllamaModel,
  shouldTransformForOllama,
  transformCliCommandForOllama,
  resolveOllamaProvider,
} from "./cli-backend-ollama.js";

describe("cli-backend-ollama", () => {
  describe("isCliBackendCommand", () => {
    it("detects claude commands", () => {
      expect(isCliBackendCommand("claude 'hello'")).toBe(true);
      expect(isCliBackendCommand("  claude 'hello'")).toBe(true);
      expect(isCliBackendCommand("claude --model test 'hello'")).toBe(true);
    });

    it("detects codex commands", () => {
      expect(isCliBackendCommand("codex exec 'hello'")).toBe(true);
      expect(isCliBackendCommand("  codex exec 'hello'")).toBe(true);
    });

    it("rejects non-cli commands", () => {
      expect(isCliBackendCommand("ls -la")).toBe(false);
      expect(isCliBackendCommand("git status")).toBe(false);
      expect(isCliBackendCommand("echo hello")).toBe(false);
    });
  });

  describe("isOllamaModel", () => {
    it("detects ollama models", () => {
      expect(isOllamaModel("ollama/kimi-k2.5:cloud")).toBe(true);
      expect(isOllamaModel("ollama/qwen2.5-coder:32b")).toBe(true);
    });

    it("rejects non-ollama models", () => {
      expect(isOllamaModel("anthropic/claude-sonnet-4-5")).toBe(false);
      expect(isOllamaModel("openai/gpt-4o")).toBe(false);
      expect(isOllamaModel("kimi-k2.5:cloud")).toBe(false);
    });
  });

  describe("shouldTransformForOllama", () => {
    it("returns true for claude + ollama model", () => {
      expect(shouldTransformForOllama("claude 'hello'", "ollama/kimi-k2.5:cloud")).toBe(true);
    });

    it("returns true for codex + ollama model", () => {
      expect(shouldTransformForOllama("codex exec 'hello'", "ollama/qwen2.5-coder:32b")).toBe(true);
    });

    it("returns false without ollama model", () => {
      expect(shouldTransformForOllama("claude 'hello'", "anthropic/claude-sonnet")).toBe(false);
    });

    it("returns false for non-cli commands", () => {
      expect(shouldTransformForOllama("ls -la", "ollama/kimi-k2.5:cloud")).toBe(false);
    });

    it("returns false when model is undefined", () => {
      expect(shouldTransformForOllama("claude 'hello'", undefined)).toBe(false);
    });
  });

  describe("transformCliCommandForOllama", () => {
    const defaultProvider = { baseUrl: "http://localhost:11434" };

    describe("claude", () => {
      it("transforms simple command", () => {
        const result = transformCliCommandForOllama(
          "claude 'build a todo app'",
          "ollama/kimi-k2.5:cloud",
          defaultProvider,
        );

        expect(result.transformed).toBe(true);
        expect(result.command).toBe("claude --model kimi-k2.5:cloud 'build a todo app'");
        expect(result.env).toEqual({
          ANTHROPIC_API_KEY: "ollama",
          ANTHROPIC_BASE_URL: "http://localhost:11434",
        });
      });

      it("replaces existing --model", () => {
        const result = transformCliCommandForOllama(
          "claude --model anthropic/claude-sonnet 'build app'",
          "ollama/kimi-k2.5:cloud",
          defaultProvider,
        );

        expect(result.transformed).toBe(true);
        expect(result.command).toBe("claude --model kimi-k2.5:cloud 'build app'");
      });

      it("handles commands with extra whitespace", () => {
        const result = transformCliCommandForOllama(
          "  claude   'build app'  ",
          "ollama/kimi-k2.5:cloud",
          defaultProvider,
        );

        expect(result.transformed).toBe(true);
        expect(result.command).toContain("--model kimi-k2.5:cloud");
      });
    });

    describe("codex", () => {
      it("transforms simple command", () => {
        const result = transformCliCommandForOllama(
          "codex exec 'build a todo app'",
          "ollama/qwen2.5-coder:32b",
          defaultProvider,
        );

        expect(result.transformed).toBe(true);
        expect(result.command).toBe("codex --model qwen2.5-coder:32b exec 'build a todo app'");
        expect(result.env).toEqual({
          OPENAI_API_KEY: "ollama",
          OPENAI_API_BASE: "http://localhost:11434/v1",
        });
      });

      it("replaces existing --model", () => {
        const result = transformCliCommandForOllama(
          "codex --model gpt-4o exec 'build app'",
          "ollama/qwen2.5-coder:32b",
          defaultProvider,
        );

        expect(result.transformed).toBe(true);
        expect(result.command).toBe("codex --model qwen2.5-coder:32b exec 'build app'");
      });
    });

    describe("non-ollama models", () => {
      it("returns untransformed for anthropic models", () => {
        const result = transformCliCommandForOllama(
          "claude 'hello'",
          "anthropic/claude-sonnet",
          defaultProvider,
        );

        expect(result.transformed).toBe(false);
        expect(result.command).toBe("claude 'hello'");
        expect(result.env).toEqual({});
      });

      it("returns untransformed for non-cli commands", () => {
        const result = transformCliCommandForOllama(
          "ls -la",
          "ollama/kimi-k2.5:cloud",
          defaultProvider,
        );

        expect(result.transformed).toBe(false);
        expect(result.command).toBe("ls -la");
      });
    });

    describe("provider baseUrl variations", () => {
      it("handles trailing slash", () => {
        const result = transformCliCommandForOllama("claude 'hello'", "ollama/kimi-k2.5:cloud", {
          baseUrl: "http://localhost:11434/",
        });

        expect(result.env.ANTHROPIC_BASE_URL).toBe("http://localhost:11434");
      });

      it("uses default endpoint when provider undefined", () => {
        const result = transformCliCommandForOllama(
          "claude 'hello'",
          "ollama/kimi-k2.5:cloud",
          undefined,
        );

        expect(result.env.ANTHROPIC_BASE_URL).toBe("http://localhost:11434");
      });
    });
  });

  describe("resolveOllamaProvider", () => {
    it("finds provider by key name", () => {
      const cfg = {
        models: {
          providers: {
            ollama: { api: "ollama", baseUrl: "http://localhost:11434" },
          },
        },
      } as unknown as OpenClawConfig;

      const result = resolveOllamaProvider(cfg);
      expect(result?.baseUrl).toBe("http://localhost:11434");
    });

    it("finds provider by api type", () => {
      const cfg = {
        models: {
          providers: {
            local: { api: "ollama", baseUrl: "http://192.168.1.100:11434" },
          },
        },
      } as unknown as OpenClawConfig;

      const result = resolveOllamaProvider(cfg);
      expect(result?.baseUrl).toBe("http://192.168.1.100:11434");
    });

    it("returns undefined when no ollama provider", () => {
      const cfg = {
        models: {
          providers: {
            anthropic: { api: "anthropic-messages" },
          },
        },
      } as unknown as OpenClawConfig;

      const result = resolveOllamaProvider(cfg);
      expect(result).toBeUndefined();
    });

    it("returns undefined when no providers", () => {
      const cfg = {} as unknown as OpenClawConfig;
      const result = resolveOllamaProvider(cfg);
      expect(result).toBeUndefined();
    });
  });
});
