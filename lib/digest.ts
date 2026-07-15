import { db } from "./db";
import type { FeedArticle } from "./feed";
import type { VoteValue } from "./votes";

export const DIGEST_ARTICLES_PER_WINDOW = 10;
export const DIGEST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export interface DigestWindow {
  startsAt: Date;
  endsAt: Date;
  articles: FeedArticle[];
}

export interface DigestStore {
  listScoredArticles(input: { userId: string }): Promise<FeedArticle[]>;
}

const defaultDigestStore: DigestStore = {
  async listScoredArticles({ userId }) {
    const rows = await db.articleScore.findMany({
      where: { userId },
      select: {
        score: true,
        article: {
          select: {
            id: true,
            url: true,
            title: true,
            summary: true,
            source: true,
            tags: true,
            publishedAt: true,
            votes: {
              where: { userId },
              select: { value: true },
              take: 1,
            },
          },
        },
      },
    });

    return rows.map(({ article: { votes, ...article }, score }) => ({
      ...article,
      score,
      vote: normalizeVote(votes[0]?.value),
    }));
  },
};

const windowDate = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export async function getDigest(
  userId: string,
  store: DigestStore = defaultDigestStore,
): Promise<DigestWindow[]> {
  return groupDigestArticles(await store.listScoredArticles({ userId }));
}

export function groupDigestArticles(articles: FeedArticle[]): DigestWindow[] {
  const grouped = new Map<number, FeedArticle[]>();

  for (const article of articles) {
    const startsAt = digestWindowStart(article.publishedAt).getTime();
    const windowArticles = grouped.get(startsAt) ?? [];
    windowArticles.push(article);
    grouped.set(startsAt, windowArticles);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => right - left)
    .map(([startsAt, windowArticles]) => ({
      startsAt: new Date(startsAt),
      endsAt: new Date(startsAt + DIGEST_WINDOW_MS),
      articles: windowArticles
        .sort(compareArticles)
        .slice(0, DIGEST_ARTICLES_PER_WINDOW),
    }));
}

export function digestWindowStart(publishedAt: Date): Date {
  return new Date(
    Math.floor(publishedAt.getTime() / DIGEST_WINDOW_MS) * DIGEST_WINDOW_MS,
  );
}

export function formatDigestWindow(
  window: Pick<DigestWindow, "startsAt" | "endsAt">,
): string {
  const lastDay = new Date(window.endsAt.getTime() - 24 * 60 * 60 * 1000);
  return `${windowDate.format(window.startsAt)} – ${windowDate.format(lastDay)}`;
}

function compareArticles(left: FeedArticle, right: FeedArticle): number {
  return (
    right.score - left.score ||
    right.publishedAt.getTime() - left.publishedAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function normalizeVote(value: number | undefined): VoteValue | null {
  return value === 1 || value === -1 ? value : null;
}
