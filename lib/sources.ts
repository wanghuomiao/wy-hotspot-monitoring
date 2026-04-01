import { XMLParser } from "fast-xml-parser";
import { load } from "cheerio";
import { TwitterAPIIOClient } from "twitterapi-io-client";

import type { Monitor, RawCandidate } from "@/lib/schema";
import { buildMonitorQuery, dedupeCandidates, matchesMonitorQuery, stripHtml, truncateText } from "@/lib/utils";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

const defaultGithubRepos = (process.env.GITHUB_RELEASE_REPOS || "")
  .split(",")
  .map((repo) => repo.trim())
  .filter(Boolean);

const requestHeaders = {
  "User-Agent": "Mozilla/5.0 (compatible; HotspotMonitoringRadar/1.0; +http://localhost:3000)",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

function buildQueries(monitor: Monitor) {
  const combined = buildMonitorQuery(monitor);
  const candidates = [
    combined,
    monitor.keyword.trim(),
    monitor.scope.trim(),
    `${monitor.keyword.trim()} ${monitor.description.trim()}`.trim(),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

async function fetchWebSearchResults(query: string): Promise<RawCandidate[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: requestHeaders,
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const $ = load(html);

  return $(".result")
    .slice(0, 6)
    .map((_, element) => {
      const title = $(element).find(".result__title a").text().trim();
      const href = $(element).find(".result__title a").attr("href")?.trim();
      const snippet = $(element).find(".result__snippet").text().trim();

      if (!title || !href) {
        return null;
      }

      return {
        source: "webSearch",
        sourceLabel: "Web Search",
        externalId: href,
        title,
        url: href,
        excerpt: truncateText(snippet, 220),
        publishedAt: null,
        author: null,
        metrics: {},
      } satisfies RawCandidate;
    })
    .get()
    .filter(Boolean) as RawCandidate[];
}

async function fetchGoogleNewsResults(query: string): Promise<RawCandidate[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const response = await fetch(url, {
    headers: requestHeaders,
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as {
    rss?: {
      channel?: {
        item?: Array<{
          guid?: string;
          title?: string;
          link?: string;
          pubDate?: string;
          description?: string;
        }> | {
          guid?: string;
          title?: string;
          link?: string;
          pubDate?: string;
          description?: string;
        };
      };
    };
  };

  const items = parsed.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];

  return list.slice(0, 8).flatMap((item) => {
    if (!item.title || !item.link) {
      return [];
    }

    return [
      {
        source: "googleNews",
        sourceLabel: "Google News",
        externalId: item.guid || item.link,
        title: stripHtml(item.title),
        url: item.link,
        excerpt: truncateText(stripHtml(item.description || ""), 220),
        publishedAt: item.pubDate || null,
        author: null,
        metrics: {},
      } satisfies RawCandidate,
    ];
  });
}

async function fetchHackerNewsResults(query: string): Promise<RawCandidate[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story`;
  const response = await fetch(url, {
    headers: requestHeaders,
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    hits?: Array<{
      objectID: string;
      title?: string;
      story_text?: string;
      url?: string;
      created_at?: string;
      author?: string;
      points?: number;
      num_comments?: number;
    }>;
  };

  return (payload.hits || []).slice(0, 8).flatMap((item) => {
    if (!item.title || !item.url) {
      return [];
    }

    return [
      {
        source: "hackerNews",
        sourceLabel: "Hacker News",
        externalId: item.objectID,
        title: item.title,
        url: item.url,
        excerpt: truncateText(item.story_text || "", 220),
        publishedAt: item.created_at || null,
        author: item.author || null,
        metrics: {
          points: item.points || 0,
          comments: item.num_comments || 0,
        },
      } satisfies RawCandidate,
    ];
  });
}

async function fetchGithubReleaseResults(monitor: Monitor, query: string): Promise<RawCandidate[]> {
  const repos = monitor.githubRepos.length > 0 ? monitor.githubRepos : defaultGithubRepos;

  if (repos.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    repos.slice(0, 8).map(async (repo) => {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=2`, {
        headers: {
          ...requestHeaders,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return [] as RawCandidate[];
      }

      const releases = (await response.json()) as Array<{
        id: number;
        html_url: string;
        name: string;
        body?: string;
        published_at?: string;
      }>;

      return releases.flatMap((release) => {
        const text = `${release.name}\n${release.body || ""}`;

        if (!matchesMonitorQuery(monitor, text) && !query.toLowerCase().includes(repo.split("/")[1]?.toLowerCase() || "")) {
          return [];
        }

        return [
          {
            source: "githubReleases",
            sourceLabel: "GitHub Releases",
            externalId: `${repo}:${release.id}`,
            title: `${repo} 发布 ${release.name}`,
            url: release.html_url,
            excerpt: truncateText(stripHtml(release.body || ""), 220),
            publishedAt: release.published_at || null,
            author: repo,
            metrics: {},
          } satisfies RawCandidate,
        ];
      });
    }),
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function fetchTwitterResults(query: string): Promise<RawCandidate[]> {
  const apiKey = process.env.TWITTER_API_IO_KEY;

  if (!apiKey) {
    return [];
  }

  const client = new TwitterAPIIOClient({ apiKey });
  const result = await client.tweets.searchTweets(query, "latest");

  return (result.tweets || []).slice(0, 8).map((tweet) => ({
    source: "twitter",
    sourceLabel: "Twitter / X",
    externalId: tweet.id,
    title: truncateText(tweet.text.replace(/\s+/g, " "), 120),
    url: tweet.url,
    excerpt: truncateText(tweet.text.replace(/\s+/g, " "), 220),
    publishedAt: tweet.createdAt || null,
    author: tweet.author?.userName || tweet.author?.name || null,
    metrics: {
      likes: tweet.likeCount || 0,
      comments: tweet.replyCount || 0,
      views: tweet.viewCount || 0,
      reposts: tweet.retweetCount || 0,
    },
  }));
}

export async function fetchCandidatesForMonitor(monitor: Monitor) {
  const queries = buildQueries(monitor);
  const tasks: Array<Promise<RawCandidate[]>> = [];

  if (monitor.sources.includes("webSearch")) {
    tasks.push(...queries.map((query) => fetchWebSearchResults(query)));
  }

  if (monitor.sources.includes("googleNews")) {
    tasks.push(...queries.map((query) => fetchGoogleNewsResults(query)));
  }

  if (monitor.sources.includes("hackerNews")) {
    tasks.push(...queries.map((query) => fetchHackerNewsResults(query)));
  }

  if (monitor.sources.includes("githubReleases")) {
    tasks.push(fetchGithubReleaseResults(monitor, queries[0] || monitor.scope));
  }

  if (monitor.sources.includes("twitter")) {
    tasks.push(...queries.map((query) => fetchTwitterResults(query)));
  }

  const settled = await Promise.allSettled(tasks);

  return dedupeCandidates(
    settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  );
}