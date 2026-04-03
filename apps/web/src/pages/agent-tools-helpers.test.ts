import { describe, expect, it } from "vitest";
import {
  applyAgentPermissionState,
  defaultAgentPermissionState,
  explainToolSelection,
  extractAgentPermissionState,
  extractAgentTracesFromRun,
  formatAgentReasoningSteps,
  getAgentPermissionOptions,
  groupTraceIntoReasoningBlocks,
  streamAgentExecution,
} from "./agent-tools-helpers";

describe("agent-tools-helpers", () => {
  it("reads and writes permission state in step config", () => {
    expect(defaultAgentPermissionState()).toEqual({
      mode: "allow_all",
      allowedToolIds: [],
    });

    const parsed = extractAgentPermissionState({
      agentToolPermissionMode: "allow_list",
      agentAllowedToolIds: ["summarizeText", "ai.generateContent", "ai.generateContent"],
    });

    expect(parsed).toEqual({
      mode: "allow_list",
      allowedToolIds: ["ai.summarizeText", "ai.generateContent"],
    });

    expect(
      applyAgentPermissionState(
        { existing: true },
        {
          mode: "allow_all",
          allowedToolIds: ["ai.summarizeText"],
        },
      ),
    ).toEqual({ existing: true });
  });

  it("builds selectable permission options from tools", () => {
    const options = getAgentPermissionOptions([
      {
        id: "ai.summarizeText",
        title: "AI Summarize",
        description: "Summarize",
        inputSchema: {},
        category: "research",
        safetyLevel: "low",
      },
      {
        id: "slack.sendMessage",
        title: "Slack Send Message",
        description: "Post",
        inputSchema: {},
        category: "communication",
        safetyLevel: "high",
        requiresApproval: true,
      },
    ]);

    expect(options[0]).toEqual({
      id: "ai.summarizeText",
      label: "AI Summarize",
      hint: "research | safety low",
      requiresApproval: false,
    });
    expect(options[1].requiresApproval).toBe(true);
  });

  it("extracts agent trace blocks from run results", () => {
    const traces = extractAgentTracesFromRun({
      id: "run_1",
      workflow_id: "wf_1",
      status: "success",
      attempt_count: 1,
      max_attempts: 3,
      last_error: null,
      dead_lettered_at: null,
      started_at: null,
      finished_at: null,
      created_at: "2026-04-03T00:00:00.000Z",
      result_json: {
        steps: [
          {
            stepId: "agent_step",
            stepPath: "0",
            output: {
              trace: {
                goal: "Summarize launch notes",
                allowedToolIds: ["ai.summarizeText"],
                iterations: 1,
                finalOutput: "Summary",
                awaitingApproval: true,
                pendingApprovals: [
                  {
                    toolId: "slack.sendMessage",
                    title: "Slack Send Message",
                    safetyLevel: "high",
                    reason: "Approval required",
                  },
                ],
                steps: [
                  {
                    iteration: 1,
                    decision: "Selected ai.summarizeText",
                    toolCall: {
                      toolId: "ai.summarizeText",
                      title: "AI Summarize",
                      category: "research",
                      safetyLevel: "low",
                      inputPreview: "{}",
                      outputPreview: "summary",
                      status: "completed",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    expect(traces).toHaveLength(1);
    expect(traces[0].goal).toBe("Summarize launch notes");
    expect(traces[0].steps[0].toolCall.toolId).toBe("ai.summarizeText");
    expect(traces[0].awaitingApproval).toBe(true);
    expect(traces[0].pendingApprovals[0].toolId).toBe("slack.sendMessage");
  });

  it("formats trace steps into reasoning blocks with explanation confidence", () => {
    const [trace] = extractAgentTracesFromRun({
      id: "run_1",
      workflow_id: "wf_1",
      status: "running",
      attempt_count: 1,
      max_attempts: 3,
      last_error: null,
      dead_lettered_at: null,
      started_at: null,
      finished_at: null,
      created_at: "2026-04-03T00:00:00.000Z",
      result_json: {
        steps: [
          {
            stepId: "agent_step",
            stepPath: "0",
            output: {
              trace: {
                goal: "Summarize launch notes",
                allowedToolIds: ["ai.summarizeText"],
                iterations: 1,
                finalOutput: "Summary",
                steps: [
                  {
                    iteration: 1,
                    decision: "Selected ai.summarizeText",
                    toolCall: {
                      toolId: "ai.summarizeText",
                      title: "AI Summarize",
                      category: "research",
                      safetyLevel: "low",
                      inputPreview: "{}",
                      outputPreview: "summary",
                      status: "completed",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    const explanation = explainToolSelection(trace.steps[0]);
    expect(explanation.confidence).toBeGreaterThan(0.5);

    const formatted = formatAgentReasoningSteps(trace);
    expect(formatted).toHaveLength(1);
    expect(formatted[0].action).toBe("AI Summarize");

    const blocks = groupTraceIntoReasoningBlocks(trace);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].kind).toBe("thinking");
    expect(blocks[1].kind).toBe("tool_call");

    const streamed = streamAgentExecution(trace, "running");
    expect(streamed.some((block) => block.streamState === "active")).toBe(true);
  });
});
