import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createWorkflow,
  getAuthSession,
  getWorkflowTemplate,
  listAdapters,
  listCredentials,
  listIntegrations,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  type AdapterMetadata,
  type CredentialRecord,
  type WorkflowRecord,
  type WorkflowTemplate,
  type WorkflowTemplateSummary,
  validateWorkflow,
} from "../api";
import { StepCardEditor } from "../components/StepCardEditor";
import { Callout, DemoHint, LoadingInline, PageHeader, StatusPill, SurfaceCard } from "../components/ui-kit";
import { ValidationErrorPanel } from "../components/ValidationErrorPanel";
import {
  buildDefaultWorkflow,
  buildReferenceHints,
  buildWorkflowFromTemplate,
  filterWorkflowTemplates,
  getTemplateMissingAdapters,
  parseJsonObject,
} from "./workflow-builder-helpers";
import { buildOnboardingSteps, getNextPendingStep } from "./onboarding-helpers";
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
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [integrationsCount, setIntegrationsCount] = useState(0);
  const [runsCount, setRunsCount] = useState(0);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [templateCache, setTemplateCache] = useState<Record<string, WorkflowTemplate>>({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("all");
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

  async function load() {
    setLoading(true);
    try {
      const [
        { adapters: adapterMetadata },
        workflowRecords,
        templateRecords,
        credentialRecords,
        integrationRecords,
        runRecords,
      ] = await Promise.all([
        listAdapters(),
        listWorkflows(),
        listWorkflowTemplates(),
        listCredentials(),
        listIntegrations(),
        listRuns(),
      ]);

      setAdapters(adapterMetadata);
      setWorkflows(workflowRecords);
      setTemplates(templateRecords);
      setCredentials(credentialRecords);
      setIntegrationsCount(integrationRecords.length);
      setRunsCount(runRecords.length);

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

  const referenceHints = useMemo(() => buildReferenceHints(definition), [definition]);

  const templateCategories = useMemo(() => {
    return ["all", ...new Set(templates.map((template) => template.category))];
  }, [templates]);

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

  function updateDefinition(nextDefinition: WorkflowDefinition) {
    setDefinition(nextDefinition);
    setValidationErrors([]);
    setServerError(null);
    setInfoMessage(null);
  }

  function createStep(type: "action" | "branch" | "delay"): WorkflowStep {
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

    const adapterWithActions = adapters.find((adapter) => adapter.supportedActions.length > 0);
    const nextStep = createEmptyActionStep(
      nextId,
      adapterWithActions?.key || adapters[0]?.key || "webhook",
    );
    nextStep.action = adapterWithActions?.supportedActions[0] || "";
    return nextStep;
  }

  async function validateCurrentDefinition(candidate?: WorkflowDefinition): Promise<boolean> {
    const subject = candidate || definition;
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
        subtitle="Choose a template, adjust guided steps, and create your automation in minutes."
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

      <SurfaceCard title="Template gallery" subtitle="Choose by outcome, not by technical internals.">
        <div className="inline-actions">
          <label>
            Search
            <input
              value={templateSearch}
              onChange={(event) => setTemplateSearch(event.target.value)}
              placeholder="Find by use case, app, or outcome"
              style={{ marginLeft: 8, minWidth: 240 }}
            />
          </label>
          <label>
            Category
            <select
              value={templateCategory}
              onChange={(event) => setTemplateCategory(event.target.value)}
              style={{ marginLeft: 8 }}
            >
              {templateCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="empty-state">
            <p>No templates matched your filters.</p>
            <p>Clear filters or open onboarding for starter recommendations.</p>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => {
                  setTemplateSearch("");
                  setTemplateCategory("all");
                }}
              >
                Clear filters
              </button>
              <Link to="/onboarding">Open onboarding</Link>
            </div>
          </div>
        ) : null}

        <div className="template-grid">
          {filteredTemplates.map((template) => {
            const missingAdapters = getTemplateMissingAdapters(template, enabledAdapterKeys);
            const adaptersNeedingConnection = template.requiredAdapters.filter((adapterKey) => {
              if (missingAdapters.includes(adapterKey)) {
                return false;
              }
              const adapter = adapters.find((item) => item.key === adapterKey);
              if (!adapter || adapter.authType === "none") {
                return false;
              }
              return !validCredentialProviders.has(adapterKey);
            });

            const isBlocked = missingAdapters.length > 0 || adaptersNeedingConnection.length > 0;

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

      <form onSubmit={onCreate} className="stack">
        <SurfaceCard
          title="Builder mode"
          subtitle="Guided mode is best for most users. JSON mode is available for advanced edits."
          highlight
        >
          <div className="inline-actions">
            <label>
              Automation name
              <input value={name} onChange={(event) => setName(event.target.value)} style={{ marginLeft: 8 }} />
            </label>

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
              className={editorMode === "form" ? "button-primary" : ""}
              onClick={() => {
                setEditorMode("form");
                setJsonError(null);
              }}
            >
              Guided mode
            </button>
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
        </SurfaceCard>

        {editorMode === "form" ? (
          <SurfaceCard title="Guided builder" subtitle="Edit trigger, context, and step cards without touching raw JSON.">
            <div className="editor-canvas">
              <div className="card-muted" style={{ borderRadius: 12, padding: 10 }}>
                <h4>Trigger</h4>
                <div className="inline-actions">
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
                      style={{ marginLeft: 8 }}
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
                      style={{ marginLeft: 8 }}
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
                </div>

                <div className="form-grid two" style={{ marginTop: 8 }}>
                  <label>
                    Trigger config (JSON object)
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
                    Workflow context (JSON object)
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
              </div>

              <div className="stack">
                <h4>Steps</h4>
                <p>
                  Each step card supports mapping, conditions, branching, and delay. Use add buttons
                  to grow your automation flow.
                </p>
                {definition.steps.map((step, index) => (
                  <StepCardEditor
                    key={`${step.id}-${index}`}
                    step={step}
                    depth={0}
                    adapters={adapters}
                    referenceHints={referenceHints}
                    createStep={createStep}
                    onDelete={() => {
                      updateDefinition({
                        ...definition,
                        steps: definition.steps.filter((_, i) => i !== index),
                      });
                    }}
                    onChange={(updatedStep) => {
                      const nextSteps = [...definition.steps];
                      nextSteps[index] = updatedStep;
                      updateDefinition({
                        ...definition,
                        steps: nextSteps,
                      });
                    }}
                  />
                ))}

                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => {
                      updateDefinition({
                        ...definition,
                        steps: [...definition.steps, createStep("action")],
                      });
                    }}
                  >
                    Add action step
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateDefinition({
                        ...definition,
                        steps: [...definition.steps, createStep("branch")],
                      });
                    }}
                  >
                    Add branch step
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateDefinition({
                        ...definition,
                        steps: [...definition.steps, createStep("delay")],
                      });
                    }}
                  >
                    Add delay step
                  </button>
                </div>
              </div>
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
