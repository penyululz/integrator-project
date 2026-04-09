import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiRuntimeMode } from "../api";
import {
  Callout,
  EmptyStatePanel,
  InsightChip,
  PageHeader,
  ProductToolbar,
  StatusPill,
} from "../components/ui-kit";
import {
  filterCommunicationMessages,
  filterCommunicationThreads,
  getWorkspaceCommunicationMessages,
  getWorkspaceCommunicationThreads,
  type CommunicationMessage,
} from "./workspace-collaboration-helpers";

function toPresenceTone(status: "online" | "away" | "offline"): "success" | "warning" | "danger" {
  if (status === "online") {
    return "success";
  }
  if (status === "away") {
    return "warning";
  }
  return "danger";
}

export function CommunicationPage() {
  const mode = getApiRuntimeMode();
  const threads = useMemo(
    () =>
      getWorkspaceCommunicationThreads({
        mode,
      }),
    [mode],
  );
  const [messagesByThread, setMessagesByThread] = useState<
    Record<string, CommunicationMessage[]>
  >(() =>
    getWorkspaceCommunicationMessages({
      mode,
    }),
  );
  const [threadQuery, setThreadQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || "");
  const [composerDraft, setComposerDraft] = useState("");

  useEffect(() => {
    setMessagesByThread(
      getWorkspaceCommunicationMessages({
        mode,
      }),
    );
  }, [mode]);

  useEffect(() => {
    if (!threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0]?.id || "");
    }
  }, [threads, selectedThreadId]);

  const filteredThreads = useMemo(
    () => filterCommunicationThreads(threads, threadQuery),
    [threads, threadQuery],
  );
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId],
  );
  const selectedThreadMessages = useMemo(
    () => messagesByThread[selectedThreadId] || [],
    [messagesByThread, selectedThreadId],
  );
  const filteredMessages = useMemo(
    () => filterCommunicationMessages(selectedThreadMessages, messageQuery),
    [selectedThreadMessages, messageQuery],
  );
  const unreadTotal = useMemo(
    () => threads.reduce((total, thread) => total + thread.unreadCount, 0),
    [threads],
  );

  function onSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBody = composerDraft.trim();
    if (!selectedThreadId || !nextBody) {
      return;
    }

    const now = new Date();
    const nextMessage: CommunicationMessage = {
      id: `msg_local_${now.getTime()}`,
      threadId: selectedThreadId,
      author: "You",
      own: true,
      body: nextBody,
      createdAtLabel: now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessagesByThread((current) => ({
      ...current,
      [selectedThreadId]: [...(current[selectedThreadId] || []), nextMessage],
    }));
    setComposerDraft("");
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Communication"
        title="Workspace Communication"
        subtitle="Team messaging surface adapted into the canonical product shell for launch coordination and run visibility handoffs."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Threads" value={threads.length} />
            <InsightChip label="Unread" value={unreadTotal} />
          </>
        }
        right={
          <>
            <Link to="/runs">Runs</Link>
            <Link to="/alerts">Alerts</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/files">Files</Link>
          </>
        }
      />

      <Callout tone={mode === "Prototype Mode" ? "info" : "warning"} title="Collaboration surface">
        <p>
          {mode === "Prototype Mode"
            ? "PROTOTYPE MODE ONLY: seeded conversation threads keep first-success and operations handoff flows explorable."
            : "LIVE MODE ONLY: this page is UI-ready and route-stable, but deep realtime chat transport is still a later-phase runtime expansion."}
        </p>
      </Callout>

      <div className="operations-console-grid">
        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Threads</h3>
              <p className="operations-pane-subtitle">
                Filter channels, teams, and direct threads.
              </p>
            </div>
          </header>
          <div className="operations-pane-meta">
            <label className="operations-filter-search">
              Search
              <input
                type="search"
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="Search title, type, or preview"
              />
            </label>
          </div>
          <div className="operations-pane-body">
            {filteredThreads.length === 0 ? (
              <EmptyStatePanel
                title="No threads match this search"
                description="Adjust search terms or clear filters to restore seeded workspace threads."
              />
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`operations-list-button ${
                    selectedThreadId === thread.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <div className="operations-list-button-head">
                    <strong className="operations-list-button-title">{thread.title}</strong>
                    <StatusPill tone={toPresenceTone(thread.status)}>{thread.status}</StatusPill>
                  </div>
                  <p className="operations-list-button-subtitle">{thread.preview}</p>
                  <div className="operations-list-button-meta">
                    <span className="tag">{thread.kind}</span>
                    <span className="tag">{thread.participants} participants</span>
                    {thread.unreadCount > 0 ? (
                      <StatusPill tone="info">{thread.unreadCount} unread</StatusPill>
                    ) : null}
                    <span className="tag">{thread.updatedAtLabel}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">
                {selectedThread ? selectedThread.title : "Thread detail"}
              </h3>
              <p className="operations-pane-subtitle">
                Search messages, add notes, and keep run-to-alert context linked.
              </p>
            </div>
          </header>
          <div className="operations-pane-meta">
            <label className="operations-filter-search">
              Search messages
              <input
                type="search"
                value={messageQuery}
                onChange={(event) => setMessageQuery(event.target.value)}
                placeholder="Search message body or author"
              />
            </label>
          </div>
          <div className="operations-pane-body">
            {!selectedThread ? (
              <EmptyStatePanel
                title="Select a thread"
                description="Choose a thread from the left pane to review messages and add follow-up notes."
              />
            ) : (
              <>
                {filteredMessages.length === 0 ? (
                  <EmptyStatePanel
                    title="No messages match this filter"
                    description="Clear message search to see the full thread timeline."
                  />
                ) : (
                  <div className="activity-list">
                    {filteredMessages.map((message) => (
                      <article key={message.id} className="activity-item">
                        <div className="inline-actions actions-between">
                          <strong>{message.author}</strong>
                          <span className="tag">{message.createdAtLabel}</span>
                        </div>
                        <p>{message.body}</p>
                        {message.own ? <StatusPill tone="info">sent by you</StatusPill> : null}
                      </article>
                    ))}
                  </div>
                )}

                <form className="stack-sm section-divider" onSubmit={onSendMessage}>
                  <label>
                    Message draft
                    <textarea
                      rows={3}
                      value={composerDraft}
                      onChange={(event) => setComposerDraft(event.target.value)}
                      placeholder="Write a follow-up note or operation handoff message..."
                    />
                  </label>
                  <div className="inline-actions">
                    <button type="submit" className="button-primary" disabled={!composerDraft.trim()}>
                      Send message
                    </button>
                    <Link to="/runs">Open related runs</Link>
                  </div>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
