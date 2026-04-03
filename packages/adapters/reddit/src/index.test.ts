import { afterEach, describe, expect, it, vi } from "vitest";
import { RedditAdapter } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RedditAdapter", () => {
  it("declares monitor and summarize capabilities", async () => {
    const adapter = new RedditAdapter();
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();

    expect(triggers.map((item) => item.key)).toEqual(["monitor_posts"]);
    expect(actions.map((item) => item.key)).toEqual([
      "fetchSubredditPosts",
      "summarizePosts",
    ]);
  });

  it("maps trigger payload post list into events", async () => {
    const adapter = new RedditAdapter();
    const result = await adapter.runTrigger(
      "monitor_posts",
      {
        posts: [
          {
            id: "p1",
            subreddit: "automation",
            title: "Workflow release",
          },
        ],
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      source: "reddit",
      id: "p1",
    });
  });

  it("fetches and summarizes subreddit posts", async () => {
    const adapter = new RedditAdapter();
    await adapter.init({});

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          data: {
            children: [
              {
                data: {
                  id: "p1",
                  subreddit: "automation",
                  title: "First post",
                  author: "author1",
                  score: 14,
                  num_comments: 3,
                  permalink: "/r/automation/comments/p1/first_post/",
                  selftext: "This is the first post body.",
                  created_utc: 1700000000,
                },
              },
              {
                data: {
                  id: "p2",
                  subreddit: "automation",
                  title: "Second post",
                  author: "author2",
                  score: 9,
                  num_comments: 2,
                  permalink: "/r/automation/comments/p2/second_post/",
                  selftext: "Another update from the subreddit.",
                  created_utc: 1700000010,
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const fetched = await adapter.runAction(
      "fetchSubredditPosts",
      {
        subreddit: "automation",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );
    expect(fetched.success).toBe(true);
    expect(fetched.output?.count).toBe(2);

    const summarized = await adapter.runAction(
      "summarizePosts",
      {
        subreddit: "automation",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(summarized.success).toBe(true);
    expect(String(summarized.output?.summary || "").length).toBeGreaterThan(6);
  });
});
