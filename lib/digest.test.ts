import { describe, expect, test } from "bun:test";
import type { DigestStore } from "./digest";
import {
  DIGEST_ARTICLES_PER_WINDOW,
  DIGEST_WINDOW_MS,
  digestWindowStart,
  formatDigestWindow,
  getDigest,
  groupDigestArticles,
} from "./digest";
import type { FeedArticle } from "./feed";

function article(
  id: string,
  publishedAt: string,
  score = 0,
  vote: FeedArticle["vote"] = null,
): FeedArticle {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Article ${id}`,
    summary: null,
    source: "Example",
    tags: ["new-tech"],
    publishedAt: new Date(publishedAt),
    score,
    vote,
  };
}

describe("digest windows", () => {
  test("uses fixed 48-hour UTC boundaries and places boundary articles in the newer window", () => {
    const lastOld = article("old", "1970-01-02T23:59:59.999Z");
    const firstNew = article("new", "1970-01-03T00:00:00.000Z");

    expect(DIGEST_WINDOW_MS).toBe(172_800_000);
    expect(digestWindowStart(lastOld.publishedAt).toISOString()).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    expect(digestWindowStart(firstNew.publishedAt).toISOString()).toBe(
      "1970-01-03T00:00:00.000Z",
    );
    expect(
      groupDigestArticles([lastOld, firstNew]).map((window) => window.articles[0]?.id),
    ).toEqual(["new", "old"]);
  });

  test("shows newest windows first with stable human-readable ranges", () => {
    const windows = groupDigestArticles([
      article("older", "1970-01-01T12:00:00.000Z"),
      article("newer", "1970-01-04T12:00:00.000Z"),
    ]);

    expect(windows.map((window) => window.startsAt.toISOString())).toEqual([
      "1970-01-03T00:00:00.000Z",
      "1970-01-01T00:00:00.000Z",
    ]);
    const [newest] = windows;
    expect(newest).toBeDefined();
    if (newest) {
      expect(formatDigestWindow(newest)).toBe("03 Jan 1970 – 04 Jan 1970");
    }
  });

  test("keeps only the top ten articles in each window", () => {
    const articles = Array.from(
      { length: DIGEST_ARTICLES_PER_WINDOW + 2 },
      (_, index) => article(`article-${index}`, "1970-01-01T12:00:00.000Z", index),
    );

    const [window] = groupDigestArticles(articles);

    expect(window?.articles).toHaveLength(DIGEST_ARTICLES_PER_WINDOW);
    expect(window?.articles.map(({ score }) => score)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  test("breaks score ties by publication time then article ID", () => {
    const [window] = groupDigestArticles([
      article("z", "1970-01-01T12:00:00.000Z", 2),
      article("b", "1970-01-02T12:00:00.000Z", 2),
      article("a", "1970-01-02T12:00:00.000Z", 2),
      article("highest", "1970-01-01T01:00:00.000Z", 3),
    ]);

    expect(window?.articles.map(({ id }) => id)).toEqual(["highest", "a", "b", "z"]);
  });

  test("returns no windows for an empty article set", () => {
    expect(groupDigestArticles([])).toEqual([]);
  });
});

describe("getDigest", () => {
  test("scopes reads to the viewer and preserves that viewer's vote state", async () => {
    const calls: Parameters<DigestStore["listScoredArticles"]>[0][] = [];
    const store: DigestStore = {
      async listScoredArticles(input) {
        calls.push(input);
        return [article("kept", "1970-01-01T12:00:00.000Z", 1, 1)];
      },
    };

    const windows = await getDigest("viewer-1", store);

    expect(calls).toEqual([{ userId: "viewer-1" }]);
    expect(windows[0]?.articles[0]?.vote).toBe(1);
  });
});
