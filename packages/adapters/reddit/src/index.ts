import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterCredentialValidationResult,
  AdapterContext,
  AdapterError,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
  summarizeText,
} from "@integration/shared";

type RedditConfig = {
  baseUrl: string;
  userAgent: string;
  defaultSubreddit: string;
};

type RedditPost = {
  id: string;
  subreddit: string;
  title: string;
  author: string;
  score: number;
  comments: number;
  permalink: string;
  url: string;
  createdUtc: number;
  selftext: string;
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

function toPost(item: Record<string, unknown>): RedditPost {
  const data = asRecord(item.data);
  const permalink = compact(data.permalink);
  return {
    id: compact(data.id),
    subreddit: compact(data.subreddit),
    title: compact(data.title),
    author: compact(data.author),
    score: Number(data.score || 0),
    comments: Number(data.num_comments || 0),
    permalink,
    url: permalink ? `https://www.reddit.com${permalink}` : compact(data.url),
    createdUtc: Number(data.created_utc || 0),
    selftext: compact(data.selftext),
  };
}

function buildSummarySource(posts: RedditPost[]): string {
  return posts
    .map((post, index) => {
      const details = [
        `${index + 1}. ${post.title}`,
        `subreddit: r/${post.subreddit}`,
        `author: ${post.author}`,
        `score: ${post.score}`,
        post.selftext ? `body: ${post.selftext.slice(0, 260)}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return details;
    })
    .join("\n");
}

export class RedditAdapter implements Adapter {
  readonly key = "reddit";
  readonly version = "1.0.0";

  private config: RedditConfig = {
    baseUrl: "https://www.reddit.com",
    userAgent: "IntegratorPlatform/1.0",
    defaultSubreddit: "",
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      baseUrl: asString(config.baseUrl) || "https://www.reddit.com",
      userAgent: asString(config.userAgent) || "IntegratorPlatform/1.0",
      defaultSubreddit: asString(config.defaultSubreddit),
    };
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "none",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      {
        key: "monitor_posts",
        name: "Monitor Posts",
        description: "Monitor subreddit feeds and emit new post payloads.",
        inputSchema: {
          type: "object",
          properties: {
            subreddit: { type: "string" },
            posts: { type: "array" },
            limit: { type: "number" },
          },
        },
      },
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "fetchSubredditPosts",
        name: "Fetch Subreddit Posts",
        description: "Fetch latest posts from a subreddit feed.",
        inputSchema: {
          type: "object",
          required: ["subreddit"],
          properties: {
            subreddit: { type: "string" },
            limit: { type: "number" },
          },
        },
      },
      {
        key: "summarizePosts",
        name: "Summarize Posts",
        description: "Summarize a subreddit post list for creator workflows.",
        inputSchema: {
          type: "object",
          properties: {
            subreddit: { type: "string" },
            posts: { type: "array" },
            maxSentences: { type: "number" },
          },
        },
      },
    ];
  }

  private async fetchPosts(input: {
    subreddit: string;
    limit: number;
  }): Promise<RedditPost[]> {
    const subreddit = input.subreddit.replace(/^r\//i, "");
    const url = `${this.config.baseUrl}/r/${encodeURIComponent(subreddit)}/new.json?limit=${input.limit}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": this.config.userAgent,
      },
    });
    const body = (await response.json()) as {
      data?: { children?: Array<Record<string, unknown>> };
      message?: string;
      error?: number;
    };
    if (!response.ok) {
      throw new AdapterError(
        body.message || `Reddit API failed (${response.status}).`,
        {
          code: body.error ? `HTTP_${body.error}` : `HTTP_${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      );
    }

    const posts = (body.data?.children || [])
      .map((item) => toPost(item))
      .filter((post) => Boolean(post.id));
    return posts;
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "monitor_posts") {
      throw new AdapterError(`Unsupported trigger "${triggerKey}".`, {
        code: "UNSUPPORTED_TRIGGER",
        retryable: false,
      });
    }

    if (Array.isArray(input.posts)) {
      const events = input.posts
        .map((item) => (typeof item === "object" && item ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          source: "reddit",
          ...item,
        }));
      return {
        events,
      };
    }

    const subreddit = compact(input.subreddit) || this.config.defaultSubreddit;
    if (!subreddit) {
      return {
        events: [],
      };
    }

    const posts = await this.fetchPosts({
      subreddit,
      limit: toPositiveInt(input.limit, 5),
    });

    return {
      events: posts.map((post) => ({
        source: "reddit",
        ...post,
      })),
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey === "fetchSubredditPosts") {
      const subreddit = compact(input.subreddit) || this.config.defaultSubreddit;
      if (!subreddit) {
        throw new AdapterError("fetchSubredditPosts requires subreddit.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }

      const posts = await this.fetchPosts({
        subreddit,
        limit: toPositiveInt(input.limit, 8),
      });
      return {
        success: true,
        output: {
          subreddit,
          count: posts.length,
          posts,
        },
      };
    }

    if (actionKey === "summarizePosts") {
      const subreddit = compact(input.subreddit) || this.config.defaultSubreddit;
      let posts: RedditPost[] = [];
      if (Array.isArray(input.posts) && input.posts.length > 0) {
        posts = input.posts
          .map((item) =>
            typeof item === "object" && item !== null
              ? (item as RedditPost)
              : null,
          )
          .filter((item): item is RedditPost => Boolean(item && item.title));
      } else if (subreddit) {
        posts = await this.fetchPosts({
          subreddit,
          limit: toPositiveInt(input.limit, 8),
        });
      }

      if (posts.length === 0) {
        throw new AdapterError("summarizePosts requires posts or a subreddit.", {
          code: "INVALID_CONFIG",
          retryable: false,
        });
      }

      const source = buildSummarySource(posts);
      const summary = await summarizeText({
        text: source,
        maxSentences: toPositiveInt(input.maxSentences, 3),
      });

      return {
        success: true,
        output: {
          subreddit: subreddit || posts[0].subreddit,
          postCount: posts.length,
          summary: summary.text,
          provider: summary.provider,
          topPosts: posts.slice(0, 5).map((post) => ({
            id: post.id,
            title: post.title,
            url: post.url,
            score: post.score,
          })),
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
    if (config.userAgent !== undefined && !compact(config.userAgent)) {
      errors.push("userAgent must be non-empty when provided.");
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("Reddit adapter does not support token refresh in v1.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(): Promise<AdapterCredentialValidationResult> {
    return {
      status: "valid",
    };
  }
}
