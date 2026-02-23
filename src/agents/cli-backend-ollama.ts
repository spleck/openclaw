/**
 * CLI Backend Ollama Integration
 *
 * Automatically routes Claude Code and Codex CLI calls to Ollama endpoints
 * when the session model is an Ollama provider.
 */

import type { OpenClawConfig } from "../config/config.js";

export interface TransformedCommand {
  command: string;
  env: Record<string, string>;
  transformed: boolean;
}

export interface OllamaProviderConfig {
  baseUrl?: string;
}

/**
 * Check if a command is a CLI backend that supports Ollama redirection
 */
export function isCliBackendCommand(command: string): boolean {
  const trimmed = command.trimStart();
  return trimmed.startsWith("claude ") || trimmed.startsWith("codex ");
}

/**
 * Check if model reference is an Ollama provider
 */
export function isOllamaModel(modelRef: string): boolean {
  return modelRef.startsWith("ollama/");
}

/**
 * Determine if command should be transformed for Ollama
 */
export function shouldTransformForOllama(command: string, modelRef?: string): boolean {
  if (!modelRef) {
    return false;
  }
  return isOllamaModel(modelRef) && isCliBackendCommand(command);
}

/**
 * Parse the binary (claude/codex) and the rest of the command
 */
function parseCliCommand(command: string): { binary: string; rest: string } | null {
  const trimmed = command.trimStart();

  if (trimmed.startsWith("claude ")) {
    return { binary: "claude", rest: trimmed.slice(7) };
  }
  if (trimmed.startsWith("codex ")) {
    return { binary: "codex", rest: trimmed.slice(6) };
  }

  return null;
}

/**
 * Extract or inject --model flag with Ollama model name
 */
function transformModelFlag(commandRest: string, ollamaModel: string): string {
  const modelFlagRegex = /--model\s+(\S+)/;

  if (modelFlagRegex.test(commandRest)) {
    // Replace existing --model value
    return commandRest.replace(modelFlagRegex, `--model ${ollamaModel}`);
  }

  // Inject --model at the beginning
  return `--model ${ollamaModel} ${commandRest}`;
}

/**
 * Get environment variables for Ollama-compatible CLI backend
 */
function getOllamaEnvVars(binary: "claude" | "codex", endpoint: string): Record<string, string> {
  const baseUrl = endpoint.replace(/\/$/, "");

  if (binary === "claude") {
    return {
      ANTHROPIC_API_KEY: "ollama",
      ANTHROPIC_BASE_URL: baseUrl,
    };
  }

  // codex
  return {
    OPENAI_API_KEY: "ollama",
    OPENAI_API_BASE: `${baseUrl}/v1`,
  };
}

/**
 * Transform a CLI backend command to use Ollama
 *
 * @param command - Original command (e.g., "claude 'build a todo app'")
 * @param modelRef - Full model reference (e.g., "ollama/kimi-k2.5:cloud")
 * @param ollamaProvider - Optional Ollama provider config for baseUrl
 * @returns Transformed command with env vars
 */
export function transformCliCommandForOllama(
  command: string,
  modelRef: string,
  ollamaProvider?: OllamaProviderConfig,
): TransformedCommand {
  // Validation
  if (!isOllamaModel(modelRef)) {
    return { command, env: {}, transformed: false };
  }

  const parsed = parseCliCommand(command);
  if (!parsed) {
    return { command, env: {}, transformed: false };
  }

  const { binary, rest } = parsed;
  const [, ollamaModel] = modelRef.split("/");

  if (!ollamaModel) {
    return { command, env: {}, transformed: false };
  }

  const endpoint = ollamaProvider?.baseUrl ?? "http://localhost:11434";

  // Transform command
  const transformedRest = transformModelFlag(rest, ollamaModel);
  const transformedCommand = `${binary} ${transformedRest}`;

  // Get env vars
  const env = getOllamaEnvVars(binary as "claude" | "codex", endpoint);

  return {
    command: transformedCommand,
    env,
    transformed: true,
  };
}

/**
 * Resolve Ollama provider config from OpenClaw config
 */
export function resolveOllamaProvider(cfg: OpenClawConfig): OllamaProviderConfig | undefined {
  const providers = cfg.models?.providers;
  if (!providers) {
    return undefined;
  }

  // Look for ollama provider by key name or api type
  for (const [key, provider] of Object.entries(providers)) {
    const p = provider as Record<string, unknown>;
    if (key === "ollama" || p.api === "ollama") {
      return {
        baseUrl: typeof p.baseUrl === "string" ? p.baseUrl : undefined,
      };
    }
  }

  return undefined;
}
