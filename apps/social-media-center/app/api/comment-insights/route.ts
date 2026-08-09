import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange, type DateRange } from "@/lib/date-range";
import {
  analyzeComment,
  buildOperatingSuggestions,
  commentInsightEngine,
  visitorNeedCategories,
  type Sentiment,
  type VisitorNeed,
} from "@/lib/comment-insight-engine";

export const dynamic = "force-dynamic";

type CommentRow = {
  id: number;
  post_id: number;
  platform: string;
  username: string;
  comment_text: string;
  comment_time: string;
  likes: number;
  sentiment: string;
  keyword: string | null;
  user_need: string | null;
  ai_analysis: string | null;
  post_title: string;
};

async function readComments(range: DateRange) {
  return getD1().prepare(`
    SELECT c.id, c.post_id, c.platform, c.username, c.comment_text,
      c.comment_time, c.likes, c.sentiment, c.keyword, c.user_need,
      c.ai_analysis, p.title AS post_title
    FROM social_comments c
    INNER JOIN social_posts p ON p.id = c.post_id
    WHERE c.platform IN ('douyin', 'kuaishou', 'weibo')
      AND date(c.comment_time) BETWEEN date(?) AND date(?)
    ORDER BY c.likes DESC, c.comment_time DESC, c.id DESC
    LIMIT 2000
  `).bind(range.from, range.to).all<CommentRow>();
}

function buildResponse(rows: CommentRow[], range: DateRange) {
  const analyzed = rows.map((row) => ({ row, result: analyzeComment(row) }));
  const sentiments: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0 };
  const keywordCounts = new Map<string, number>();
  const needCounts = new Map<VisitorNeed, number>(visitorNeedCategories.map((name) => [name, 0]));

  for (const item of analyzed) {
    sentiments[item.result.sentiment] += 1;
    needCounts.set(item.result.userNeed, (needCounts.get(item.result.userNeed) ?? 0) + 1);
    for (const keyword of item.result.keywords) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
  }

  const total = rows.length;
  const needs = [...needCounts.entries()]
    .map(([name, count]) => ({ name, count, ratio: total ? Math.round(count / total * 100) : 0 }))
    .sort((a, b) => b.count - a.count || visitorNeedCategories.indexOf(a.name) - visitorNeedCategories.indexOf(b.name));
  const keywords = [...keywordCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 12);

  return {
    summary: {
      total,
      analyzed: rows.filter((row) => Boolean(row.ai_analysis)).length,
      positive: sentiments.positive,
      negative: sentiments.negative,
      neutral: sentiments.neutral,
      positiveRatio: total ? Math.round(sentiments.positive / total * 100) : 0,
      negativeRatio: total ? Math.round(sentiments.negative / total * 100) : 0,
      neutralRatio: total ? Math.round(sentiments.neutral / total * 100) : 0,
    },
    keywords,
    needs,
    suggestions: buildOperatingSuggestions(needs),
    comments: analyzed.slice(0, 100).map(({ row, result }) => ({
      id: row.id,
      postId: row.post_id,
      postTitle: row.post_title,
      platform: row.platform,
      username: row.username,
      commentText: row.comment_text,
      commentTime: row.comment_time,
      likes: row.likes,
      ...result,
    })),
    engine: commentInsightEngine.name,
    futureAiEndpoint: commentInsightEngine.futureEndpoint,
    sources: ["social_comments", "social_posts"],
    range,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const range = resolveDateRange(new URL(request.url).searchParams);
  const rows = await readComments(range);
  return Response.json(buildResponse(rows.results, range), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const range = resolveDateRange(new URL(request.url).searchParams);
  const rows = await readComments(range);
  const analyzedAt = new Date().toISOString();
  const statements = rows.results.map((row) => {
    const result = analyzeComment(row);
    return d1.prepare(`
      UPDATE social_comments
      SET sentiment = ?, keyword = ?, user_need = ?, ai_analysis = ?
      WHERE id = ?
    `).bind(
      result.sentiment,
      JSON.stringify(result.keywords),
      result.userNeed,
      JSON.stringify({
        engine: commentInsightEngine.name,
        confidence: result.confidence,
        sentimentScore: result.sentimentScore,
        matchedRules: result.matchedRules,
        analyzedAt,
      }),
      row.id,
    );
  });

  try {
    for (let index = 0; index < statements.length; index += 100) {
      await d1.batch(statements.slice(index, index + 100));
    }
  } catch {
    return Response.json({ error: "评论分析写入失败，请稍后重试" }, { status: 500 });
  }

  const refreshed = await readComments(range);
  return Response.json(buildResponse(refreshed.results, range));
}
