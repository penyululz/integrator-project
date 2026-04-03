import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  PrimaryCTA,
  LoadingInline,
  PageHeader,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import { ValidationErrorPanel } from "../components/ValidationErrorPanel";
import {
  buildDefaultWorkflow,
  buildReferenceHints,
  buildWorkflowFromTemplate,
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
  zoomBuilderViewport,
  type BuilderCanvasEdge,
  type BuilderEdgeDraft,
  type BuilderNodePositionMap,
} from "./builder-evolution-helpers";
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

export function WorkflowsPage() {
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("templateId");
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
  const [showAdvancedBuilder, setShowAdvancedBuilder] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [triggerConfigDraft, setTriggerConfigDraft] = useState("{}");
  const [contextDraft, setContextDraft] = useState("{}");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node:trigger");
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [quickInsertNodeId, setQuickInsertNodeId] = useState<string | null>(null);
  const [quickInsertQuery, setQuickInsertQuery] = useState("");
  const [quickInsertIndex, setQuickInsertIndex] = useState<number | null>(null);
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
    void load();
  }, []);

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

  function updateDefinition(nextDefinition: WorkflowDefinition) {
    setDefinition(nextDefinition);
    setValidationErrors([]);
    setServerError(null);
    setInfoMessage(null);
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
  }

  function updateStepAtIndex(index: number, step: WorkflowStep) {
    const nextSteps = [...definition.steps];
    nextSteps[index] = step;
    updateDefinition({
      ...definition,
      steps: nextSteps,
    });
  }

  function removeStepAtIndex(index: number) {
    const nextSteps = definition.steps.filter((_, currentIndex) => currentIndex !== index);
    updateDefinition({
      ...definition,
      steps: nextSteps,
    });
    const nextSelected = nextSteps[index] || nextSteps[index - 1];
    setSelectedNodeId(nextSelected ? `node:step:${nextSelected.id}` : "node:trigger");
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

  function onInsertNodeOnSelectedEdge() {
    if (!selectedEdge) {
      return;
    }
    const targetNode = canvasModel.nodes.find((node) => node.id === selectedEdge.to);
    const targetIndex =
      targetNode?.dataRef.type === "step" ? targetNode.dataRef.stepIndex : undefined;
    addStepAtIndex(createStep("action"), targetIndex);
    setInfoMessage("Inserted a step on selected edge.");
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
  const quickInsertItems = useMemo(() => {
    const normalizedQuery = quickInsertQuery.trim().toLowerCase();
    const flattened = builderPalette.flatMap((section) => section.items);
    return flattened.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${item.label} ${item.description} ${item.adapterKey || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [builderPalette, quickInsertQuery]);
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
            x: nextX,
            y: nextY,
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
        "Automation created successfully. Next: send a test run from the first automation wizard or Runs page.",
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
        eyebrow="Automations"
        title="Automation Builder"
        subtitle="Pick a starter automation, make small edits, and run your first result quickly."
        actions={
          <>
            {nextStep ? <StatusPill tone="warning">Next: {nextStep.title}</StatusPill> : <StatusPill tone="success">Onboarding complete</StatusPill>}
            <Link to="/first-automation">First automation wizard</Link>
            <Link to="/runs">Runs</Link>
            {isOperator ? <Link to="/audit-logs">Audit</Link> : null}
          </>
        }
      />

      <DemoHint>
        Fastest path: pick a template, click <strong>Use template</strong>, then create the automation and
        run a simulator test from <Link to="/runs">Runs</Link>.
      </DemoHint>

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
              <Link to="/first-automation">Open first automation wizard</Link>
            </div>
          </article>
          <article className="template-card">
            <div className="template-title">Advanced path</div>
            <p>Build from structured step forms and optional JSON controls.</p>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => setShowAdvancedBuilder((current) => !current)}
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
            <button type="button" onClick={() => setShowAdvancedBuilder((current) => !current)}>
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

        {editorMode === "form" ? (
                    <SurfaceCard
            title="Visual builder canvas (phase 4)"
            subtitle="Free-form nodes, zoom/pan, minimap, rewiring, and inline execution signals."
          >
            <div className="builder-workspace-grid phase4">
              <section className="builder-canvas-surface">
                <div className="inline-actions">
                  <span className="tag">Nodes: {mergedCanvasModel.nodes.length}</span>
                  <span className="tag">Edges: {canvasEdges.length}</span>
                  <span className="tag">Zoom: {(canvasViewport.zoom * 100).toFixed(0)}%</span>
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
                      onClick={() => setCanvasViewport(createBuilderViewport())}
                    >
                      Reset view
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
                        setCanvasEdges((current) => removeBuilderEdge(current, selectedEdgeId));
                        setSelectedEdgeId(null);
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
                  </div>

                  <div
                    ref={canvasViewportRef}
                    className="builder-free-canvas-viewport"
                    onWheel={onCanvasWheel}
                    onMouseDown={onCanvasMouseDown}
                  >
                    <div
                      className="builder-free-canvas-stage"
                      style={{
                        width: canvasBounds.width,
                        height: canvasBounds.height,
                        transform: `translate(${canvasViewport.panX}px, ${canvasViewport.panY}px) scale(${canvasViewport.zoom})`,
                        transformOrigin: "0 0",
                      }}
                    >
                      <svg
                        className="builder-edge-map-svg free"
                        viewBox={`${canvasBounds.minX} ${canvasBounds.minY} ${canvasBounds.width} ${canvasBounds.height}`}
                        role="img"
                        aria-label="Workflow flow graph"
                      >
                        <defs>
                          <marker
                            id="builder-edge-arrow"
                            markerWidth="10"
                            markerHeight="8"
                            refX="8"
                            refY="4"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 0 L 10 4 L 0 8 z" fill="#7c90a8" />
                          </marker>
                        </defs>
                        {renderableEdges.map((edge) => (
                          <g key={edge.id}>
                            <path
                              d={edge.path}
                              className={`builder-edge-path kind-${edge.kind} ${
                                edge.id === selectedEdgeId ? "active" : ""
                              } ${edge.id === "edge:draft" ? "draft" : ""}`}
                              markerEnd={edge.id === "edge:draft" ? undefined : "url(#builder-edge-arrow)"}
                              onClick={() => edge.id !== "edge:draft" && setSelectedEdgeId(edge.id)}
                            />
                            {edge.label ? (
                              <text
                                className={`builder-edge-label kind-${edge.kind}`}
                                x={edge.labelPosition?.x}
                                y={edge.labelPosition?.y}
                              >
                                {edge.label}
                              </text>
                            ) : null}
                          </g>
                        ))}
                      </svg>

                      {mergedCanvasModel.nodes.map((node) => {
                        const position = getNodePosition(node.id);
                        const runtime = nodeRuntimeMap[node.id] || { status: "idle" as const };
                        const isSelected = selectedNodeId === node.id;
                        const isStepNode = node.dataRef.type === "step";
                        const stepIndex =
                          node.dataRef.type === "step" ? node.dataRef.stepIndex : -1;
                        return (
                          <article
                            key={node.id}
                            className={`builder-node-card free kind-${node.kind} ${isSelected ? "selected" : ""}`}
                            style={{
                              left: position.x,
                              top: position.y,
                              width: node.presentation.width,
                              minHeight: node.presentation.height,
                            }}
                            onMouseDown={(event) => onNodeDragStart(event, node.id)}
                            onClick={() => setSelectedNodeId(node.id)}
                          >
                            <button
                              type="button"
                              className="builder-handle in"
                              onMouseUp={(event) =>
                                onCompleteEdgeDraft(event, {
                                  nodeId: node.id,
                                  handle: "in",
                                })
                              }
                              title="Connect edge here"
                            />

                            <button
                              type="button"
                              className="builder-handle out"
                              onMouseDown={(event) =>
                                onStartEdgeDraft(event, {
                                  nodeId: node.id,
                                  handle: "out",
                                })
                              }
                              title="Start connection"
                            />

                            {node.kind === "branch" ? (
                              <>
                                <button
                                  type="button"
                                  className="builder-handle out then"
                                  onMouseDown={(event) =>
                                    onStartEdgeDraft(event, {
                                      nodeId: node.id,
                                      handle: "then",
                                    })
                                  }
                                  title="Connect then branch"
                                />
                                <button
                                  type="button"
                                  className="builder-handle out else"
                                  onMouseDown={(event) =>
                                    onStartEdgeDraft(event, {
                                      nodeId: node.id,
                                      handle: "else",
                                    })
                                  }
                                  title="Connect else branch"
                                />
                              </>
                            ) : null}

                            <div className="builder-node-head">
                              <strong>{node.label}</strong>
                              <span className={`tag runtime ${runtime.status}`}>
                                {runtime.status}
                              </span>
                            </div>
                            <p>{node.summary}</p>
                            {node.kind === "branch" ? (
                              <div className="builder-branch-paths">
                                <span className="tag builder-branch-tag then">then</span>
                                <span className="tag builder-branch-tag else">else</span>
                              </div>
                            ) : null}
                            {runtime.preview ? <p className="builder-runtime-preview">{runtime.preview}</p> : null}
                            <div className="inline-actions">
                              <button type="button" onClick={() => setSelectedNodeId(node.id)}>
                                Inspect
                              </button>
                              {isStepNode ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openQuickInsert({
                                      nodeId: node.id,
                                      afterIndex: stepIndex,
                                    })
                                  }
                                >
                                  + Add after
                                </button>
                              ) : null}
                              {isStepNode ? (
                                <button type="button" onClick={() => removeStepAtIndex(stepIndex)}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="builder-canvas-minimap">
                      <svg
                        viewBox={`0 0 ${minimapGeometry.mapWidth} ${minimapGeometry.mapHeight}`}
                        role="img"
                        aria-label="Canvas minimap"
                      >
                        <rect
                          x={0}
                          y={0}
                          width={minimapGeometry.mapWidth}
                          height={minimapGeometry.mapHeight}
                          className="builder-minimap-bg"
                        />
                        {mergedCanvasModel.nodes.map((node) => {
                          const pos = getNodePosition(node.id);
                          return (
                            <rect
                              key={`mini-${node.id}`}
                              x={(pos.x - canvasBounds.minX) * minimapGeometry.scale}
                              y={(pos.y - canvasBounds.minY) * minimapGeometry.scale}
                              width={Math.max(20, node.presentation.width * minimapGeometry.scale)}
                              height={Math.max(12, node.presentation.height * minimapGeometry.scale)}
                              className={`builder-minimap-node kind-${node.kind}`}
                            />
                          );
                        })}
                        <rect
                          x={minimapGeometry.viewportX}
                          y={minimapGeometry.viewportY}
                          width={Math.max(18, minimapGeometry.viewportWidth)}
                          height={Math.max(12, minimapGeometry.viewportHeight)}
                          className="builder-minimap-viewport"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {quickInsertNodeId ? (
                  <div className="builder-quick-insert-panel stack-sm">
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <strong>Quick insert step</strong>
                      <button type="button" onClick={() => setQuickInsertNodeId(null)}>
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
                  <span className="tag">Shift to pan using blank canvas drag</span>
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
                  <h4>Node inspector</h4>
                  <span className="tag">
                    {selectedCanvasNode ? `${selectedCanvasNode.kind} node` : "none selected"}
                  </span>
                </div>

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

                    <details>
                      <summary>Trigger and context JSON</summary>
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
                            }}
                          />
                        </label>
                      </div>
                    </details>
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
                          }
                        : undefined
                    }
                    onDelete={() => removeStepAtIndex(selectedStepIndex)}
                    onChange={(updatedStep) => updateStepAtIndex(selectedStepIndex, updatedStep)}
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
                      <Link to="/runs">Open run explorer</Link>
                      {isOperator ? <Link to="/alerts">Check alerts</Link> : null}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>

            <div className="section-divider stack">
              <h4>Step palette</h4>
              <p>Add from core, app connectors, and power connectors.</p>
              <div className="template-grid">
                {builderPalette.map((section) => (
                  <article key={section.id} className="template-card">
                    <div className="template-title">{section.title}</div>
                    <p>{section.description}</p>
                    <div className="stack-sm">
                      {section.items.length === 0 ? (
                        <span className="tag">No connectors available in this workspace.</span>
                      ) : (
                        section.items.map((item) => (
                          <div key={item.id} className="inline-actions">
                            <button
                              type="button"
                              onClick={() => {
                                const nextStep = createStep(item.stepType, {
                                  adapterKey: item.adapterKey,
                                  actionKey: item.actionKey,
                                });
                                addStepAtIndex(nextStep);
                              }}
                            >
                              Add {item.label}
                            </button>
                            <span className="tag">
                              {item.advanced ? "Advanced" : "Starter"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="inline-actions">
                <button type="button" onClick={() => addStepAtIndex(createStep("action"))}>
                  Add action step
                </button>
                <button type="button" onClick={() => addStepAtIndex(createStep("branch"))}>
                  Add branch step
                </button>
                <button type="button" onClick={() => addStepAtIndex(createStep("delay"))}>
                  Add delay step
                </button>
              </div>
              <PrimaryCTA onClick={() => addStepAtIndex(createStep("action"))}>
                Add next step
              </PrimaryCTA>
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









