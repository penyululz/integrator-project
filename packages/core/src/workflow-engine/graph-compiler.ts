import type {
  WorkflowActionStep,
  WorkflowBranchStep,
  WorkflowDefinition,
  WorkflowStep,
} from "@integration/shared";
import { WorkflowEngineError } from "./errors";
import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "./types";

type GraphContext = {
  nodeById: Map<string, WorkflowGraphNode>;
  outgoingByNodeId: Map<string, WorkflowGraphEdge[]>;
};

function toNonEmpty(value: string | undefined, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: `${field} is required.`,
    });
  }
  return normalized;
}

function sortedEdges(edges: WorkflowGraphEdge[]): WorkflowGraphEdge[] {
  return [...edges].sort((a, b) => {
    const aOrder = Number.isFinite(a.order) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.order) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

function buildGraphContext(graph: WorkflowGraph): GraphContext {
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: "Workflow graph must include at least one node.",
    });
  }
  if (!Array.isArray(graph.edges)) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: "Workflow graph edges must be an array.",
    });
  }

  const nodeById = new Map<string, WorkflowGraphNode>();
  for (const node of graph.nodes) {
    const id = toNonEmpty(node.id, "graph node id");
    if (nodeById.has(id)) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Duplicate workflow graph node id "${id}".`,
      });
    }
    nodeById.set(id, {
      ...node,
      id,
    });
  }

  const edgeIds = new Set<string>();
  const outgoingByNodeId = new Map<string, WorkflowGraphEdge[]>();
  for (const edge of graph.edges) {
    const edgeId = toNonEmpty(edge.id, "graph edge id");
    if (edgeIds.has(edgeId)) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Duplicate workflow graph edge id "${edgeId}".`,
      });
    }
    edgeIds.add(edgeId);

    const source = toNonEmpty(edge.source, "graph edge source");
    const target = toNonEmpty(edge.target, "graph edge target");
    if (!nodeById.has(source)) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Edge "${edgeId}" references unknown source node "${source}".`,
      });
    }
    if (!nodeById.has(target)) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Edge "${edgeId}" references unknown target node "${target}".`,
      });
    }

    const normalizedEdge: WorkflowGraphEdge = {
      ...edge,
      id: edgeId,
      source,
      target,
      branch: edge.branch === "then" || edge.branch === "else" ? edge.branch : undefined,
      order: Number.isFinite(edge.order) ? Number(edge.order) : undefined,
    };
    const current = outgoingByNodeId.get(source) || [];
    current.push(normalizedEdge);
    outgoingByNodeId.set(source, current);
  }

  for (const [nodeId, edges] of outgoingByNodeId.entries()) {
    outgoingByNodeId.set(nodeId, sortedEdges(edges));
  }

  return {
    nodeById,
    outgoingByNodeId,
  };
}

function assertAcyclic(context: GraphContext, triggerNodeId: string): void {
  const visited = new Set<string>();
  const active = new Set<string>();

  const visit = (nodeId: string) => {
    if (active.has(nodeId)) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Workflow graph cycle detected at node "${nodeId}".`,
      });
    }
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    active.add(nodeId);
    const outgoing = context.outgoingByNodeId.get(nodeId) || [];
    for (const edge of outgoing) {
      visit(edge.target);
    }
    active.delete(nodeId);
  };

  visit(triggerNodeId);
}

function toActionStep(node: WorkflowGraphNode): WorkflowActionStep {
  return {
    id: node.id,
    type: "action",
    adapter: toNonEmpty(node.adapter, `workflow graph node "${node.id}" adapter`),
    action: toNonEmpty(node.action, `workflow graph node "${node.id}" action`),
    config: node.config || {},
    input: node.input,
    condition: node.condition,
    onError: node.onError,
    retryPolicy: node.retryPolicy,
  };
}

function toDelayStep(node: WorkflowGraphNode): Extract<WorkflowStep, { type: "delay" }> {
  const delayMs =
    typeof node.delayMs === "number" && Number.isFinite(node.delayMs)
      ? Math.max(0, Math.floor(node.delayMs))
      : undefined;
  const delaySeconds =
    typeof node.delaySeconds === "number" && Number.isFinite(node.delaySeconds)
      ? Math.max(0, Math.floor(node.delaySeconds))
      : undefined;

  if (delayMs === undefined && delaySeconds === undefined) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: `Delay node "${node.id}" must include delayMs or delaySeconds.`,
    });
  }

  return {
    id: node.id,
    type: "delay",
    delayMs,
    delaySeconds,
    condition: node.condition,
  };
}

function compileSequenceFromNode(
  context: GraphContext,
  nodeId: string,
): WorkflowStep[] {
  const node = context.nodeById.get(nodeId);
  if (!node) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: `Unknown workflow graph node "${nodeId}".`,
    });
  }

  if (node.kind === "result") {
    return [];
  }
  if (node.kind === "trigger") {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: "Trigger node cannot appear inside executable sequence.",
    });
  }

  if (node.kind === "branch") {
    if (!node.condition) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Branch node "${node.id}" must include a condition.`,
      });
    }

    const outgoing = context.outgoingByNodeId.get(node.id) || [];
    const thenEdges = outgoing.filter((edge) => edge.branch === "then");
    const elseEdges = outgoing.filter((edge) => edge.branch === "else");
    const unlabeled = outgoing.filter((edge) => !edge.branch);

    if (unlabeled.length > 0) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Branch node "${node.id}" edges must declare branch="then" or branch="else".`,
      });
    }
    if (thenEdges.length !== 1) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Branch node "${node.id}" must define exactly one "then" edge.`,
      });
    }
    if (elseEdges.length > 1) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Branch node "${node.id}" can define at most one "else" edge.`,
      });
    }

    const thenSteps = compileSequenceFromNode(context, thenEdges[0].target);
    const elseSteps = elseEdges[0]
      ? compileSequenceFromNode(context, elseEdges[0].target)
      : undefined;
    if (thenSteps.length === 0) {
      throw new WorkflowEngineError({
        code: "invalid_graph",
        statusCode: 400,
        message: `Branch node "${node.id}" must have a non-empty "then" path.`,
      });
    }

    const branchStep: WorkflowBranchStep = {
      id: node.id,
      type: "branch",
      condition: node.condition,
      then: thenSteps,
      else: elseSteps && elseSteps.length > 0 ? elseSteps : undefined,
    };
    return [branchStep];
  }

  const step = node.kind === "delay" ? toDelayStep(node) : toActionStep(node);
  const outgoing = context.outgoingByNodeId.get(node.id) || [];
  if (outgoing.length > 1) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: `Node "${node.id}" fans out to multiple edges. Use a branch node for fan-out.`,
    });
  }
  if (outgoing.length === 0) {
    return [step];
  }

  return [step, ...compileSequenceFromNode(context, outgoing[0].target)];
}

export function compileWorkflowGraphToSteps(graph: WorkflowGraph): WorkflowStep[] {
  const context = buildGraphContext(graph);
  const triggerNodes = [...context.nodeById.values()].filter((node) => node.kind === "trigger");
  if (triggerNodes.length !== 1) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: "Workflow graph must contain exactly one trigger node.",
    });
  }

  const triggerNode = triggerNodes[0];
  assertAcyclic(context, triggerNode.id);

  const triggerEdges = context.outgoingByNodeId.get(triggerNode.id) || [];
  if (triggerEdges.length === 0) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: "Trigger node must have at least one outgoing edge.",
    });
  }

  const steps: WorkflowStep[] = [];
  for (const edge of triggerEdges) {
    steps.push(...compileSequenceFromNode(context, edge.target));
  }

  if (steps.length === 0) {
    throw new WorkflowEngineError({
      code: "invalid_graph",
      statusCode: 400,
      message: "Workflow graph does not produce any executable steps.",
    });
  }

  return steps;
}

export function attachGraphToDefinitionMetadata(input: {
  definition: WorkflowDefinition;
  graph?: WorkflowGraph;
}): WorkflowDefinition {
  if (!input.graph) {
    return input.definition;
  }

  return {
    ...input.definition,
    metadata: {
      ...(input.definition.metadata || {}),
      graph: input.graph,
    },
  };
}

