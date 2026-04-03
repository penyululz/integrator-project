import { describe, expect, it, vi } from "vitest";
import {
  getMemory,
  injectMemoryIntoAgentContext,
  saveMemory,
} from "./memory";

describe("agent memory helpers", () => {
  it("persists memory with scoped save helper", async () => {
    const runRepository = {
      upsertAgentMemory: vi.fn().mockResolvedValue({
        id: "memory-1",
      }),
    };

    await saveMemory({
      runRepository: runRepository as never,
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      workflowId: "wf-1",
      scope: "workflow",
      key: "team.tone",
      value: {
        voice: "concise",
      },
    });

    expect(runRepository.upsertAgentMemory).toHaveBeenCalledTimes(1);
    expect(runRepository.upsertAgentMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "workflow",
        key: "team.tone",
      }),
    );
  });

  it("queries memory and injects run/workflow maps", async () => {
    const runRepository = {
      listAgentMemories: vi.fn().mockResolvedValue([]),
      getAgentMemoryMap: vi.fn().mockResolvedValue({
        workflow: {
          "team.tone": "friendly",
        },
        run: {
          "agent.last_output": "Done",
        },
      }),
    };

    const listed = await getMemory({
      runRepository: runRepository as never,
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      workflowId: "wf-1",
      scope: "workflow",
    });
    expect(listed).toEqual([]);
    expect(runRepository.listAgentMemories).toHaveBeenCalledTimes(1);

    const injected = await injectMemoryIntoAgentContext({
      runRepository: runRepository as never,
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      workflowId: "wf-1",
      runId: "run-1",
    });
    expect(injected.workflow["team.tone"]).toBe("friendly");
    expect(injected.run["agent.last_output"]).toBe("Done");
  });
});

