import type { AdapterMetadata, EventLogRecord, RunRecord } from "../api";
import {
  isActionStep,
  isBranchStep,
  isDelayStep,
  type WorkflowDefinition,
  type WorkflowStep,
} from "../types/workflow";
import { buildStepSummary } from "./workflow-builder-helpers";

export type BuilderPaletteItem = {
  id: string;
  label: string;
  description: string;
  stepType: "action" | "branch" | "delay";
  adapterKey?: string;
  actionKey?: string;
  advanced?: boolean;
};

export type BuilderPaletteSection = {
  id: string;
  title: string;
  description: string;
  items: BuilderPaletteItem[];
};

export type BuilderCanvasNodeKind =
  | "trigger"
  | "action"
  | "branch"
  | "delay"
  | "result";

export type BuilderCanvasLane = "trigger" | "steps" | "result";

export type BuilderCanvasNode = {
  id: string;
  kind: BuilderCanvasNodeKind;
  label: string;
  summary: string;
  lane: BuilderCanvasLane;
  order: number;
  dataRef:
    | { type: "trigger" }
    | { type: "step"; stepId: string; stepIndex: number }
    | { type: "result" };
  presentation: {
    x: number;
    y: number;
    width: number;
    height: number;
    tone: "info" | "success" | "warning" | "danger";
  };
  connectability: {
    incomingHandles: string[];
    outgoingHandles: string[];
    branchHandles?: Array<"then" | "else">;
  };
};

export type BuilderCanvasEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: "primary" | "branch";
  branchRole?: "then" | "else" | "default";
  connectRef?: {
    fromHandle: string;
    toHandle: string;
    editable: boolean;
  };
};

export type BuilderCanvasModel = {
  nodes: BuilderCanvasNode[];
  edges: BuilderCanvasEdge[];
};

export type BuilderCanvasBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type BuilderNodePosition = {
  x: number;
  y: number;
};

export type BuilderNodePositionMap = Record<string, BuilderNodePosition>;

export type BuilderViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

export type BuilderEdgeVisualKind =
  | "primary"
  | "branch-default"
  | "branch-then"
  | "branch-else";

export type BuilderRenderableEdge = {
  id: string;
  from: string;
  to: string;
  kind: BuilderEdgeVisualKind;
  label?: string;
  labelPosition?: {
    x: number;
    y: number;
  };
  path: string;
  interactionHint: {
    editable: boolean;
    fromHandle: string;
    toHandle: string;
  };
};

export type BuilderEdgeDraft = {
  fromNodeId: string;
  fromHandle: string;
  pointerX: number;
  pointerY: number;
};

export type BuilderNodeRuntimeStatus = "idle" | "running" | "success" | "error";

export type BuilderNodeRuntimeState = {
  status: BuilderNodeRuntimeStatus;
  preview?: string;
  eventType?: string;
};

export type BuilderNodeRuntimeMap = Record<string, BuilderNodeRuntimeState>;

const GENERIC_CONNECTOR_KEYS = [
  "http-api",
  "scheduler",
  "graphql",
  "code",
  "database",
] as const;
const AI_CONNECTOR_KEY = "ai";

function getAdapter(adapters: AdapterMetadata[], key: string): AdapterMetadata | undefined {
  return adapters.find((adapter) => adapter.key === key);
}

function toStepKind(step: WorkflowStep): BuilderCanvasNodeKind {
  if (isBranchStep(step)) {
    return "branch";
  }
  if (isDelayStep(step)) {
    return "delay";
  }
  return "action";
}

function toStepTone(step: WorkflowStep): "info" | "success" | "warning" | "danger" {
  if (isBranchStep(step)) {
    return "warning";
  }
  if (isDelayStep(step)) {
    return "info";
  }
  if (isActionStep(step) && step.onError === "retry") {
    return "success";
  }
  return "info";
}

function edgeBranchRole(
  edge: BuilderCanvasEdge,
): "then" | "else" | "default" | undefined {
  if (edge.label === "then") {
    return "then";
  }
  if (edge.label === "else") {
    return "else";
  }
  if (edge.kind === "branch") {
    return "default";
  }
  return undefined;
}

export function getBuilderPaletteSections(adapters: AdapterMetadata[]): BuilderPaletteSection[] {
  const coreItems: BuilderPaletteItem[] = [
    {
      id: "action",
      label: "Action step",
      description: "Run an app action using mapped inputs.",
      stepType: "action",
    },
    {
      id: "branch",
      label: "Branch",
      description: "Route flow with if/else conditions.",
      stepType: "branch",
    },
    {
      id: "delay",
      label: "Delay",
      description: "Pause workflow until a future time.",
      stepType: "delay",
    },
  ];

  const powerConnectorItems: BuilderPaletteItem[] = [];
  for (const key of GENERIC_CONNECTOR_KEYS) {
    const adapter = getAdapter(adapters, key);
    if (!adapter) {
      continue;
    }

    powerConnectorItems.push({
      id: `action-${adapter.key}`,
      label: adapter.displayName,
      description: adapter.description,
      stepType: "action",
      adapterKey: adapter.key,
      actionKey: adapter.supportedActions[0],
      advanced: adapter.readinessTier === "advanced" || adapter.readinessTier === "coming_soon",
    });
  }

  const aiAdapter = getAdapter(adapters, AI_CONNECTOR_KEY);
  const aiNodeItems: BuilderPaletteItem[] = [];
  const hasAiAction = (actionKey: string) =>
    Boolean(aiAdapter?.supportedActions?.includes(actionKey));
  if (aiAdapter) {
    if (hasAiAction("generateContent")) {
      aiNodeItems.push({
        id: "ai-generate",
        label: "AI Generate",
        description: "Create new content from prompts.",
        stepType: "action",
        adapterKey: aiAdapter.key,
        actionKey: "generateContent",
      });
    }
    if (hasAiAction("rewriteContent")) {
      aiNodeItems.push({
        id: "ai-rewrite",
        label: "AI Rewrite",
        description: "Rewrite content to match tone, audience, or format goals.",
        stepType: "action",
        adapterKey: aiAdapter.key,
        actionKey: "rewriteContent",
      });
    }
    if (hasAiAction("summarizeText")) {
      aiNodeItems.push({
        id: "ai-summarize",
        label: "AI Summarize",
        description: "Summarize text or structured payloads into concise output.",
        stepType: "action",
        adapterKey: aiAdapter.key,
        actionKey: "summarizeText",
      });
    }
    if (hasAiAction("transformContent")) {
      aiNodeItems.push({
        id: "ai-transform",
        label: "AI Transform",
        description: "Transform content into email, bullet, thread, or paragraph formats.",
        stepType: "action",
        adapterKey: aiAdapter.key,
        actionKey: "transformContent",
      });
    }
    if (hasAiAction("runAgent")) {
      aiNodeItems.push({
        id: "ai-agent",
        label: "AI Agent",
        description: "Goal + tool selection + execution loop foundation for advanced automation.",
        stepType: "action",
        adapterKey: aiAdapter.key,
        actionKey: "runAgent",
        advanced: true,
      });
    }
  }

  const nativeAppItems = adapters
    .filter(
      (adapter) =>
        !GENERIC_CONNECTOR_KEYS.includes(
          adapter.key as (typeof GENERIC_CONNECTOR_KEYS)[number],
        ) && adapter.key !== AI_CONNECTOR_KEY,
    )
    .filter((adapter) => adapter.supportedActions.length > 0)
    .map((adapter) => ({
      id: `action-${adapter.key}`,
      label: adapter.displayName,
      description: adapter.description,
      stepType: "action" as const,
      adapterKey: adapter.key,
      actionKey: adapter.supportedActions[0],
      advanced:
        adapter.readinessTier === "advanced" ||
        adapter.readinessTier === "coming_soon" ||
        adapter.readinessTier === "developer",
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [
    {
      id: "core",
      title: "Core flow nodes",
      description: "Trigger -> steps -> result foundation for every automation.",
      items: coreItems,
    },
    {
      id: "ai",
      title: "AI nodes",
      description: "Creator and content-focused AI actions with simple and advanced paths.",
      items: aiNodeItems,
    },
    {
      id: "power",
      title: "Power connectors",
      description: "Generic connectors for APIs, schedules, code, and advanced patterns.",
      items: powerConnectorItems,
    },
    {
      id: "apps",
      title: "App connectors",
      description: "Native and messaging apps ready for fast insertion.",
      items: nativeAppItems,
    },
  ];
}

export function reorderWorkflowSteps(
  steps: WorkflowStep[],
  fromIndex: number,
  toIndex: number,
): WorkflowStep[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= steps.length ||
    toIndex >= steps.length
  ) {
    return [...steps];
  }

  const next = [...steps];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function insertWorkflowStep(
  steps: WorkflowStep[],
  step: WorkflowStep,
  index?: number,
): WorkflowStep[] {
  if (index === undefined || index < 0 || index >= steps.length) {
    return [...steps, step];
  }

  const next = [...steps];
  next.splice(index, 0, step);
  return next;
}

export function buildFlowLane(definition: WorkflowDefinition): string[] {
  const lane: string[] = [
    `Trigger: ${definition.trigger.adapter}.${definition.trigger.trigger}`,
  ];

  for (const step of definition.steps) {
    if (step.type === "branch") {
      lane.push(`Branch: ${step.id}`);
      continue;
    }

    if (step.type === "delay") {
      const delay = step.delaySeconds ? `${step.delaySeconds}s` : `${step.delayMs || 0}ms`;
      lane.push(`Delay: ${step.id} (${delay})`);
      continue;
    }

    lane.push(`Action: ${step.id} (${step.adapter}.${step.action || "run"})`);
  }

  lane.push("Result");
  return lane;
}

export function buildBuilderCanvasModel(definition: WorkflowDefinition): BuilderCanvasModel {
  const nodes: BuilderCanvasNode[] = [
    {
      id: "node:trigger",
      kind: "trigger",
      label: "Trigger",
      summary: `${definition.trigger.adapter}.${definition.trigger.trigger}`,
      lane: "trigger",
      order: 0,
      dataRef: { type: "trigger" },
      presentation: {
        x: 80,
        y: 72,
        width: 240,
        height: 120,
        tone: "success",
      },
      connectability: {
        incomingHandles: [],
        outgoingHandles: ["out"],
      },
    },
  ];

  const edges: BuilderCanvasEdge[] = [];

  for (let index = 0; index < definition.steps.length; index += 1) {
    const step = definition.steps[index];
    nodes.push({
      id: `node:step:${step.id}`,
      kind: toStepKind(step),
      label: step.id,
      summary: buildStepSummary(step),
      lane: "steps",
      order: index,
      dataRef: {
        type: "step",
        stepId: step.id,
        stepIndex: index,
      },
      presentation: {
        x: 396,
        y: 72 + index * 136,
        width: 320,
        height: 120,
        tone: toStepTone(step),
      },
      connectability: {
        incomingHandles: ["in"],
        outgoingHandles: ["out"],
        branchHandles: isBranchStep(step) ? ["then", "else"] : undefined,
      },
    });
  }

  const resultY = definition.steps.length > 0 ? 72 + (definition.steps.length - 1) * 136 : 72;
  nodes.push({
    id: "node:result",
    kind: "result",
    label: "Result",
    summary: "Workflow run outcome and logs",
    lane: "result",
    order: 0,
    dataRef: { type: "result" },
    presentation: {
      x: 786,
      y: resultY,
      width: 240,
      height: 120,
      tone: "info",
    },
    connectability: {
      incomingHandles: ["in"],
      outgoingHandles: [],
    },
  });

  const stepNodeIds = definition.steps.map((step) => `node:step:${step.id}`);
  if (stepNodeIds.length === 0) {
    edges.push({
      id: "edge:trigger:result",
      from: "node:trigger",
      to: "node:result",
      kind: "primary",
      connectRef: {
        fromHandle: "out",
        toHandle: "in",
        editable: false,
      },
    });
  } else {
    edges.push({
      id: "edge:trigger:first",
      from: "node:trigger",
      to: stepNodeIds[0],
      kind: "primary",
      connectRef: {
        fromHandle: "out",
        toHandle: "in",
        editable: false,
      },
    });

    for (let index = 0; index < definition.steps.length; index += 1) {
      const fromNode = stepNodeIds[index];
      const toNode = stepNodeIds[index + 1] || "node:result";
      const step = definition.steps[index];

      edges.push({
        id: `edge:${fromNode}:${toNode}:default`,
        from: fromNode,
        to: toNode,
        kind: isBranchStep(step) ? "branch" : "primary",
        label: isBranchStep(step) ? "default" : undefined,
        branchRole: isBranchStep(step) ? "default" : undefined,
        connectRef: {
          fromHandle: "out",
          toHandle: "in",
          editable: false,
        },
      });

      if (isBranchStep(step)) {
        edges.push({
          id: `edge:${fromNode}:${toNode}:then`,
          from: fromNode,
          to: toNode,
          kind: "branch",
          label: "then",
          branchRole: "then",
          connectRef: {
            fromHandle: "then",
            toHandle: "in",
            editable: false,
          },
        });
        edges.push({
          id: `edge:${fromNode}:${toNode}:else`,
          from: fromNode,
          to: toNode,
          kind: "branch",
          label: "else",
          branchRole: "else",
          connectRef: {
            fromHandle: "else",
            toHandle: "in",
            editable: false,
          },
        });
      }
    }
  }

  return { nodes, edges };
}

function toEdgeVisualKind(edge: BuilderCanvasEdge): BuilderEdgeVisualKind {
  const role = edge.branchRole || edgeBranchRole(edge);
  if (role === "then") {
    return "branch-then";
  }
  if (role === "else") {
    return "branch-else";
  }
  if (edge.kind === "branch") {
    return "branch-default";
  }
  return "primary";
}

function toEdgeVerticalOffset(edge: BuilderCanvasEdge): number {
  const role = edge.branchRole || edgeBranchRole(edge);
  if (role === "then") {
    return -26;
  }
  if (role === "else") {
    return 26;
  }
  return 0;
}

function buildCurvedPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string {
  const deltaX = Math.max(56, Math.abs(endX - startX) * 0.35);
  const controlX1 = startX + deltaX;
  const controlX2 = endX - deltaX;
  return `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;
}

function toNodePosition(
  node: BuilderCanvasNode,
  positions?: BuilderNodePositionMap,
): BuilderNodePosition {
  const existing = positions?.[node.id];
  if (existing) {
    return existing;
  }
  return {
    x: node.presentation.x,
    y: node.presentation.y,
  };
}

function toRuntimePreview(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.length <= 140 ? value : `${value.slice(0, 137)}...`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= 140 ? serialized : `${serialized.slice(0, 137)}...`;
  } catch {
    return undefined;
  }
}

function toStepNodeId(stepId: string | undefined): string | null {
  if (!stepId) {
    return null;
  }
  return `node:step:${stepId}`;
}

function toLogStepPayload(log: EventLogRecord): Record<string, unknown> {
  if (
    typeof log.payload_json === "object" &&
    log.payload_json !== null &&
    !Array.isArray(log.payload_json)
  ) {
    return log.payload_json;
  }
  return {};
}

export function createBuilderViewport(initial?: Partial<BuilderViewport>): BuilderViewport {
  return {
    zoom: Math.min(2, Math.max(0.5, initial?.zoom || 1)),
    panX: initial?.panX || 0,
    panY: initial?.panY || 0,
  };
}

export function zoomBuilderViewport(
  viewport: BuilderViewport,
  input: {
    deltaY: number;
    anchorX: number;
    anchorY: number;
  },
): BuilderViewport {
  const zoomDirection = input.deltaY < 0 ? 1.1 : 0.9;
  const nextZoom = Math.min(2.4, Math.max(0.45, viewport.zoom * zoomDirection));
  const zoomRatio = nextZoom / viewport.zoom;
  const nextPanX = input.anchorX - (input.anchorX - viewport.panX) * zoomRatio;
  const nextPanY = input.anchorY - (input.anchorY - viewport.panY) * zoomRatio;

  return {
    zoom: nextZoom,
    panX: nextPanX,
    panY: nextPanY,
  };
}

export function panBuilderViewport(
  viewport: BuilderViewport,
  input: {
    deltaX: number;
    deltaY: number;
  },
): BuilderViewport {
  return {
    ...viewport,
    panX: viewport.panX + input.deltaX,
    panY: viewport.panY + input.deltaY,
  };
}

export function createBuilderNodePositionMap(
  model: BuilderCanvasModel,
  previous?: BuilderNodePositionMap,
): BuilderNodePositionMap {
  const next: BuilderNodePositionMap = {};

  for (const node of model.nodes) {
    const existing = previous?.[node.id];
    if (existing) {
      next[node.id] = {
        x: existing.x,
        y: existing.y,
      };
      continue;
    }

    next[node.id] = {
      x: node.presentation.x,
      y: node.presentation.y,
    };
  }

  return next;
}

export function moveBuilderNodePosition(
  positions: BuilderNodePositionMap,
  nodeId: string,
  nextPosition: BuilderNodePosition,
): BuilderNodePositionMap {
  return {
    ...positions,
    [nodeId]: {
      x: nextPosition.x,
      y: nextPosition.y,
    },
  };
}

export function removeBuilderEdge(
  edges: BuilderCanvasEdge[],
  edgeId: string,
): BuilderCanvasEdge[] {
  return edges.filter((edge) => edge.id !== edgeId);
}

function createEdgeId(
  edges: BuilderCanvasEdge[],
  seed: {
    fromNodeId: string;
    toNodeId: string;
    fromHandle: string;
    toHandle: string;
  },
): string {
  const base = `edge:${seed.fromNodeId}:${seed.toNodeId}:${seed.fromHandle}:${seed.toHandle}`;
  if (!edges.some((edge) => edge.id === base)) {
    return base;
  }
  let index = 1;
  while (edges.some((edge) => edge.id === `${base}:${index}`)) {
    index += 1;
  }
  return `${base}:${index}`;
}

export function rewireBuilderEdge(input: {
  model: BuilderCanvasModel;
  edges: BuilderCanvasEdge[];
  draft: Pick<BuilderEdgeDraft, "fromNodeId" | "fromHandle">;
  toNodeId: string;
  toHandle?: string;
}): {
  edges: BuilderCanvasEdge[];
  changed: boolean;
  reason?: string;
} {
  const nodeIds = new Set(input.model.nodes.map((node) => node.id));
  if (!nodeIds.has(input.draft.fromNodeId) || !nodeIds.has(input.toNodeId)) {
    return {
      edges: input.edges,
      changed: false,
      reason: "Node is not available on canvas.",
    };
  }
  if (input.draft.fromNodeId === input.toNodeId) {
    return {
      edges: input.edges,
      changed: false,
      reason: "Cannot connect a node to itself.",
    };
  }

  const toHandle = input.toHandle || "in";
  const fromHandle = input.draft.fromHandle || "out";
  const branchRole =
    fromHandle === "then" || fromHandle === "else" ? fromHandle : undefined;
  const kind = branchRole ? "branch" : "primary";

  const withoutExistingOutgoing = input.edges.filter((edge) => {
    const edgeFromHandle = edge.connectRef?.fromHandle || "out";
    return !(edge.from === input.draft.fromNodeId && edgeFromHandle === fromHandle);
  });

  const nextEdge: BuilderCanvasEdge = {
    id: createEdgeId(withoutExistingOutgoing, {
      fromNodeId: input.draft.fromNodeId,
      toNodeId: input.toNodeId,
      fromHandle,
      toHandle,
    }),
    from: input.draft.fromNodeId,
    to: input.toNodeId,
    kind,
    label: branchRole,
    branchRole: branchRole || (kind === "branch" ? "default" : undefined),
    connectRef: {
      fromHandle,
      toHandle,
      editable: true,
    },
  };

  return {
    edges: [...withoutExistingOutgoing, nextEdge],
    changed: true,
  };
}

export function reconcileBuilderEdges(
  model: BuilderCanvasModel,
  currentEdges: BuilderCanvasEdge[],
): BuilderCanvasEdge[] {
  const nodeIds = new Set(model.nodes.map((node) => node.id));
  const baseEdges = model.edges;
  const editedEdges = currentEdges.filter((edge) => edge.connectRef?.editable);
  const sanitizedEditedEdges = editedEdges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  const untouchedEdgeIds = new Set(sanitizedEditedEdges.map((edge) => edge.id));

  return [
    ...baseEdges.filter((edge) => !untouchedEdgeIds.has(edge.id)),
    ...sanitizedEditedEdges,
  ];
}

export function getBuilderCanvasBounds(
  model: BuilderCanvasModel,
  padding = 36,
  positions?: BuilderNodePositionMap,
): BuilderCanvasBounds {
  if (model.nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: 960,
      height: 320,
    };
  }

  const left = Math.min(
    ...model.nodes.map((node) => toNodePosition(node, positions).x),
  );
  const top = Math.min(
    ...model.nodes.map((node) => toNodePosition(node, positions).y),
  );
  const right = Math.max(
    ...model.nodes.map(
      (node) => toNodePosition(node, positions).x + node.presentation.width,
    ),
  );
  const bottom = Math.max(
    ...model.nodes.map(
      (node) => toNodePosition(node, positions).y + node.presentation.height,
    ),
  );

  return {
    minX: left - padding,
    minY: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  };
}

export function buildRenderableBuilderEdges(
  model: BuilderCanvasModel,
  options?: {
    positions?: BuilderNodePositionMap;
    draft?: BuilderEdgeDraft | null;
  },
): BuilderRenderableEdge[] {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const renderable: BuilderRenderableEdge[] = [];

  for (const edge of model.edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) {
      continue;
    }
    const fromPosition = toNodePosition(fromNode, options?.positions);
    const toPosition = toNodePosition(toNode, options?.positions);

    const offsetY = toEdgeVerticalOffset(edge);
    const startX = fromPosition.x + fromNode.presentation.width;
    const startY = fromPosition.y + fromNode.presentation.height / 2 + offsetY;
    const endX = toPosition.x;
    const endY = toPosition.y + toNode.presentation.height / 2 + offsetY;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2 - 8;

    renderable.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: toEdgeVisualKind(edge),
      label: edge.label,
      labelPosition: edge.label
        ? {
            x: midX,
            y: midY,
          }
        : undefined,
      path: buildCurvedPath(startX, startY, endX, endY),
      interactionHint: {
        editable: edge.connectRef?.editable || false,
        fromHandle: edge.connectRef?.fromHandle || "out",
        toHandle: edge.connectRef?.toHandle || "in",
      },
    });
  }

  if (options?.draft) {
    const fromNode = nodeById.get(options.draft.fromNodeId);
    if (fromNode) {
      const fromPosition = toNodePosition(fromNode, options.positions);
      const draftOffsetY =
        options.draft.fromHandle === "then"
          ? -26
          : options.draft.fromHandle === "else"
            ? 26
            : 0;
      const startX = fromPosition.x + fromNode.presentation.width;
      const startY = fromPosition.y + fromNode.presentation.height / 2 + draftOffsetY;
      renderable.push({
        id: "edge:draft",
        from: options.draft.fromNodeId,
        to: "node:draft-target",
        kind:
          options.draft.fromHandle === "then"
            ? "branch-then"
            : options.draft.fromHandle === "else"
              ? "branch-else"
              : "primary",
        path: buildCurvedPath(startX, startY, options.draft.pointerX, options.draft.pointerY),
        interactionHint: {
          editable: true,
          fromHandle: options.draft.fromHandle,
          toHandle: "in",
        },
      });
    }
  }

  return renderable;
}

export function getBuilderEdgeInteractionHints(
  model: BuilderCanvasModel,
): Array<{
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  fromHandle: string;
  toHandle: string;
  editable: boolean;
  branchRole: "then" | "else" | "default" | null;
}> {
  return model.edges.map((edge) => ({
    edgeId: edge.id,
    fromNodeId: edge.from,
    toNodeId: edge.to,
    fromHandle: edge.connectRef?.fromHandle || "out",
    toHandle: edge.connectRef?.toHandle || "in",
    editable: edge.connectRef?.editable || false,
    branchRole: edge.branchRole || edgeBranchRole(edge) || null,
  }));
}

export function buildBuilderNodeRuntimeMap(input: {
  model: BuilderCanvasModel;
  run: RunRecord | null;
  logs: EventLogRecord[];
}): BuilderNodeRuntimeMap {
  const runtime: BuilderNodeRuntimeMap = {};
  for (const node of input.model.nodes) {
    runtime[node.id] = {
      status: "idle",
    };
  }

  if (!input.run) {
    return runtime;
  }

  runtime["node:trigger"] = {
    status: input.run.status === "failed" ? "error" : "success",
    preview: "Trigger received",
  };

  const resultStatus: BuilderNodeRuntimeStatus =
    input.run.status === "success"
      ? "success"
      : input.run.status === "running" || input.run.status === "queued"
        ? "running"
        : input.run.status === "failed" ||
            input.run.status === "dead_lettered" ||
            input.run.status === "cancelled"
          ? "error"
          : "idle";
  runtime["node:result"] = {
    status: resultStatus,
    preview: input.run.status.replace(/_/g, " "),
  };

  const runResult =
    typeof input.run.result_json === "object" &&
    input.run.result_json !== null &&
    !Array.isArray(input.run.result_json)
      ? input.run.result_json
      : {};
  const stepResults = Array.isArray(runResult.steps) ? runResult.steps : [];
  for (const entry of stepResults) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const stepId = typeof entry.stepId === "string" ? entry.stepId : undefined;
    const nodeId = toStepNodeId(stepId);
    if (!nodeId || !runtime[nodeId]) {
      continue;
    }
    const statusRaw = typeof entry.status === "string" ? entry.status : "";
    runtime[nodeId] = {
      status:
        entry.success === true || statusRaw === "completed"
          ? "success"
          : statusRaw === "running"
            ? "running"
            : "error",
      preview:
        toRuntimePreview(entry.output) ||
        toRuntimePreview(entry.error) ||
        toRuntimePreview(statusRaw),
      eventType: "run.result.step",
    };
  }

  const orderedLogs = [...input.logs].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  for (const log of orderedLogs) {
    const payload = toLogStepPayload(log);
    const nodeId = toStepNodeId(typeof payload.stepId === "string" ? payload.stepId : undefined);
    if (!nodeId || !runtime[nodeId]) {
      continue;
    }

    if (
      log.event_type === "workflow.step.running" ||
      log.event_type === "workflow.retry.started"
    ) {
      runtime[nodeId] = {
        status: "running",
        preview: toRuntimePreview(payload.message) || "Running...",
        eventType: log.event_type,
      };
      continue;
    }

    if (
      log.event_type === "workflow.step.completed" ||
      log.event_type === "workflow.retry.succeeded"
    ) {
      runtime[nodeId] = {
        status: "success",
        preview:
          toRuntimePreview(payload.output) ||
          toRuntimePreview(payload.message) ||
          "Completed",
        eventType: log.event_type,
      };
      continue;
    }

    if (
      log.event_type === "workflow.step.failed" ||
      log.event_type === "workflow.retry.exhausted"
    ) {
      runtime[nodeId] = {
        status: "error",
        preview:
          toRuntimePreview(payload.error) ||
          toRuntimePreview(payload.message) ||
          "Failed",
        eventType: log.event_type,
      };
      continue;
    }

    if (log.event_type === "workflow.step.skipped") {
      runtime[nodeId] = {
        status: "idle",
        preview: toRuntimePreview(payload.skippedReason) || "Skipped",
        eventType: log.event_type,
      };
    }
  }

  return runtime;
}

export function getCanvasNodeById(
  model: BuilderCanvasModel,
  nodeId: string | null,
): BuilderCanvasNode | null {
  if (!nodeId) {
    return null;
  }
  return model.nodes.find((node) => node.id === nodeId) || null;
}
