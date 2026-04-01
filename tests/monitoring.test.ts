import { describe, expect, it } from "vitest";

import { buildMonitorQuery, dedupeCandidates, matchesMonitorQuery } from "@/lib/utils";

describe("monitoring helpers", () => {
  it("builds a combined query from monitor fields", () => {
    expect(
      buildMonitorQuery({
        keyword: "GPT-5",
        scope: "AI 编程",
        description: "模型更新",
      }),
    ).toBe("GPT-5 AI 编程 模型更新");
  });

  it("matches query tokens against candidate text", () => {
    expect(
      matchesMonitorQuery(
        {
          keyword: "Claude Code",
          scope: "AI 编程",
          description: "",
        },
        "Anthropic ships Claude Code update for AI 编程 workflows",
      ),
    ).toBe(true);
  });

  it("deduplicates repeated candidates", () => {
    const results = dedupeCandidates([
      {
        source: "webSearch",
        sourceLabel: "Web Search",
        externalId: "same-id",
        title: "Claude Code 新版本发布",
        url: "https://example.com/a",
        excerpt: "first",
        publishedAt: null,
        author: null,
        metrics: {},
      },
      {
        source: "webSearch",
        sourceLabel: "Web Search",
        externalId: "same-id",
        title: "Claude Code 新版本发布",
        url: "https://example.com/a",
        excerpt: "second",
        publishedAt: null,
        author: null,
        metrics: {},
      },
    ]);

    expect(results).toHaveLength(1);
  });
});