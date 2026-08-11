import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

const EFFECTIVE_ENGAGEMENT_RATE = 0.03;

type FeedbackRow = {
  id: number;
  hot_topic_id: number;
  topic_name: string;
  platform: string;
  category: string | null;
  recommended_at: string;
  recommended_content: string;
  social_post_id: number | null;
  post_title: string | null;
  publish_time: string | null;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  is_effective: number | null;
  evaluated_at: string | null;
};

type PostRow = {
  id: number;
  platform: string;
  title: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
};

function engagementRate(row: Pick<FeedbackRow | PostRow, "views" | "likes" | "comments" | "favorites" | "shares">) {
  if (row.views <= 0) return 0;
  return (row.likes + row.comments + row.favorites + row.shares) / row.views;
}

function readContent(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return { shortVideoTitle: raw };
  }
}

function buildTypeGroups(rows: FeedbackRow[]) {
  const groups = new Map<string, { type: string; evaluatedCount: number; successCount: number; views: number }>();
  for (const row of rows) {
    if (row.is_effective === null) continue;
    const type = row.category?.trim() || "其他热点";
    const current = groups.get(type) ?? { type, evaluatedCount: 0, successCount: 0, views: 0 };
    current.evaluatedCount += 1;
    current.successCount += row.is_effective ? 1 : 0;
    current.views += row.views;
    groups.set(type, current);
  }
  return [...groups.values()].map((group) => ({
    type: group.type,
    evaluatedCount: group.evaluatedCount,
    successCount: group.successCount,
    successRate: Math.round(group.successCount / group.evaluatedCount * 1000) / 10,
    averageViews: Math.round(group.views / group.evaluatedCount),
  })).sort((a, b) => b.successRate - a.successRate || b.averageViews - a.averageViews);
}

function buildSuggestions(summary: { linkedCount: number; evaluatedCount: number; successRate: number; linkRate: number }, highTypes: Array<{ type: string }>, lowTypes: Array<{ type: string }>) {
  const suggestions: string[] = [];
  if (summary.evaluatedCount === 0) {
    suggestions.push("先将已生成选题与实际发布作品关联，形成首批可评估样本；待评估推荐不计入失败。");
    suggestions.push("建议至少积累 5 条已发布作品后，再调整热点推荐阈值，避免小样本误判。");
    return suggestions;
  }
  if (summary.linkRate < 60) suggestions.push("选题与作品关联率偏低，建议发布后当天完成关联，减少复盘样本缺口。");
  if (highTypes[0]) suggestions.push(`优先增加“${highTypes[0].type}”类热点的候选权重，并复用其标题钩子与拍摄结构。`);
  if (lowTypes[0]) suggestions.push(`降低“${lowTypes[0].type}”类热点的默认推荐权重，生成前增加景区资源适配校验。`);
  suggestions.push(summary.successRate >= 60
    ? "当前有效率达到可用水平，下一阶段重点验证跨周期稳定性与旅游转化表现。"
    : "当前有效率仍偏低，建议提高关联度与内容适配度权重，并收紧A级推荐门槛。");
  return suggestions;
}

async function readFeedbackData() {
  const d1 = getD1();
  const [feedbackResult, postResult] = await Promise.all([
    d1.prepare(`
      SELECT f.id, f.hot_topic_id, h.topic_name, h.platform, h.category,
        f.recommended_at, f.recommended_content, f.social_post_id,
        p.title AS post_title, p.publish_time,
        f.views, f.likes, f.comments, f.favorites, f.shares,
        f.is_effective, f.evaluated_at
      FROM hot_topic_feedback f
      JOIN hot_topics h ON h.id = f.hot_topic_id
      LEFT JOIN social_posts p ON p.id = f.social_post_id
      ORDER BY f.recommended_at DESC, f.id DESC
    `).all<FeedbackRow>(),
    d1.prepare(`
      SELECT id, platform, title, publish_time, views, likes, comments, favorites, shares
      FROM social_posts
      ORDER BY publish_time DESC, id DESC
      LIMIT 200
    `).all<PostRow>(),
  ]);
  const rows = feedbackResult.results ?? [];
  const recommendationCount = rows.length;
  const linkedCount = rows.filter((row) => row.social_post_id !== null).length;
  const evaluatedCount = rows.filter((row) => row.is_effective !== null).length;
  const successCount = rows.filter((row) => row.is_effective === 1).length;
  const summary = {
    recommendationCount,
    linkedCount,
    evaluatedCount,
    successCount,
    successRate: evaluatedCount ? Math.round(successCount / evaluatedCount * 1000) / 10 : 0,
    linkRate: recommendationCount ? Math.round(linkedCount / recommendationCount * 1000) / 10 : 0,
  };
  const groups = buildTypeGroups(rows);
  const highCount = Math.min(3, Math.ceil(groups.length / 2));
  const highValueTypes = groups.slice(0, highCount);
  const lowValueTypes = groups.length > 1 ? groups.slice(highCount).reverse().slice(0, 3) : [];
  return {
    summary,
    records: rows.map((row) => ({
      ...row,
      recommended_content: readContent(row.recommended_content),
      engagement_rate: Math.round(engagementRate(row) * 10000) / 100,
      is_effective: row.is_effective === null ? null : Boolean(row.is_effective),
    })),
    posts: postResult.results ?? [],
    highValueTypes,
    lowValueTypes,
    modelSuggestions: buildSuggestions(summary, highValueTypes, lowValueTypes),
    effectivenessRule: "作品播放量达到同平台作品平均播放量，或互动率（点赞+评论+收藏+分享）达到3%，即判定推荐有效。",
  };
}

export async function GET() {
  await ensureDatabase();
  return Response.json(await readFeedbackData());
}

export async function PATCH(request: Request) {
  const payload = await request.json() as { feedbackId?: number; postId?: number };
  const feedbackId = Number(payload.feedbackId);
  const postId = Number(payload.postId);
  if (!Number.isInteger(feedbackId) || feedbackId <= 0 || !Number.isInteger(postId) || postId <= 0) {
    return Response.json({ error: "复盘记录或作品编号无效" }, { status: 400 });
  }
  await ensureDatabase();
  const d1 = getD1();
  const pair = await d1.prepare(`
    SELECT f.id, h.platform AS topic_platform,
      p.id AS post_id, p.platform AS post_platform, p.views, p.likes, p.comments, p.favorites, p.shares
    FROM hot_topic_feedback f
    JOIN hot_topics h ON h.id = f.hot_topic_id
    JOIN social_posts p ON p.id = ?
    WHERE f.id = ?
  `).bind(postId, feedbackId).first<PostRow & { topic_platform: string; post_platform: string; post_id: number }>();
  if (!pair) return Response.json({ error: "复盘记录或对应作品不存在" }, { status: 404 });
  if (pair.topic_platform !== pair.post_platform) {
    return Response.json({ error: "热点平台与发布作品平台不一致，不能建立效果关联" }, { status: 400 });
  }
  const average = await d1.prepare("SELECT AVG(views) AS average_views FROM social_posts WHERE platform = ?")
    .bind(pair.post_platform).first<{ average_views: number | null }>();
  const averageViews = Number(average?.average_views ?? 0);
  const rate = engagementRate(pair);
  const effective = pair.views >= averageViews || rate >= EFFECTIVE_ENGAGEMENT_RATE;
  await d1.prepare(`
    UPDATE hot_topic_feedback SET social_post_id = ?, views = ?, likes = ?, comments = ?,
      favorites = ?, shares = ?, is_effective = ?, evaluated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(postId, pair.views, pair.likes, pair.comments, pair.favorites, pair.shares, effective ? 1 : 0, feedbackId).run();
  return Response.json({
    feedbackId,
    postId,
    effective,
    engagementRate: Math.round(rate * 10000) / 100,
    platformAverageViews: Math.round(averageViews),
  });
}

export async function PUT() {
  await ensureDatabase();
  const d1 = getD1();
  const [linkedResult, averageResult] = await Promise.all([
    d1.prepare(`
      SELECT f.id, p.platform, p.views, p.likes, p.comments, p.favorites, p.shares
      FROM hot_topic_feedback f JOIN social_posts p ON p.id = f.social_post_id
    `).all<PostRow & { id: number }>(),
    d1.prepare("SELECT platform, AVG(views) AS average_views FROM social_posts GROUP BY platform")
      .all<{ platform: string; average_views: number }>(),
  ]);
  const averages = new Map((averageResult.results ?? []).map((row) => [row.platform, Number(row.average_views)]));
  const linked = linkedResult.results ?? [];
  if (linked.length) {
    await d1.batch(linked.map((row) => {
      const effective = row.views >= (averages.get(row.platform) ?? 0) || engagementRate(row) >= EFFECTIVE_ENGAGEMENT_RATE;
      return d1.prepare(`
        UPDATE hot_topic_feedback SET views = ?, likes = ?, comments = ?, favorites = ?, shares = ?,
          is_effective = ?, evaluated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(row.views, row.likes, row.comments, row.favorites, row.shares, effective ? 1 : 0, row.id);
    }));
  }
  return Response.json({ refreshedCount: linked.length, data: await readFeedbackData() });
}
