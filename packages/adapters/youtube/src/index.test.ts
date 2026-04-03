import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeAdapter } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("YouTubeAdapter", () => {
  it("declares creator trigger and metadata actions", async () => {
    const adapter = new YouTubeAdapter();
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();

    expect(triggers.map((trigger) => trigger.key)).toEqual(["new_video"]);
    expect(actions.map((action) => action.key)).toEqual([
      "listChannelVideos",
      "getVideoMetadata",
    ]);
  });

  it("maps incoming trigger payload to events", async () => {
    const adapter = new YouTubeAdapter();
    const result = await adapter.runTrigger(
      "new_video",
      {
        items: [
          {
            id: {
              videoId: "abc123",
            },
            snippet: {
              title: "Latest release",
              description: "Creator automation update",
              channelId: "channel-1",
              channelTitle: "Integrator Channel",
              publishedAt: "2026-04-01T00:00:00.000Z",
            },
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
      source: "youtube",
      id: "abc123",
      title: "Latest release",
    });
  });

  it("fetches video metadata action", async () => {
    const adapter = new YouTubeAdapter();
    await adapter.init({
      apiKey: "youtube-key",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              snippet: {
                title: "Video title",
                description: "Description",
                channelId: "channel-1",
                channelTitle: "Integrator Channel",
                publishedAt: "2026-04-01T00:00:00.000Z",
              },
              statistics: {
                viewCount: "1200",
              },
              contentDetails: {
                duration: "PT5M",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const result = await adapter.runAction(
      "getVideoMetadata",
      {
        videoId: "abc123",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.id).toBe("abc123");
    expect(result.output?.title).toBe("Video title");
  });
});
