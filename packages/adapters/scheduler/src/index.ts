import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

export class SchedulerAdapterPlaceholder implements Adapter {
  readonly key = "scheduler";
  readonly version = "0.1.0";

  async init(_config: Record<string, unknown>): Promise<void> {}
  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    throw new Error("TODO: Scheduler adapter auth not implemented in v1.");
  }
  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }
  async listActions(): Promise<ActionDefinition[]> {
    return [];
  }
  async runTrigger(
    _triggerKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    throw new Error("TODO: Scheduler adapter trigger not implemented in v1.");
  }
  async runAction(
    _actionKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    throw new Error("TODO: Scheduler adapter action not implemented in v1.");
  }
  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    return {
      valid: false,
      errors: ["TODO: not implemented in v1 scope."],
    };
  }
  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new Error("TODO: not implemented in v1.");
  }
}

