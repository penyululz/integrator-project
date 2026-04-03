import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterCredentialValidationResult,
  AdapterCredentials,
  AdapterContext,
  AdapterError,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type YouTubeConfig = {
  apiKey: string;
  defaultChannelId: string;
  baseUrl: string;
};

type YoutubeVideo = {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  url: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compact(value: unknown): string {
  return asString(value).trim();
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function toVideoSummary(item: Record<string, unknown>): YoutubeVideo {
  const snippet = asRecord(item.snippet);
  const idRecord = asRecord(item.id);
  const resourceId = asRecord(snippet.resourceId);
  const videoId =
    compact(item.id) ||
    compact(idRecord.videoId) ||
    compact(resourceId.videoId);
  const channelId = compact(snippet.channelId);

  return {
    id: videoId,
    title: compact(snippet.title) || "Untitled video",
    description: compact(snippet.description),
    channelId,
    channelTitle: compact(snippet.channelTitle),
    publishedAt: compact(snippet.publishedAt),
    thumbnailUrl:
      compact(asRecord(asRecord(snippet.thumbnails).high).url) ||
      compact(asRecord(asRecord(snippet.thumbnails).default).url) ||
      null,
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
  };
}

export class YouTubeAdapter implements Adapter {
  readonly key = "youtube";
  readonly version = "1.0.0";

  private config: YouTubeConfig = {
    apiKey: "",
    defaultChannelId: "",
    baseUrl: "https://www.googleapis.com/youtube/v3",
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      apiKey: asString(config.apiKey),
      defaultChannelId: asString(config.defaultChannelId),
      baseUrl: asString(config.baseUrl) || "https://www.googleapis.com/youtube/v3",
    };
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "api_key",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      {
        key: "new_video",
        name: "New Video",
        description: "Monitor channel feed and emit newly published video events.",
        inputSchema: {
          type: "object",
          properties: {
            channelId: { type: "string" },
            items: { type: "array" },
            videoId: { type: "string" },
          },
        },
      },
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "listChannelVideos",
        name: "List Channel Videos",
        description: "Fetch latest videos for a YouTube channel.",
        inputSchema: {
          type: "object",
          properties: {
            channelId: { type: "string" },
            maxResults: { type: "number" },
          },
        },
      },
      {
        key: "getVideoMetadata",
        name: "Get Video Metadata",
        description: "Fetch title, description, and statistics for a video.",
        inputSchema: {
          type: "object",
          required: ["videoId"],
          properties: {
            videoId: { type: "string" },
          },
        },
      },
    ];
  }

  private resolveApiKey(
    input: Record<string, unknown>,
    context: AdapterContext,
  ): string {
    return (
      compact(input.apiKey) ||
      compact(context.credentials?.apiKey) ||
      compact(context.credentials?.accessToken) ||
      compact(this.config.apiKey)
    );
  }

  private resolveChannelId(
    input: Record<string, unknown>,
    context: AdapterContext,
  ): string {
    const metadata = asRecord(context.credentials?.metadata);
    return (
      compact(input.channelId) ||
      compact(metadata.defaultChannelId) ||
      compact(metadata.channelId) ||
      compact(this.config.defaultChannelId)
    );
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "new_video") {
      throw new AdapterError(`Unsupported trigger "${triggerKey}".`, {
        code: "UNSUPPORTED_TRIGGER",
        retryable: false,
      });
    }

    if (Array.isArray(input.items) && input.items.length > 0) {
      const events = input.items
        .map((item) => (typeof item === "object" && item ? toVideoSummary(item as Record<string, unknown>) : null))
        .filter((item): item is YoutubeVideo => Boolean(item && item.id))
        .map((item) => ({
          source: "youtube",
          ...item,
        }));

      return {
        events,
      };
    }

    const channelId = this.resolveChannelId(input, context);
    const videoId = compact(input.videoId);
    if (videoId) {
      return {
        events: [
          {
            source: "youtube",
            id: videoId,
            channelId,
            title: compact(input.title) || "New YouTube video",
            description: compact(input.description),
            publishedAt: compact(input.publishedAt),
            url: `https://www.youtube.com/watch?v=${videoId}`,
          },
        ],
      };
    }

    if (channelId) {
      const listed = await this.runAction(
        "listChannelVideos",
        {
          channelId,
          maxResults: toPositiveInt(input.maxResults, 5),
        },
        context,
      );
      return {
        events: Array.isArray(listed.output?.videos)
          ? listed.output!.videos
          : [],
      };
    }

    return {
      events: [],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    const apiKey = this.resolveApiKey(input, context);
    if (!apiKey) {
      throw new AdapterError("YouTube API key is required.", {
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
    }

    if (actionKey === "listChannelVideos") {
      const channelId = this.resolveChannelId(input, context);
      if (!channelId) {
        throw new AdapterError("listChannelVideos requires channelId.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }
      const maxResults = toPositiveInt(input.maxResults, 5);
      const url =
        `${this.config.baseUrl}/search?part=snippet&type=video&order=date` +
        `&channelId=${encodeURIComponent(channelId)}` +
        `&maxResults=${maxResults}` +
        `&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url);
      const body = (await response.json()) as {
        items?: Array<Record<string, unknown>>;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new AdapterError(body.error?.message || `YouTube API failed (${response.status}).`, {
          code: `HTTP_${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        });
      }

      const videos = (body.items || [])
        .map((item) => toVideoSummary(item))
        .filter((video) => Boolean(video.id))
        .map((video) => ({
          source: "youtube",
          ...video,
        }));

      return {
        success: true,
        output: {
          channelId,
          count: videos.length,
          videos,
        },
      };
    }

    if (actionKey === "getVideoMetadata") {
      const videoId = compact(input.videoId);
      if (!videoId) {
        throw new AdapterError("getVideoMetadata requires videoId.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }

      const url =
        `${this.config.baseUrl}/videos?part=snippet,statistics,contentDetails` +
        `&id=${encodeURIComponent(videoId)}` +
        `&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url);
      const body = (await response.json()) as {
        items?: Array<Record<string, unknown>>;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new AdapterError(body.error?.message || `YouTube API failed (${response.status}).`, {
          code: `HTTP_${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        });
      }

      const item = (body.items || [])[0];
      if (!item) {
        throw new AdapterError(`Video "${videoId}" was not found.`, {
          code: "NOT_FOUND",
          retryable: false,
        });
      }

      const snippet = asRecord(item.snippet);
      const statistics = asRecord(item.statistics);
      const contentDetails = asRecord(item.contentDetails);
      return {
        success: true,
        output: {
          id: videoId,
          title: compact(snippet.title),
          description: compact(snippet.description),
          channelId: compact(snippet.channelId),
          channelTitle: compact(snippet.channelTitle),
          publishedAt: compact(snippet.publishedAt),
          durationIso8601: compact(contentDetails.duration),
          viewCount: compact(statistics.viewCount),
          likeCount: compact(statistics.likeCount),
          commentCount: compact(statistics.commentCount),
          url: `https://www.youtube.com/watch?v=${videoId}`,
        },
      };
    }

    throw new AdapterError(`Unsupported action "${actionKey}".`, {
      code: "UNSUPPORTED_ACTION",
      retryable: false,
    });
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (config.baseUrl !== undefined && !asString(config.baseUrl).startsWith("http")) {
      errors.push("baseUrl must be an absolute URL.");
    }
    if (config.defaultChannelId !== undefined && !compact(config.defaultChannelId)) {
      errors.push("defaultChannelId must be non-empty when provided.");
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("YouTube API key auth does not support token refresh.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    const apiKey = compact(credentials.apiKey || credentials.accessToken || "");
    if (!apiKey) {
      return {
        status: "invalid",
        reason: "Missing YouTube API key.",
      };
    }
    if (credentials.expiresAt) {
      const expiresAt = Date.parse(credentials.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return {
          status: "expired",
          reason: "YouTube API credential is expired.",
        };
      }
    }
    return {
      status: "valid",
    };
  }
}
