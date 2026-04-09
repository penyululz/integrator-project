import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  createWorkflow,
  getAuthSession,
  getWorkflowTemplate,
  listAgentTools,
  listAgentMemory,
  listAdapters,
  listCredentials,
  listIntegrations,
  listLogs,
  listRuns,
  listWorkflowTemplates,
  upsertAgentMemory,
  listWorkflows,
  type AdapterMetadata,
  type AgentToolRecord,
  type AgentMemoryRecord,
  type CredentialRecord,
  type EventLogRecord,
  type RunRecord,
  type WorkflowRecord,
  type WorkflowTemplate,
  type WorkflowTemplateSummary,
  validateWorkflow,
} from "../api";
import { StepCardEditor } from "../components/StepCardEditor";
import {
  Callout,
  DemoHint,
  EmptyStatePanel,
  FilterPills,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import { ValidationErrorPanel } from "../components/ValidationErrorPanel";
import {
  buildDefaultWorkflow,
  buildReferenceHints,
  buildWorkflowFromTemplate,
  duplicateWorkflowStepAsType,
  filterWorkflowTemplates,
  generateWorkflowFromGoal,
  getTemplateStatus,
  parseJsonObject,
  suggestToolsForGoal,
  validateWorkflowStructure,
} from "./workflow-builder-helpers";
import {
  buildBuilderCanvasModel,
  buildBuilderNodeRuntimeMap,
  buildRenderableBuilderEdges,
  createBuilderNodePositionMap,
  createBuilderViewport,
  getBuilderCanvasBounds,
  getBuilderEdgeInteractionHints,
  getCanvasNodeById,
  getBuilderPaletteSections,
  reconcileBuilderEdges,
  removeBuilderEdge,
  reorderWorkflowSteps,
  rewireBuilderEdge,
  toReactFlowProjection,
  zoomBuilderViewport,
  type BuilderCanvasEdge,
  type BuilderEdgeDraft,
  type BuilderPaletteSection,
  type BuilderNodePositionMap,
} from "./builder-evolution-helpers";
import {
  getBuilderSetupStages,
  runBuilderNodeSetupTest,
  validateTriggerSetup,
  validateWorkflowStepSetup,
  type BuilderSetupStageId,
  type BuilderNodeTestResult,
} from "./builder-node-setup-helpers";
import { buildOnboardingSteps, getNextPendingStep } from "./onboarding-helpers";
import { buildTemplateCategoryOptions } from "./product-pattern-helpers";
import {
  collectStepIds,
  createEmptyActionStep,
  createEmptyBranchStep,
  createEmptyDelayStep,
  generateStepId,
  type WorkflowDefinition,
  type WorkflowStep,
} from "../types/workflow";
import { useBuilderUiStore } from "../state/builder-ui-store";

type BuilderActivityEventKind =
  | "create"
  | "edit"
  | "reorder"
  | "test"
  | "save"
  | "delete";

type BuilderActivityEvent = {
  kind: BuilderActivityEventKind;
  message: string;
};

type BuilderPaletteDisplaySection = BuilderPaletteSection & {
  starterItems: BuilderPaletteSection["items"];
  advancedItems: BuilderPaletteSection["items"];
  visibleItems: BuilderPaletteSection["items"];
};

function toBuilderActivityTone(
  kind: BuilderActivityEventKind,
): "info" | "success" | "warning" | "danger" {
  if (kind === "delete") {
    return "warning";
  }
  if (kind === "test" || kind === "save") {
    return "success";
  }
  return "info";
}

function toReadinessLabel(
  tier: "ready" | "advanced" | "coming_soon" | "developer" | undefined,
): string {
  if (tier === "advanced") {
    return "Advanced setup";
  }
  if (tier === "coming_soon") {
    return "Coming soon";
  }
  if (tier === "developer") {
    return "Developer";
  }
  return "Ready now";
}

function toSupportModelLabel(
  supportModel: "native" | "generic" | "community" | undefined,
): string {
  if (supportModel === "generic") {
    return "Power connector";
  }
  if (supportModel === "community") {
    return "Community";
  }
  return "Native app";
}

export function WorkflowsPage() {
  const location = useLocation();
  const params = useParams<{ workflowId?: string }>();
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("templateId");
  const routeMode =
    params.workflowId != null
      ? "detail"
      : location.pathname.endsWith("/new")
        ? "create"
        : "overview";
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [agentTools, setAgentTools] = useState<AgentToolRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [integrationsCount, setIntegrationsCount] = useState(0);
  const [runsCount, setRunsCount] = useState(0);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [templateCache, setTemplateCache] = useState<Record<string, WorkflowTemplate>>({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("all");
  const [showAllTemplateCategories, setShowAllTemplateCategories] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    requestedTemplateId,
  );
  const [autoLoadedTemplateId, setAutoLoadedTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("New Automation");
  const [definition, setDefinition] = useState<WorkflowDefinition>(() =>
    buildDefaultWorkflow([], {
      workspaceId: session?.scope.workspaceId || "",
      organizationId: session?.scope.organizationId || "",
    }),
  );
  const [editorMode, setEditorMode] = useState<"form" | "json">("form");
  const [jsonDraft, setJsonDraft] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [triggerConfigDraft, setTriggerConfigDraft] = useState("{}");
  const [contextDraft, setContextDraft] = useState("{}");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runRecords, setRunRecords] = useState<RunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedRunLogs, setSelectedRunLogs] = useState<EventLogRecord[]>([]);
  const [selectedRunLogsLoading, setSelectedRunLogsLoading] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [memoryWorkflowId, setMemoryWorkflowId] = useState<string>("");
  const [agentMemoryRecords, setAgentMemoryRecords] = useState<AgentMemoryRecord[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryKeyDraft, setMemoryKeyDraft] = useState("");
  const [memoryValueDraft, setMemoryValueDraft] = useState("{\n  \"note\": \"\"\n}");
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<BuilderNodePositionMap>({});
  const [canvasViewport, setCanvasViewport] = useState(() => createBuilderViewport());
  const [canvasEdges, setCanvasEdges] = useState<BuilderCanvasEdge[]>([]);
  const [edgeDraft, setEdgeDraft] = useState<BuilderEdgeDraft | null>(null);
  const [quickInsertNodeId, setQuickInsertNodeId] = useState<string | null>(null);
  const [quickInsertQuery, setQuickInsertQuery] = useState("");
  const [quickInsertIndex, setQuickInsertIndex] = useState<number | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [inspectorStageByNode, setInspectorStageByNode] = useState<
    Record<string, BuilderSetupStageId>
  >({});
  const [nodeSetupTestResults, setNodeSetupTestResults] = useState<
    Record<string, BuilderNodeTestResult>
  >({});
  const [builderActivity, setBuilderActivity] = useState<BuilderActivityEvent | null>(null);
  const selectedNodeId = useBuilderUiStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useBuilderUiStore((state) => state.setSelectedNodeId);
  const selectedEdgeId = useBuilderUiStore((state) => state.selectedEdgeId);
  const setSelectedEdgeId = useBuilderUiStore((state) => state.setSelectedEdgeId);
  const showAdvancedBuilder = useBuilderUiStore((state) => state.showAdvancedBuilder);
  const setShowAdvancedBuilder = useBuilderUiStore((state) => state.setShowAdvancedBuilder);
  const showAdvancedPalette = useBuilderUiStore((state) => state.showAdvancedPalette);
  const setShowAdvancedPalette = useBuilderUiStore((state) => state.setShowAdvancedPalette);
  const showBuilderSupport = useBuilderUiStore((state) => state.showBuilderSupport);
  const setShowBuilderSupport = useBuilderUiStore((state) => state.setShowBuilderSupport);
  const resetBuilderUi = useBuilderUiStore((state) => state.resetBuilderUi);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasPanStateRef = useRef<{
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);
  const canvasDragNodeRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [
        { adapters: adapterMetadata },
        agentToolPayload,
        workflowRecords,
        templateRecords,
        credentialRecords,
        integrationRecords,
        runRecords,
      ] = await Promise.all([
        listAdapters(),
        listAgentTools(),
        listWorkflows(),
        listWorkflowTemplates(),
        listCredentials(),
        listIntegrations(),
        listRuns(),
      ]);

      setAdapters(adapterMetadata);
      setAgentTools(agentToolPayload.tools);
      setWorkflows(workflowRecords);
      setMemoryWorkflowId((current) =>
        workflowRecords.some((workflow) => workflow.id === current)
          ? current
          : workflowRecords[0]?.id || "",
      );
      setTemplates(templateRecords);
      setCredentials(credentialRecords);
      setIntegrationsCount(integrationRecords.length);
      setRunsCount(runRecords.length);
      setRunRecords(runRecords);
      setSelectedRunId((current) =>
        runRecords.some((run) => run.id === current) ? current : runRecords[0]?.id || "",
      );

      const defaultAdapterKey = adapterMetadata[0]?.key || "";
      if (!definition.trigger.adapter && defaultAdapterKey) {
        const nextDefault = buildDefaultWorkflow(adapterMetadata, {
          workspaceId: session?.scope.workspaceId || "",
          organizationId: session?.scope.organizationId || "",
        });
        setDefinition(nextDefault);
        setTriggerConfigDraft(JSON.stringify(nextDefault.trigger.config || {}, null, 2));
        setContextDraft(JSON.stringify(nextDefault.context || {}, null, 2));
        setJsonDraft(JSON.stringify(nextDefault, null, 2));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadAgentMemoryForWorkflow(workflowId: string) {
    if (!workflowId) {
      setAgentMemoryRecords([]);
      return;
    }
    setMemoryLoading(true);
    try {
      const records = await listAgentMemory({
        workflowId,
        scope: "workflow",
        limit: 100,
      });
      setAgentMemoryRecords(records);
    } catch {
      setAgentMemoryRecords([]);
    } finally {
      setMemoryLoading(false);
    }
  }

  async function onSaveWorkflowMemory() {
    if (!memoryWorkflowId) {
      setServerError("Select a saved automation before writing workflow memory.");
      return;
    }
    if (!memoryKeyDraft.trim()) {
      setServerError("Memory key is required.");
      return;
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(memoryValueDraft);
    } catch {
      setServerError("Memory value must be valid JSON.");
      return;
    }

    try {
      const saved = await upsertAgentMemory({
        scope: "workflow",
        workflowId: memoryWorkflowId,
        key: memoryKeyDraft,
        value: parsedValue,
      });
      setMemoryMessage(`Saved ${saved.key} to workflow memory.`);
      setServerError(null);
      setMemoryKeyDraft("");
      setMemoryValueDraft("{\n  \"note\": \"\"\n}");
      await loadAgentMemoryForWorkflow(memoryWorkflowId);
    } catch (error) {
      setServerError((error as Error).message || "Failed to save memory.");
    }
  }

  function onCreateAgentFromGoal() {
    if (!goalDraft.trim()) {
      setServerError("Add a goal to generate an AI agent automation.");
      return;
    }

    const generated = generateWorkflowFromGoal({
      goal: goalDraft,
      adapters,
      scope: {
        workspaceId: session?.scope.workspaceId || "",
        organizationId: session?.scope.organizationId || "",
      },
    });
    setName(generated.name);
    updateDefinition(generated);
    setEditorMode("form");
    setSelectedNodeId("node:step:step_agent_1");
    setInfoMessage("Generated an agent automation draft from your goal.");
    setServerError(null);
  }

  useEffect(() => {
    // STATE: Zustand local builder state should reset when entering the editor.
    resetBuilderUi();
    void load();
  }, [resetBuilderUi]);

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }
    void ensureTemplateLoaded(selectedTemplateId);
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!requestedTemplateId) {
      return;
    }
    if (autoLoadedTemplateId === requestedTemplateId) {
      return;
    }
    void onUseTemplate(requestedTemplateId).then(() => {
      setAutoLoadedTemplateId(requestedTemplateId);
    });
  }, [requestedTemplateId, autoLoadedTemplateId]);

  useEffect(() => {
    if (editorMode === "form") {
      setJsonDraft(JSON.stringify(definition, null, 2));
    }
  }, [definition, editorMode]);

  useEffect(() => {
    if (!memoryWorkflowId) {
      setAgentMemoryRecords([]);
      return;
    }
    void loadAgentMemoryForWorkflow(memoryWorkflowId);
  }, [memoryWorkflowId]);

  const referenceHints = useMemo(() => buildReferenceHints(definition), [definition]);
  const structureValidation = useMemo(
    () => validateWorkflowStructure(definition),
    [definition],
  );

  const templateCategoryOptions = useMemo(() => {
    const categoryCounts = buildTemplateCategoryOptions({
      templates,
      expanded: showAllTemplateCategories,
      visibleLimit: 4,
    });
    return categoryCounts;
  }, [templates, showAllTemplateCategories]);

  const templateFilterPills = useMemo(() => {
    const base = [
      { id: "all", label: "All outcomes", count: templates.length },
      ...templateCategoryOptions.options,
    ];
    if (templateCategory !== "all" && !base.some((option) => option.id === templateCategory)) {
      const selectedCount = templates.filter(
        (template) => template.category === templateCategory,
      ).length;
      base.push({
        id: templateCategory,
        label: templateCategory,
        count: selectedCount,
      });
    }
    return base;
  }, [templates, templateCategory, templateCategoryOptions.options]);

  const filteredTemplates = useMemo(
    () => filterWorkflowTemplates(templates, templateSearch, templateCategory),
    [templates, templateSearch, templateCategory],
  );

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) {
      return null;
    }
    return (
      templateCache[selectedTemplateId] ||
      templates.find((template) => template.id === selectedTemplateId) ||
      null
    );
  }, [selectedTemplateId, templateCache, templates]);

  const enabledAdapterKeys = useMemo(() => adapters.map((adapter) => adapter.key), [adapters]);

  const validCredentialProviders = useMemo(() => {
    return new Set(
      credentials
        .filter((credential) => credential.credential_status === "valid")
        .map((credential) => credential.provider_key),
    );
  }, [credentials]);

  const onboardingSteps = useMemo(
    () =>
      buildOnboardingSteps({
        integrationsCount,
        connectedCredentialProviders: validCredentialProviders.size,
        templatesCount: templates.length,
        workflowsCount: workflows.length,
        runsCount,
      }),
    [integrationsCount, validCredentialProviders, templates.length, workflows.length, runsCount],
  );

  const nextStep = useMemo(() => getNextPendingStep(onboardingSteps), [onboardingSteps]);
  const goalSuggestions = useMemo(
    () => suggestToolsForGoal(goalDraft),
    [goalDraft],
  );

  useEffect(() => {
    if (routeMode === "overview") {
      return;
    }
    document.getElementById("workflow-studio-root")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [routeMode]);

  function updateDefinition(nextDefinition: WorkflowDefinition) {
    setDefinition(nextDefinition);
    setValidationErrors([]);
    setServerError(null);
    setInfoMessage(null);
  }

  function pushBuilderActivity(kind: BuilderActivityEventKind, message: string) {
    setBuilderActivity({
      kind,
      message,
    });
  }

  function updateSelectedNodeStage(nextStage: BuilderSetupStageId) {
    if (!selectedCanvasNode) {
      return;
    }
    setInspectorStageByNode((current) => ({
      ...current,
      [selectedCanvasNode.id]: nextStage,
    }));
  }

  function createStep(
    type: "action" | "branch" | "delay",
    preset?: {
      adapterKey?: string;
      actionKey?: string;
    },
  ): WorkflowStep {
    const nextId = generateStepId(
      type === "action" ? "step_action" : type,
      collectStepIds(definition.steps),
    );
    if (type === "branch") {
      return createEmptyBranchStep(nextId);
    }
    if (type === "delay") {
      return createEmptyDelayStep(nextId);
    }

    const adapterWithActions = preset?.adapterKey
      ? adapters.find((adapter) => adapter.key === preset.adapterKey)
      : adapters.find((adapter) => adapter.supportedActions.length > 0);
    const nextStep = createEmptyActionStep(
      nextId,
      adapterWithActions?.key || adapters[0]?.key || "webhook",
    );
    nextStep.action = preset?.actionKey || adapterWithActions?.supportedActions[0] || "";
    return nextStep;
  }

  function addStepAtIndex(
    step: WorkflowStep,
    index?: number,
  ) {
    const nextSteps = [...definition.steps];
    if (index === undefined || index < 0 || index >= nextSteps.length) {
      nextSteps.push(step);
    } else {
      nextSteps.splice(index, 0, step);
    }

    updateDefinition({
      ...definition,
      steps: nextSteps,
    });
    setSelectedNodeId(`node:step:${step.id}`);
    pushBuilderActivity("create", `Created ${step.type || "action"} node ${step.id}.`);
    setInspectorStageByNode((current) => ({
      ...current,
      [`node:step:${step.id}`]: "required",
    }));
  }

  function updateStepAtIndex(index: number, step: WorkflowStep) {
    const nextSteps = [...definition.steps];
    nextSteps[index] = step;
    updateDefinition({
      ...definition,
      steps: nextSteps,
    });
    pushBuilderActivity("edit", `Updated ${step.id}.`);
  }

  function removeStepAtIndex(index: number) {
    const step = definition.steps[index];
    if (!step) {
      return;
    }
    const confirmed = window.confirm(
      `Remove ${step.id}? This action cannot be undone from the builder.`,
    );
    if (!confirmed) {
      return;
    }
    const nextSteps = definition.steps.filter((_, currentIndex) => currentIndex !== index);
    updateDefinition({
      ...definition,
      steps: nextSteps,
    });
    const nextSelected = nextSteps[index] || nextSteps[index - 1];
    setSelectedNodeId(nextSelected ? `node:step:${nextSelected.id}` : "node:trigger");
    pushBuilderActivity("delete", `Removed ${step.id}.`);
  }

  function duplicateStepAtIndex(
    index: number,
    nextType: "action" | "branch" | "delay",
  ) {
    const source = definition.steps[index];
    if (!source) {
      return;
    }
    const duplicated = duplicateWorkflowStepAsType({
      source,
      nextType,
      adapters,
      existingStepIds: collectStepIds(definition.steps),
    });
    addStepAtIndex(duplicated, index + 1);
    pushBuilderActivity(
      "create",
      `Created ${duplicated.id} as ${nextType} copy from ${source.id}.`,
    );
  }

  function openQuickInsert(input: {
    nodeId: string;
    afterIndex: number;
  }) {
    setQuickInsertNodeId(input.nodeId);
    setQuickInsertIndex(input.afterIndex);
    setQuickInsertQuery("");
  }

  function onQuickInsert(item: {
    stepType: "action" | "branch" | "delay";
    adapterKey?: string;
    actionKey?: string;
  }) {
    const nextStep = createStep(item.stepType, {
      adapterKey: item.adapterKey,
      actionKey: item.actionKey,
    });
    addStepAtIndex(
      nextStep,
      quickInsertIndex === null ? undefined : quickInsertIndex + 1,
    );
    setQuickInsertNodeId(null);
    setQuickInsertIndex(null);
    setQuickInsertQuery("");
  }

  function onPaletteInsert(item: {
    label: string;
    stepType: "action" | "branch" | "delay";
    adapterKey?: string;
    actionKey?: string;
  }) {
    const nextStep = createStep(item.stepType, {
      adapterKey: item.adapterKey,
      actionKey: item.actionKey,
    });
    const targetIndex =
      selectedCanvasNode?.dataRef.type === "step"
        ? selectedCanvasNode.dataRef.stepIndex + 1
        : undefined;
    addStepAtIndex(nextStep, targetIndex);
    pushBuilderActivity(
      "create",
      `Added ${item.label} ${targetIndex !== undefined ? "after selected step" : "to workflow"}.`,
    );
  }

  function onInsertNodeOnSelectedEdge() {
    if (!selectedEdge) {
      return;
    }
    const targetNode = canvasModel.nodes.find((node) => node.id === selectedEdge.to);
    const targetIndex =
      targetNode?.dataRef.type === "step" ? targetNode.dataRef.stepIndex : undefined;
    addStepAtIndex(createStep("action"), targetIndex);
    pushBuilderActivity("create", "Inserted a new action node on selected edge.");
  }

  function onCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = canvasViewportRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    setCanvasViewport((current) =>
      zoomBuilderViewport(current, {
        deltaY: event.deltaY,
        anchorX,
        anchorY,
      }),
    );
  }

  function onCanvasMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest(".builder-node-card")) {
      return;
    }
    canvasPanStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originPanX: canvasViewport.panX,
      originPanY: canvasViewport.panY,
    };
  }

  function onNodeDragStart(event: ReactMouseEvent<HTMLElement>, nodeId: string) {
    event.stopPropagation();
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    const pointer = toCanvasPoint(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }
    const nodePosition = getNodePosition(nodeId);
    canvasDragNodeRef.current = {
      nodeId,
      startX: pointer.x,
      startY: pointer.y,
      originX: nodePosition.x,
      originY: nodePosition.y,
    };
  }

  function onStartEdgeDraft(
    event: ReactMouseEvent<HTMLButtonElement>,
    input: { nodeId: string; handle: string },
  ) {
    event.stopPropagation();
    const pointer = toCanvasPoint(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }
    setEdgeDraft({
      fromNodeId: input.nodeId,
      fromHandle: input.handle,
      pointerX: pointer.x,
      pointerY: pointer.y,
    });
  }

  function onCompleteEdgeDraft(
    event: ReactMouseEvent<HTMLButtonElement>,
    input: { nodeId: string; handle: string },
  ) {
    event.stopPropagation();
    if (!edgeDraft) {
      return;
    }
    const rewired = rewireBuilderEdge({
      model: canvasModel,
      edges: canvasEdges,
      draft: {
        fromNodeId: edgeDraft.fromNodeId,
        fromHandle: edgeDraft.fromHandle,
      },
      toNodeId: input.nodeId,
      toHandle: input.handle,
    });
    if (rewired.changed) {
      setCanvasEdges(rewired.edges);
      setInfoMessage("Connection updated.");
      setServerError(null);
      pushBuilderActivity("edit", "Updated node connection.");
    } else if (rewired.reason) {
      setServerError(rewired.reason);
    }
    setEdgeDraft(null);
  }

  const builderPalette = useMemo(
    () => getBuilderPaletteSections(adapters),
    [adapters],
  );

  const canvasModel = useMemo(() => buildBuilderCanvasModel(definition), [definition]);
  const selectedRun = useMemo(
    () => runRecords.find((run) => run.id === selectedRunId) || null,
    [runRecords, selectedRunId],
  );
  const selectedEdge = useMemo(
    () => canvasEdges.find((edge) => edge.id === selectedEdgeId) || null,
    [canvasEdges, selectedEdgeId],
  );
  const mergedCanvasModel = useMemo(
    () => ({
      ...canvasModel,
      edges: canvasEdges,
    }),
    [canvasModel, canvasEdges],
  );
  const canvasBounds = useMemo(
    () => getBuilderCanvasBounds(mergedCanvasModel, 48, nodePositions),
    [mergedCanvasModel, nodePositions],
  );
  const renderableEdges = useMemo(
    () =>
      buildRenderableBuilderEdges(
        mergedCanvasModel,
        {
          positions: nodePositions,
          draft: edgeDraft,
        },
      ),
    [mergedCanvasModel, nodePositions, edgeDraft],
  );
  const edgeInteractionHints = useMemo(
    () => getBuilderEdgeInteractionHints(mergedCanvasModel),
    [mergedCanvasModel],
  );
  const reactFlowProjection = useMemo(
    () => toReactFlowProjection({ model: mergedCanvasModel, positions: nodePositions }),
    [mergedCanvasModel, nodePositions],
  );
  const nodeRuntimeMap = useMemo(
    () =>
      buildBuilderNodeRuntimeMap({
        model: mergedCanvasModel,
        run: selectedRun,
        logs: selectedRunLogs,
      }),
    [mergedCanvasModel, selectedRun, selectedRunLogs],
  );
  const selectedCanvasNode = useMemo(
    () => getCanvasNodeById(canvasModel, selectedNodeId),
    [canvasModel, selectedNodeId],
  );
  const selectedStepIndex =
    selectedCanvasNode?.dataRef.type === "step"
      ? selectedCanvasNode.dataRef.stepIndex
      : -1;
  const selectedStep =
    selectedStepIndex >= 0 ? definition.steps[selectedStepIndex] : null;
  const setupStages = useMemo(() => getBuilderSetupStages(), []);
  const selectedInspectorStage: BuilderSetupStageId =
    (selectedCanvasNode && inspectorStageByNode[selectedCanvasNode.id]) || "overview";
  const selectedNodeValidation = useMemo(() => {
    if (!selectedCanvasNode) {
      return null;
    }
    if (selectedCanvasNode.dataRef.type === "trigger") {
      return validateTriggerSetup({
        definition,
        adapters,
      });
    }
    if (selectedCanvasNode.dataRef.type === "step" && selectedStep) {
      return validateWorkflowStepSetup({
        step: selectedStep,
        adapters,
      });
    }
    return null;
  }, [selectedCanvasNode, selectedStep, definition, adapters]);
  const selectedNodeTestResult = selectedCanvasNode
    ? nodeSetupTestResults[selectedCanvasNode.id]
    : null;
  const selectedNodeSetupProgress = useMemo(() => {
    if (!selectedNodeValidation) {
      return {
        complete: 0,
        total: 0,
      };
    }
    const total = selectedNodeValidation.requiredFields.length;
    const complete = selectedNodeValidation.requiredFields.filter((field) => field.complete).length;
    return {
      complete,
      total,
    };
  }, [selectedNodeValidation]);
  const selectedEdgePreview = useMemo(() => {
    if (!selectedEdge) {
      return null;
    }
    const fromNode = canvasModel.nodes.find((node) => node.id === selectedEdge.from);
    const toNode = canvasModel.nodes.find((node) => node.id === selectedEdge.to);
    if (!fromNode || !toNode) {
      return null;
    }
    return {
      fromLabel: fromNode.label,
      toLabel: toNode.label,
      role: selectedEdge.branchRole || "primary",
    };
  }, [selectedEdge, canvasModel]);
  const reactFlowNodes = useMemo(
    () =>
      reactFlowProjection.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        data: {
          ...(node.data as Record<string, unknown>),
          label: (
            <div className="builder-rf-node-content">
              <div className="builder-rf-node-head">
                <strong>{String((node.data as Record<string, unknown>).label || node.id)}</strong>
                <span className={`tag runtime ${(nodeRuntimeMap[node.id] || { status: "idle" }).status}`}>
                  {(nodeRuntimeMap[node.id] || { status: "idle" }).status}
                </span>
              </div>
              <p>{String((node.data as Record<string, unknown>).summary || "")}</p>
              {(node.data as Record<string, unknown>).kind === "branch" ? (
                <div className="builder-branch-paths">
                  <span className="tag builder-branch-tag then">then</span>
                  <span className="tag builder-branch-tag else">else</span>
                </div>
              ) : null}
              {(nodeRuntimeMap[node.id] || { status: "idle" }).preview ? (
                <p className="builder-runtime-preview">
                  {(nodeRuntimeMap[node.id] || { status: "idle" }).preview}
                </p>
              ) : null}
            </div>
          ),
          runtime: nodeRuntimeMap[node.id] || { status: "idle" as const },
        },
      })),
    [reactFlowProjection.nodes, selectedNodeId, nodeRuntimeMap],
  );
  const reactFlowEdges = useMemo(
    () =>
      reactFlowProjection.edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
      })),
    [reactFlowProjection.edges, selectedEdgeId],
  );
  const onReactFlowNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, reactFlowNodes);
      setNodePositions((current) => {
        const next = { ...current };
        for (const node of nextNodes) {
          next[node.id] = {
            x: node.position.x,
            y: node.position.y,
          };
        }
        return next;
      });
    },
    [reactFlowNodes],
  );
  const onReactFlowEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, reactFlowEdges);
      const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));
      setCanvasEdges((current) => current.filter((edge) => nextEdgeIds.has(edge.id)));
      if (selectedEdgeId && !nextEdgeIds.has(selectedEdgeId)) {
        setSelectedEdgeId(null);
      }
    },
    [reactFlowEdges, selectedEdgeId, setSelectedEdgeId],
  );
  const onReactFlowConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      const rewired = rewireBuilderEdge({
        model: canvasModel,
        edges: canvasEdges,
        draft: {
          fromNodeId: connection.source,
          fromHandle: connection.sourceHandle || "out",
        },
        toNodeId: connection.target,
        toHandle: connection.targetHandle || "in",
      });
      if (rewired.changed) {
        setCanvasEdges(rewired.edges);
        setSelectedEdgeId(rewired.edges[rewired.edges.length - 1]?.id || null);
        setInfoMessage("Connection updated.");
        setServerError(null);
        pushBuilderActivity("edit", "Updated node connection.");
      } else if (rewired.reason) {
        setServerError(rewired.reason);
      }
    },
    [canvasModel, canvasEdges, setSelectedEdgeId],
  );
  const paletteDisplaySections = useMemo<BuilderPaletteDisplaySection[]>(() => {
    const normalizedSearch = paletteSearch.trim().toLowerCase();
    return builderPalette
      .map((section) => {
        const starterItems = section.items.filter((item) => !item.advanced);
        const advancedItems = section.items.filter((item) => item.advanced);
        const visibleAdvancedItems = showAdvancedPalette ? advancedItems : [];
        const visibleItems = [...starterItems, ...visibleAdvancedItems].filter((item) => {
          if (!normalizedSearch) {
            return true;
          }
          const haystack =
            `${item.label} ${item.description} ${item.adapterKey || ""} ${item.actionKey || ""}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        });
        return {
          ...section,
          starterItems,
          advancedItems,
          visibleItems,
        };
      })
      .filter((section) => section.visibleItems.length > 0 || section.advancedItems.length > 0);
  }, [builderPalette, paletteSearch, showAdvancedPalette]);
  const quickInsertItems = useMemo(() => {
    const normalizedQuery = quickInsertQuery.trim().toLowerCase();
    const flattened = builderPalette.flatMap((section) => {
      const starterItems = section.items.filter((item) => !item.advanced);
      const advancedItems = showAdvancedPalette ? section.items.filter((item) => item.advanced) : [];
      return [...starterItems, ...advancedItems];
    });
    return flattened.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${item.label} ${item.description} ${item.adapterKey || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [builderPalette, quickInsertQuery, showAdvancedPalette]);
  const minimapGeometry = useMemo(() => {
    const mapWidth = 220;
    const mapHeight = 136;
    const scale = Math.min(
      mapWidth / Math.max(canvasBounds.width, 1),
      mapHeight / Math.max(canvasBounds.height, 1),
    );
    const viewportX = (-canvasViewport.panX / canvasViewport.zoom - canvasBounds.minX) * scale;
    const viewportY = (-canvasViewport.panY / canvasViewport.zoom - canvasBounds.minY) * scale;
    const viewportWidth =
      (canvasViewportRef.current?.clientWidth || 0) / canvasViewport.zoom * scale;
    const viewportHeight =
      (canvasViewportRef.current?.clientHeight || 0) / canvasViewport.zoom * scale;

    return {
      mapWidth,
      mapHeight,
      scale,
      viewportX,
      viewportY,
      viewportWidth,
      viewportHeight,
    };
  }, [canvasBounds, canvasViewport]);

  function toCanvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const container = canvasViewportRef.current;
    if (!container) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - canvasViewport.panX) / canvasViewport.zoom,
      y: (clientY - rect.top - canvasViewport.panY) / canvasViewport.zoom,
    };
  }

  function snapCanvasPosition(value: number): number {
    const grid = 12;
    return Math.round(value / grid) * grid;
  }

  function getNodePosition(nodeId: string): { x: number; y: number } {
    const node = canvasModel.nodes.find((candidate) => candidate.id === nodeId);
    const fallback = node
      ? { x: node.presentation.x, y: node.presentation.y }
      : { x: 0, y: 0 };
    return nodePositions[nodeId] || fallback;
  }

  useEffect(() => {
    setNodePositions((current) => createBuilderNodePositionMap(canvasModel, current));
    setCanvasEdges((current) =>
      reconcileBuilderEdges(canvasModel, current.length > 0 ? current : canvasModel.edges),
    );
  }, [canvasModel]);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }
    const stillExists = canvasEdges.some((edge) => edge.id === selectedEdgeId);
    if (!stillExists) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, canvasEdges]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedRunId) {
      setSelectedRunLogs([]);
      return;
    }
    setSelectedRunLogsLoading(true);
    void listLogs({ runId: selectedRunId })
      .then((logs) => {
        if (!cancelled) {
          setSelectedRunLogs(logs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedRunLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedRunLogsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      if (canvasPanStateRef.current) {
        const deltaX = event.clientX - canvasPanStateRef.current.startX;
        const deltaY = event.clientY - canvasPanStateRef.current.startY;
        setCanvasViewport((current) => ({
          ...current,
          panX: canvasPanStateRef.current!.originPanX + deltaX,
          panY: canvasPanStateRef.current!.originPanY + deltaY,
        }));
      }

      if (canvasDragNodeRef.current) {
        const pointer = toCanvasPoint(event.clientX, event.clientY);
        if (!pointer) {
          return;
        }
        const nodeId = canvasDragNodeRef.current.nodeId;
        const nextX =
          canvasDragNodeRef.current.originX + (pointer.x - canvasDragNodeRef.current.startX);
        const nextY =
          canvasDragNodeRef.current.originY + (pointer.y - canvasDragNodeRef.current.startY);
        setNodePositions((current) => ({
          ...current,
          [nodeId]: {
            x: snapCanvasPosition(nextX),
            y: snapCanvasPosition(nextY),
          },
        }));
      }

      if (edgeDraft) {
        const pointer = toCanvasPoint(event.clientX, event.clientY);
        if (!pointer) {
          return;
        }
        setEdgeDraft({
          ...edgeDraft,
          pointerX: pointer.x,
          pointerY: pointer.y,
        });
      }
    }

    function onMouseUp() {
      canvasPanStateRef.current = null;
      canvasDragNodeRef.current = null;
      if (edgeDraft) {
        setEdgeDraft(null);
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [edgeDraft, canvasViewport]);

  useEffect(() => {
    const nodeExists = canvasModel.nodes.some((node) => node.id === selectedNodeId);
    if (nodeExists) {
      return;
    }

    const fallbackStepNode = canvasModel.nodes.find((node) => node.dataRef.type === "step");
    setSelectedNodeId(fallbackStepNode?.id || "node:trigger");
  }, [canvasModel, selectedNodeId]);

  useEffect(() => {
    if (!selectedCanvasNode) {
      return;
    }
    setInspectorStageByNode((current) => {
      if (current[selectedCanvasNode.id]) {
        return current;
      }
      return {
        ...current,
        [selectedCanvasNode.id]: "overview",
      };
    });
  }, [selectedCanvasNode]);

  async function runSelectedNodeSetupTest() {
    if (!selectedCanvasNode || !selectedNodeValidation) {
      return;
    }
    const result = runBuilderNodeSetupTest({
      nodeLabel: selectedCanvasNode.label,
      validation: selectedNodeValidation,
    });
    setNodeSetupTestResults((current) => ({
      ...current,
      [selectedCanvasNode.id]: result,
    }));
    if (result.status === "passed") {
      setServerError(null);
      setInfoMessage(result.message);
      pushBuilderActivity("test", result.message);
      setInspectorStageByNode((current) => ({
        ...current,
        [selectedCanvasNode.id]: "save",
      }));
      return;
    }
    setServerError(result.message);
  }

  async function saveSelectedNodeSetup() {
    if (!selectedCanvasNode || !selectedNodeValidation) {
      return;
    }
    if (!selectedNodeValidation.valid) {
      setValidationErrors(selectedNodeValidation.issues);
      setServerError("Finish required setup fields before saving this node.");
      return;
    }
    const valid = await validateCurrentDefinition();
    if (!valid) {
      return;
    }
    setServerError(null);
    setInfoMessage(`${selectedCanvasNode.label} setup saved to workflow draft.`);
    pushBuilderActivity("save", `${selectedCanvasNode.label} setup saved.`);
    updateSelectedNodeStage("save");
  }

  async function validateCurrentDefinition(candidate?: WorkflowDefinition): Promise<boolean> {
    const subject = candidate || definition;
    const structure = validateWorkflowStructure(subject);
    if (!structure.valid) {
      setValidationErrors(structure.errors);
      return false;
    }
    const result = await validateWorkflow({
      definition: subject,
    });
    setValidationErrors(result.errors || []);
    return result.valid;
  }

  async function ensureTemplateLoaded(templateId: string): Promise<WorkflowTemplate | null> {
    if (templateCache[templateId]) {
      return templateCache[templateId];
    }

    try {
      const template = await getWorkflowTemplate(templateId);
      setTemplateCache((current) => ({
        ...current,
        [templateId]: template,
      }));
      return template;
    } catch (error) {
      setServerError((error as Error).message || "Failed to load template detail.");
      return null;
    }
  }

  async function onUseTemplate(templateId: string) {
    setServerError(null);
    setInfoMessage(null);
    const template = await ensureTemplateLoaded(templateId);
    if (!template) {
      return;
    }

    const nextDefinition = buildWorkflowFromTemplate(template, {
      workspaceId: session?.scope.workspaceId || "",
      organizationId: session?.scope.organizationId || "",
    });
    updateDefinition(nextDefinition);
    setName(`${template.title} Automation`);
    setSelectedTemplateId(template.id);
    setTriggerConfigDraft(JSON.stringify(nextDefinition.trigger.config || {}, null, 2));
    setContextDraft(JSON.stringify(nextDefinition.context || {}, null, 2));
    setEditorMode("form");
    setInfoMessage(
      `Loaded template "${template.title}". Review mappings, then create your automation.`,
    );
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    setInfoMessage(null);

    let candidate = definition;

    if (editorMode === "json") {
      try {
        candidate = JSON.parse(jsonDraft) as WorkflowDefinition;
        setDefinition(candidate);
        setJsonError(null);
      } catch {
        setJsonError("JSON is invalid. Fix JSON before creating the automation.");
        return;
      }
    }

    const valid = await validateCurrentDefinition(candidate);
    if (!valid) {
      return;
    }

    try {
      await createWorkflow({
        name,
        definition: candidate,
      });
      await load();
      setName("New Automation");
      const nextDefault = buildDefaultWorkflow(adapters, {
        workspaceId: session?.scope.workspaceId || "",
        organizationId: session?.scope.organizationId || "",
      });
      setDefinition(nextDefault);
      setTriggerConfigDraft(JSON.stringify(nextDefault.trigger.config || {}, null, 2));
      setContextDraft(JSON.stringify(nextDefault.context || {}, null, 2));
      setValidationErrors([]);
      setInfoMessage(
        "Automation created successfully. Next: send a test run from First Success or the Activity surface.",
      );
    } catch (error) {
      const maybeAxiosError = error as {
        response?: {
          data?: {
            error?: string;
            details?: string[];
          };
        };
        message?: string;
      };

      if (maybeAxiosError.response?.data?.details) {
        setValidationErrors(maybeAxiosError.response.data.details);
      }
      setServerError(
        maybeAxiosError.response?.data?.error ||
          maybeAxiosError.message ||
          "Failed to create automation.",
      );
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow={routeMode === "overview" ? "Workflows" : "Workflow Studio"}
        title={
          routeMode === "detail"
            ? "Edit Workflow"
            : routeMode === "create"
              ? "Build a New Workflow"
              : "Workflow Library and Studio"
        }
        subtitle={
          routeMode === "overview"
            ? "Browse starter workflows, open the studio, and keep contract-backed validation and test-run behavior underneath the replacement UI system."
            : "Use the dedicated workflow studio route for builder work, then move directly into Activity, approvals, and alerts without falling back to the retired shell."
        }
        actions={
          <>
            {nextStep ? (
              <StatusPill tone="warning">Next: {nextStep.title}</StatusPill>
            ) : (
              <StatusPill tone="success">Onboarding complete</StatusPill>
            )}
            {params.workflowId ? (
              <StatusPill tone="info">Workflow: {params.workflowId}</StatusPill>
            ) : null}
            <Link to="/first-automation">First success</Link>
            <Link to="/activity?view=runs">Activity</Link>
            {isOperator ? <Link to="/audit-logs">Audit</Link> : null}
          </>
        }
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Templates" value={templates.length} />
            <InsightChip label="Automations" value={workflows.length} />
            <InsightChip label="Runs" value={runsCount} />
          </>
        }
        right={
          <>
            <Link to="/integrations">Integrations</Link>
            <Link to="/workflows/new">Open studio</Link>
            <Link to="/activity?view=runs">Activity</Link>
          </>
        }
      />

      <DemoHint>
        Fastest path: pick a template, click <strong>Use template</strong>, then create the automation and
        run a simulator test from <Link to="/activity?view=runs">Activity</Link>.
      </DemoHint>

      <details
        open={showBuilderSupport}
        onToggle={(event) =>
          setShowBuilderSupport((event.currentTarget as HTMLDetailsElement).open)
        }
      >
        <summary>Starter resources: templates, goal drafts, and workflow memory</summary>
        <div className="stack" style={{ marginTop: 12 }}>
      <SurfaceCard
        title="Choose your starting path"
        subtitle="Start with templates for faster results, or switch to advanced mode when you need full control."
        muted
      >
        <div className="template-grid">
          <article className="template-card">
            <div className="template-title">Starter path (recommended)</div>
            <p>Use a prebuilt automation and customize just the parts you need.</p>
            <div className="inline-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  setTemplateCategory("all");
                  setTemplateSearch("");
                }}
              >
                Browse starter templates
              </button>
              <Link to="/first-automation">Open first success guide</Link>
            </div>
          </article>
          <article className="template-card">
            <div className="template-title">Advanced path</div>
            <p>Build from structured step forms and optional JSON controls.</p>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => setShowAdvancedBuilder(!showAdvancedBuilder)}
              >
                {showAdvancedBuilder ? "Hide advanced controls" : "Enable advanced controls"}
              </button>
            </div>
          </article>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Template gallery" subtitle="Choose by outcome, not by technical internals.">
        <div className="stack-sm">
          <label>
            Search starter outcomes
            <input
              value={templateSearch}
              onChange={(event) => setTemplateSearch(event.target.value)}
              placeholder="Find by app, business outcome, or keyword"
              style={{ marginTop: 4, width: "100%" }}
            />
          </label>
          <FilterPills
            options={templateFilterPills}
            value={templateCategory}
            onChange={setTemplateCategory}
          />
          {templateCategoryOptions.hiddenCount > 0 ? (
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => setShowAllTemplateCategories((current) => !current)}
              >
                {showAllTemplateCategories
                  ? "Show fewer categories"
                  : `Show ${templateCategoryOptions.hiddenCount} more categories`}
              </button>
            </div>
          ) : null}
        </div>

        {filteredTemplates.length === 0 ? (
          <EmptyStatePanel
            title="No templates matched these filters"
            description="Try another category, clear the search text, or follow onboarding recommendations."
            primaryAction={
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  setTemplateSearch("");
                  setTemplateCategory("all");
                }}
              >
                Reset filters
              </button>
            }
            secondaryAction={<Link to="/onboarding">Open onboarding</Link>}
          />
        ) : null}

        <div className="template-grid">
          {filteredTemplates.map((template) => {
            const templateStatus = getTemplateStatus(template, {
              enabledAdapterKeys,
              connectedAdapterKeys: Array.from(validCredentialProviders),
            });
            const missingAdapters = templateStatus.missingAdapters;
            const adaptersNeedingConnection = templateStatus.adaptersNeedingConnection;
            const isBlocked = templateStatus.blocked;

            return (
              <article
                key={template.id}
                className={`template-card ${selectedTemplateId === template.id ? "highlight" : ""}`}
              >
                <div className="template-header-row">
                  <div>
                    <div className="template-title">{template.title}</div>
                    <p>{template.description}</p>
                  </div>
                  <div className="stack-sm" style={{ alignItems: "flex-end" }}>
                    <span className="tag">{template.category}</span>
                    <span className="tag">{template.difficulty}</span>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag">Required apps: {template.requiredAdapters.join(", ")}</span>
                  <span className="tag">Trigger: {template.triggerSummary}</span>
                  <span className="tag">Actions: {template.actionSummary}</span>
                  <span className="tag">Status: {templateStatus.status.replace(/_/g, " ")}</span>
                </div>

                {missingAdapters.length > 0 ? (
                  <Callout tone="danger" title="Blocked: missing enabled apps">
                    <p>{missingAdapters.join(", ")}</p>
                  </Callout>
                ) : null}

                {adaptersNeedingConnection.length > 0 ? (
                  <Callout tone="warning" title="Connection required before use">
                    <p>{adaptersNeedingConnection.join(", ")}</p>
                    <div className="inline-actions">
                      <Link
                        to={`/integrations?appKey=${encodeURIComponent(
                          adaptersNeedingConnection[0],
                        )}&templateId=${encodeURIComponent(
                          template.id,
                        )}&returnTo=${encodeURIComponent(
                          `/workflows?templateId=${encodeURIComponent(template.id)}`,
                        )}`}
                      >
                        Connect app
                      </Link>
                    </div>
                  </Callout>
                ) : null}

                <div className="inline-actions">
                  <button type="button" onClick={() => setSelectedTemplateId(template.id)}>
                    Inspect
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void onUseTemplate(template.id)}
                    disabled={isBlocked}
                  >
                    Use template
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </SurfaceCard>

      {selectedTemplate ? (
        <SurfaceCard title={`Template details: ${selectedTemplate.title}`} muted>
          <p>{selectedTemplate.description}</p>
          <div>
            <strong>Setup notes</strong>
            <ul>
              {"setupNotes" in selectedTemplate
                ? selectedTemplate.setupNotes.map((note) => <li key={note}>{note}</li>)
                : null}
            </ul>
          </div>
        </SurfaceCard>
      ) : null}

      <SurfaceCard
        title="Create Agent from Goal"
        subtitle="Describe the outcome you want, then start from an AI-first automation draft."
        muted
      >
        <div className="stack-sm">
          <label>
            Goal
            <textarea
              rows={3}
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              placeholder="Example: Research product launch feedback, summarize it, then send an update to Slack."
              style={{ marginTop: 4 }}
            />
          </label>
          <div className="inline-actions">
            <button type="button" className="button-primary" onClick={onCreateAgentFromGoal}>
              Generate agent workflow
            </button>
            <span className="tag">Goal-first draft</span>
          </div>
          {goalSuggestions.length > 0 ? (
            <div className="tag-row">
              {goalSuggestions.map((suggestion) => (
                <span key={suggestion.toolId} className="tag">
                  {suggestion.title} ({Math.round(suggestion.confidence * 100)}%)
                </span>
              ))}
            </div>
          ) : (
            <p>Tip: mention outcomes like summarize, notify, post, or research to get better tool suggestions.</p>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Agent Memory Panel"
        subtitle="Workflow memory is persistent knowledge that AI agent steps can read on each run."
        muted
      >
        <div className="stack-sm">
          <label>
            Workflow
            <select
              value={memoryWorkflowId}
              onChange={(event) => setMemoryWorkflowId(event.target.value)}
              style={{ marginTop: 4, width: "100%" }}
            >
              {workflows.length === 0 ? (
                <option value="">No saved automations yet</option>
              ) : (
                workflows.map((workflow) => (
                  <option key={`memory-${workflow.id}`} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))
              )}
            </select>
          </label>
          {memoryLoading ? <LoadingInline label="Loading workflow memory..." /> : null}
          {!memoryLoading && agentMemoryRecords.length === 0 ? (
            <p>No memory entries yet. Save a key/value pair to reuse context across runs.</p>
          ) : null}
          {!memoryLoading && agentMemoryRecords.length > 0 ? (
            <div className="stack-sm">
              {agentMemoryRecords.map((memory) => (
                <div key={memory.id} className="step-card">
                  <div className="step-header">
                    <strong>{memory.key}</strong>
                    <span className="tag">{memory.scope}</span>
                  </div>
                  <code>{JSON.stringify(memory.value)}</code>
                  <p style={{ marginTop: 6 }}>
                    Updated {new Date(memory.updatedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          <details>
            <summary>Add or update memory key</summary>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <label>
                Memory key
                <input
                  value={memoryKeyDraft}
                  onChange={(event) => setMemoryKeyDraft(event.target.value)}
                  placeholder="team.preferred_tone"
                  style={{ marginTop: 4 }}
                />
              </label>
              <label>
                JSON value
                <textarea
                  rows={4}
                  value={memoryValueDraft}
                  onChange={(event) => setMemoryValueDraft(event.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>
              <div className="inline-actions">
                <button type="button" className="button-primary" onClick={() => void onSaveWorkflowMemory()}>
                  Save memory
                </button>
                {memoryMessage ? <span className="tag">{memoryMessage}</span> : null}
              </div>
            </div>
          </details>
        </div>
      </SurfaceCard>
        </div>
      </details>

      <form onSubmit={onCreate} className="stack">
        <SurfaceCard
          title="Builder"
          subtitle="Guided mode is best for most users. Advanced controls are optional."
          highlight
        >
          <div className="inline-actions">
            <label>
              Automation name
              <input value={name} onChange={(event) => setName(event.target.value)} style={{ marginLeft: 8 }} />
            </label>

            <button
              type="button"
              className={editorMode === "form" ? "button-primary" : ""}
              onClick={() => {
                setEditorMode("form");
                setJsonError(null);
              }}
            >
              Guided mode
            </button>
            <button type="button" onClick={() => setShowAdvancedBuilder(!showAdvancedBuilder)}>
              {showAdvancedBuilder ? "Hide advanced options" : "Show advanced options"}
            </button>
          </div>

          {showAdvancedBuilder ? (
            <div className="section-divider stack-sm">
              <div className="inline-actions">
                <label>
                  Definition id
                  <input
                    value={definition.id}
                    onChange={(event) =>
                      updateDefinition({
                        ...definition,
                        id: event.target.value,
                      })
                    }
                    style={{ marginLeft: 8 }}
                  />
                </label>
                <button
                  type="button"
                  className={editorMode === "json" ? "button-primary" : ""}
                  onClick={() => {
                    setJsonDraft(JSON.stringify(definition, null, 2));
                    setEditorMode("json");
                    setJsonError(null);
                  }}
                >
                  Advanced JSON
                </button>
              </div>
            </div>
          ) : null}
        </SurfaceCard>

        <div id="workflow-studio-root" />

        {editorMode === "form" ? (
          <SurfaceCard
            title="Visual builder canvas"
            subtitle="Canvas first: add nodes from the palette, wire flow in the center, then finish setup in the inspector."
          >
            <div className="builder-workspace-grid phase4">
              <aside className="builder-palette-surface">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <h4>Node palette</h4>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedPalette(!showAdvancedPalette)}
                  >
                    {showAdvancedPalette ? "Hide advanced nodes" : "Show advanced nodes"}
                  </button>
                </div>
                <p>
                  Add a node after the selected step, or append it to the end when no step is
                  selected.
                </p>
                <label>
                  Search palette
                  <input
                    value={paletteSearch}
                    onChange={(event) => setPaletteSearch(event.target.value)}
                    placeholder="Search app, action, or node type"
                    style={{ marginTop: 4, width: "100%" }}
                  />
                </label>
                <div className="tag-row">
                  <span className="tag">
                    Insert target:{" "}
                    {selectedCanvasNode?.dataRef.type === "step"
                      ? `after ${selectedCanvasNode.label}`
                      : "end of flow"}
                  </span>
                  <span className="tag">Starter first</span>
                </div>
                {paletteDisplaySections.length === 0 ? (
                  <EmptyStatePanel
                    title="No matching nodes"
                    description="Try another search term or show advanced nodes."
                    primaryAction={
                      <button type="button" onClick={() => setPaletteSearch("")}>
                        Clear search
                      </button>
                    }
                  />
                ) : null}
                <div className="builder-palette-sections">
                  {paletteDisplaySections.map((section) => (
                    <article key={section.id} className="builder-palette-section">
                      <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                        <strong>{section.title}</strong>
                        <span className="tag">
                          {section.visibleItems.length}
                          {section.advancedItems.length > 0 && !showAdvancedPalette
                            ? ` +${section.advancedItems.length} advanced`
                            : ""}
                        </span>
                      </div>
                      <p>{section.description}</p>
                      {section.visibleItems.length === 0 ? (
                        <div className="empty-state">
                          <p>No visible nodes in this section.</p>
                        </div>
                      ) : (
                        <div className="builder-palette-item-list">
                          {section.visibleItems.map((item) => (
                            <article key={item.id} className="builder-palette-item">
                              <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                                <strong>{item.label}</strong>
                                <span className={`tag readiness-${item.readinessTier || "ready"}`}>
                                  {toReadinessLabel(item.readinessTier)}
                                </span>
                              </div>
                              <p>{item.description}</p>
                              <div className="tag-row">
                                <span className="tag">{item.stepType}</span>
                                <span className="tag">{toSupportModelLabel(item.supportModel)}</span>
                              </div>
                              {item.setupHint ? (
                                <p className="builder-palette-hint">{item.setupHint}</p>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  onPaletteInsert({
                                    label: item.label,
                                    stepType: item.stepType,
                                    adapterKey: item.adapterKey,
                                    actionKey: item.actionKey,
                                  })
                                }
                              >
                                Add node
                              </button>
                            </article>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </aside>

              <section className="builder-canvas-surface">
                <div className="inline-actions">
                  <span className="tag">Nodes: {mergedCanvasModel.nodes.length}</span>
                  <span className="tag">Edges: {canvasEdges.length}</span>
                  <label>
                    Inspect run
                    <select
                      value={selectedRunId}
                      onChange={(event) => setSelectedRunId(event.target.value)}
                      style={{ marginLeft: 8 }}
                    >
                      <option value="">No run selected</option>
                      {runRecords.slice(0, 40).map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.id.slice(0, 8)} · {run.status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {builderActivity ? (
                  <Callout
                    tone={toBuilderActivityTone(builderActivity.kind)}
                    title="Builder activity"
                  >
                    <p>{builderActivity.message}</p>
                  </Callout>
                ) : null}

                {selectedEdgePreview ? (
                  <div className="builder-insert-target">
                    Insertion preview: {selectedEdgePreview.fromLabel} {"->"} {selectedEdgePreview.toLabel}
                    {" "}
                    ({selectedEdgePreview.role})
                  </div>
                ) : null}

                {!structureValidation.valid ? (
                  <Callout tone="warning" title="Structure needs attention">
                    <ul>
                      {structureValidation.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </Callout>
                ) : null}

                <div className="builder-free-canvas-shell">
                  <div className="builder-free-canvas-toolbar inline-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setNodePositions(createBuilderNodePositionMap(canvasModel));
                        setSelectedEdgeId(null);
                      }}
                    >
                      Reset layout
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNodePositions(createBuilderNodePositionMap(canvasModel))
                      }
                    >
                      Auto-layout
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedEdgeId) {
                          return;
                        }
                        const confirmed = window.confirm(
                          "Remove selected connection edge?",
                        );
                        if (!confirmed) {
                          return;
                        }
                        setCanvasEdges((current) => removeBuilderEdge(current, selectedEdgeId));
                        setSelectedEdgeId(null);
                        pushBuilderActivity("delete", "Removed selected edge.");
                      }}
                      disabled={!selectedEdgeId}
                    >
                      Remove selected edge
                    </button>
                    <button
                      type="button"
                      onClick={onInsertNodeOnSelectedEdge}
                      disabled={!selectedEdge}
                    >
                      + Insert on selected edge
                    </button>
                    {selectedRunLogsLoading ? <span className="tag">Loading run logs...</span> : null}
                    <span className="tag">
                      XYFlow ready: {reactFlowProjection.nodes.length} nodes /{" "}
                      {reactFlowProjection.edges.length} edges
                    </span>
                  </div>

                  <div
                    className="builder-reactflow-viewport"
                    data-reactflow-node-count={reactFlowProjection.nodes.length}
                    data-reactflow-edge-count={reactFlowProjection.edges.length}
                  >
                    {/* BUILDER: React Flow / XYFlow canonical canvas runtime */}
                    <ReactFlow
                      nodes={reactFlowNodes}
                      edges={reactFlowEdges}
                      onNodesChange={onReactFlowNodesChange}
                      onEdgesChange={onReactFlowEdgesChange}
                      onConnect={onReactFlowConnect}
                      onNodeClick={(_, node) => {
                        setSelectedNodeId(node.id);
                      }}
                      onEdgeClick={(_, edge) => {
                        setSelectedEdgeId(edge.id);
                      }}
                      onPaneClick={() => {
                        setSelectedEdgeId(null);
                      }}
                      fitView
                      fitViewOptions={{ padding: 0.2 }}
                    >
                      <Background gap={20} size={1} />
                      <MiniMap pannable zoomable />
                      <Controls position="bottom-right" />
                    </ReactFlow>
                  </div>
                </div>

                {quickInsertNodeId ? (
                  <div className="builder-quick-insert-panel stack-sm">
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <strong>Quick insert step</strong>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickInsertNodeId(null);
                          setQuickInsertIndex(null);
                          setQuickInsertQuery("");
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <label>
                      Search step/action
                      <input
                        value={quickInsertQuery}
                        onChange={(event) => setQuickInsertQuery(event.target.value)}
                        placeholder="Search by app or step type"
                        style={{ marginTop: 4, width: "100%" }}
                      />
                    </label>
                    <div className="builder-quick-insert-list">
                      {quickInsertItems.slice(0, 12).map((item) => (
                        <button
                          key={`quick-insert-${item.id}`}
                          type="button"
                          onClick={() => onQuickInsert(item)}
                        >
                          {item.label}
                          <span className="tag">{item.stepType}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="inline-actions">
                  <span className="tag">Primary flow</span>
                  <span className="tag builder-branch-tag then">Then path</span>
                  <span className="tag builder-branch-tag else">Else path</span>
                  <span className="tag">Drag blank canvas to pan</span>
                </div>

                <details>
                  <summary>Edge interaction hints (future rewiring model)</summary>
                  <ul>
                    {edgeInteractionHints.slice(0, 20).map((edgeHint) => (
                      <li key={edgeHint.edgeId}>
                        {edgeHint.fromNodeId} {" -> "} {edgeHint.toNodeId}
                        {edgeHint.branchRole ? ` (${edgeHint.branchRole})` : ""}
                        {` | ${edgeHint.fromHandle} -> ${edgeHint.toHandle}`}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>

              <aside className="builder-inspector-surface">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <h4>Node setup inspector</h4>
                  <span className="tag">
                    {selectedCanvasNode ? `${selectedCanvasNode.kind} node` : "none selected"}
                  </span>
                </div>

                {selectedCanvasNode ? (
                  <>
                    <div className="builder-setup-stage-row">
                      {setupStages.map((stage) => {
                        const isActive = selectedInspectorStage === stage.id;
                        const isCompleted =
                          stage.id === "overview"
                            ? true
                            : stage.id === "required"
                              ? Boolean(selectedNodeValidation?.valid)
                              : stage.id === "test"
                                ? selectedNodeTestResult?.status === "passed"
                                : Boolean(selectedNodeValidation?.valid) &&
                                  selectedNodeTestResult?.status === "passed";
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            className={`builder-stage-pill ${isActive ? "active" : ""}`}
                            onClick={() => updateSelectedNodeStage(stage.id)}
                          >
                            <span>{stage.title}</span>
                            {isCompleted ? <span className="tag">Done</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="tag-row">
                      <span className="tag">
                        Required fields: {selectedNodeSetupProgress.complete}/
                        {selectedNodeSetupProgress.total}
                      </span>
                      {selectedNodeValidation?.valid ? (
                        <span className="tag">Ready to test</span>
                      ) : (
                        <span className="tag">Required setup incomplete</span>
                      )}
                    </div>
                    {selectedInspectorStage === "overview" ? (
                      <Callout tone="info" title="Setup sequence">
                        <p>
                          Complete required fields first, run a setup test, then save this node.
                          Advanced settings stay secondary until Save.
                        </p>
                      </Callout>
                    ) : null}
                    {selectedInspectorStage === "required" && selectedNodeValidation ? (
                      <div className="stack-sm">
                        <ul className="setup-checklist">
                          {selectedNodeValidation.requiredFields.map((field, index) => (
                            <li
                              key={`${field.key}-${index}`}
                              className={`setup-checklist-item ${field.complete ? "done" : "active"}`}
                            >
                              <span className="setup-checklist-index">{index + 1}</span>
                              <div className="stack-sm">
                                <strong>{field.label}</strong>
                                <p>{field.helpText || "Required before testing this node."}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {selectedNodeValidation.issues.length > 0 ? (
                          <Callout tone="danger" title="Missing required fields">
                            <ul>
                              {selectedNodeValidation.issues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          </Callout>
                        ) : null}
                        {selectedNodeValidation.warnings.length > 0 ? (
                          <Callout tone="warning" title="Readiness hints">
                            <ul>
                              {selectedNodeValidation.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          </Callout>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedInspectorStage === "test" ? (
                      <div className="stack-sm">
                        <Callout tone="info" title="Node setup test">
                          <p>Run a dry setup test to verify required inputs before saving.</p>
                        </Callout>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="button-primary"
                            onClick={() => void runSelectedNodeSetupTest()}
                            disabled={!selectedNodeValidation?.valid}
                          >
                            Run setup test
                          </button>
                          <button type="button" onClick={() => updateSelectedNodeStage("required")}>
                            Back to required
                          </button>
                        </div>
                        {selectedNodeTestResult ? (
                          <Callout
                            tone={selectedNodeTestResult.status === "passed" ? "success" : "danger"}
                            title={selectedNodeTestResult.status === "passed" ? "Test passed" : "Test failed"}
                          >
                            <p>{selectedNodeTestResult.message}</p>
                            {selectedNodeTestResult.warnings.length > 0 ? (
                              <ul>
                                {selectedNodeTestResult.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : null}
                          </Callout>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedInspectorStage === "save" ? (
                      <div className="stack-sm">
                        <Callout tone="success" title="Ready to save">
                          <p>
                            Save this node setup to the workflow draft after required fields and
                            test pass.
                          </p>
                        </Callout>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="button-primary"
                            onClick={() => void saveSelectedNodeSetup()}
                            disabled={!selectedNodeValidation?.valid}
                          >
                            Save node setup
                          </button>
                          <button type="button" onClick={() => updateSelectedNodeStage("test")}>
                            Re-run test
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyStatePanel
                    title="Select a node"
                    description="Pick a trigger or step in the canvas to configure it."
                  />
                )}

                {selectedCanvasNode ? (
                  <Callout tone="info" title="Inline execution feedback">
                    <p>
                      Status: {nodeRuntimeMap[selectedCanvasNode.id]?.status || "idle"}
                      {nodeRuntimeMap[selectedCanvasNode.id]?.preview
                        ? ` · ${nodeRuntimeMap[selectedCanvasNode.id]?.preview}`
                        : ""}
                    </p>
                  </Callout>
                ) : null}

                {selectedCanvasNode?.dataRef.type === "trigger" ? (
                  <div className="stack-sm">
                    <label>
                      App
                      <select
                        value={definition.trigger.adapter}
                        onChange={(event) => {
                          const adapterKey = event.target.value;
                          const adapter = adapters.find((item) => item.key === adapterKey);
                          updateDefinition({
                            ...definition,
                            trigger: {
                              ...definition.trigger,
                              adapter: adapterKey,
                              trigger: adapter?.supportedTriggers[0] || definition.trigger.trigger,
                            },
                          });
                          pushBuilderActivity("edit", "Updated trigger app.");
                          setInspectorStageByNode((current) => ({
                            ...current,
                            ["node:trigger"]: "required",
                          }));
                        }}
                        style={{ marginTop: 4, width: "100%" }}
                      >
                        {adapters.map((adapter) => (
                          <option key={adapter.key} value={adapter.key}>
                            {adapter.displayName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Trigger
                      <select
                        value={definition.trigger.trigger}
                        onChange={(event) => {
                          updateDefinition({
                            ...definition,
                            trigger: {
                              ...definition.trigger,
                              trigger: event.target.value,
                            },
                          });
                          pushBuilderActivity("edit", "Updated trigger event.");
                          setInspectorStageByNode((current) => ({
                            ...current,
                            ["node:trigger"]: "required",
                          }));
                        }}
                        style={{ marginTop: 4, width: "100%" }}
                      >
                        {(adapters.find((item) => item.key === definition.trigger.adapter)
                          ?.supportedTriggers || [definition.trigger.trigger]
                        ).map((triggerKey) => (
                          <option key={triggerKey} value={triggerKey}>
                            {triggerKey}
                          </option>
                        ))}
                      </select>
                    </label>

                    {showAdvancedBuilder || selectedInspectorStage === "save" ? (
                      <details>
                        <summary>Trigger and context JSON (advanced)</summary>
                        <div className="form-grid" style={{ marginTop: 8 }}>
                          <label>
                            Trigger config
                            <textarea
                              rows={4}
                              value={triggerConfigDraft}
                              onChange={(event) => setTriggerConfigDraft(event.target.value)}
                              onBlur={() => {
                                const parsed = parseJsonObject(triggerConfigDraft);
                                if (!parsed) {
                                  setServerError("Trigger config must be valid JSON object.");
                                  return;
                                }
                                updateDefinition({
                                  ...definition,
                                  trigger: {
                                    ...definition.trigger,
                                    config: parsed,
                                  },
                                });
                                pushBuilderActivity("edit", "Updated trigger config.");
                              }}
                            />
                          </label>

                          <label>
                            Workflow context
                            <textarea
                              rows={4}
                              value={contextDraft}
                              onChange={(event) => setContextDraft(event.target.value)}
                              onBlur={() => {
                                const parsed = parseJsonObject(contextDraft);
                                if (!parsed) {
                                  setServerError("Context must be valid JSON object.");
                                  return;
                                }
                                updateDefinition({
                                  ...definition,
                                  context: parsed,
                                });
                                pushBuilderActivity("edit", "Updated workflow context.");
                              }}
                            />
                          </label>
                        </div>
                      </details>
                    ) : (
                      <p>
                        Advanced trigger JSON is available in the Save stage or when advanced mode
                        is enabled.
                      </p>
                    )}
                  </div>
                ) : null}

                {selectedCanvasNode?.dataRef.type === "step" && selectedStep ? (
                  <StepCardEditor
                    step={selectedStep}
                    depth={0}
                    adapters={adapters}
                    agentTools={agentTools}
                    referenceHints={referenceHints}
                    createStep={createStep}
                    showAdvancedSections={showAdvancedBuilder || selectedInspectorStage === "save"}
                    onDuplicateAs={(nextType) => duplicateStepAtIndex(selectedStepIndex, nextType)}
                    onMoveUp={
                      selectedStepIndex > 0
                        ? () => {
                            const reordered = reorderWorkflowSteps(
                              definition.steps,
                              selectedStepIndex,
                              selectedStepIndex - 1,
                            );
                            updateDefinition({
                              ...definition,
                              steps: reordered,
                            });
                            setSelectedNodeId(`node:step:${selectedStep.id}`);
                            pushBuilderActivity("reorder", `Moved ${selectedStep.id} up.`);
                          }
                        : undefined
                    }
                    onMoveDown={
                      selectedStepIndex < definition.steps.length - 1
                        ? () => {
                            const reordered = reorderWorkflowSteps(
                              definition.steps,
                              selectedStepIndex,
                              selectedStepIndex + 1,
                            );
                            updateDefinition({
                              ...definition,
                              steps: reordered,
                            });
                            setSelectedNodeId(`node:step:${selectedStep.id}`);
                            pushBuilderActivity("reorder", `Moved ${selectedStep.id} down.`);
                          }
                        : undefined
                    }
                    onDelete={() => removeStepAtIndex(selectedStepIndex)}
                    onChange={(updatedStep) => {
                      updateStepAtIndex(selectedStepIndex, updatedStep);
                      setInspectorStageByNode((current) => ({
                        ...current,
                        [selectedCanvasNode.id]: "required",
                      }));
                    }}
                  />
                ) : null}

                {selectedCanvasNode?.dataRef.type === "result" ? (
                  <div className="stack-sm">
                    <Callout tone="info" title="Result node">
                      <p>
                        Result node reflects run completion, retries, dead-letter outcomes, and
                        execution logs.
                      </p>
                    </Callout>
                    <div className="inline-actions">
                      <Link to="/activity?view=runs">Open activity</Link>
                      {isOperator ? <Link to="/alerts">Check alerts</Link> : null}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </SurfaceCard>
        ) : (
          <SurfaceCard title="Advanced JSON mode" subtitle="Use raw DSL only when guided mode is not enough.">
            <textarea
              rows={30}
              value={jsonDraft}
              onChange={(event) => {
                setJsonDraft(event.target.value);
                setJsonError(null);
                setServerError(null);
              }}
            />
            {jsonError ? <Callout tone="danger" title="Invalid JSON"><p>{jsonError}</p></Callout> : null}
          </SurfaceCard>
        )}

        <div className="inline-actions">
          <button
            type="button"
            onClick={async () => {
              try {
                if (editorMode === "json") {
                  const parsed = JSON.parse(jsonDraft) as WorkflowDefinition;
                  setDefinition(parsed);
                  setJsonError(null);
                  await validateCurrentDefinition(parsed);
                } else {
                  await validateCurrentDefinition();
                }
              } catch {
                setJsonError("JSON is invalid. Fix JSON before validation.");
              }
            }}
          >
            Validate automation
          </button>

          <button type="submit" className="button-primary">
            Create automation
          </button>
        </div>
      </form>

      {infoMessage ? <Callout tone="success" title="Saved"><p>{infoMessage}</p></Callout> : null}
      {serverError ? <Callout tone="danger" title="Failed"><p>{serverError}</p></Callout> : null}
      <ValidationErrorPanel errors={validationErrors} />

      <SurfaceCard title="Existing automations" subtitle="Recent saved automations in this workspace.">
        {loading ? <LoadingInline label="Loading automations..." /> : null}
        {!loading && workflows.length === 0 ? (
          <div className="empty-state">
            <p>
              No automations yet. Start with a template and create your first test-ready flow.
            </p>
            <div className="inline-actions">
              <Link to="/first-automation">Start wizard</Link>
              <Link to="/integrations">Connect apps</Link>
            </div>
          </div>
        ) : null}
        <ul>
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              {workflow.name} ({workflow.status}) - updated {workflow.updated_at}
            </li>
          ))}
        </ul>
      </SurfaceCard>
    </div>
  );
}














