import { sanitizeSensitiveMessage } from "@integration/shared";
import { type AgentMemoryScope, type RunRepository } from "../repositories/run-repository";

export type AgentMemoryScopeMap = {
  workflow: Record<string, unknown>;
  run: Record<string, unknown>;
};

export async function saveMemory(input: {
  runRepository: RunRepository;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  workflowId: string;
  runId?: string;
  scope: AgentMemoryScope;
  key: string;
  value: unknown;
  createdByStepId?: string;
  createdByStepPath?: string;
}): Promise<void> {
  await input.runRepository.upsertAgentMemory({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    runId: input.runId,
    scope: input.scope,
    key: sanitizeSensitiveMessage(input.key).slice(0, 160),
    value: input.value,
    createdByStepId: input.createdByStepId,
    createdByStepPath: input.createdByStepPath,
  });
}

export async function getMemory(input: {
  runRepository: RunRepository;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  workflowId?: string;
  runId?: string;
  scope?: AgentMemoryScope;
  query?: string;
  limit?: number;
}) {
  return input.runRepository.listAgentMemories({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    runId: input.runId,
    scope: input.scope,
    query: input.query,
    limit: input.limit,
  });
}

export async function injectMemoryIntoAgentContext(input: {
  runRepository: RunRepository;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  workflowId: string;
  runId: string;
}): Promise<AgentMemoryScopeMap> {
  return input.runRepository.getAgentMemoryMap({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    runId: input.runId,
  });
}

