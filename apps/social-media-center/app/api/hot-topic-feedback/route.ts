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
  related_post_id: number | null;
  post_title: string | null;
  publish_time: string | null;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  effect_score: number | null;
  ai_summary: string | null;
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

function calculateEffectReview(row: Pick<PostRow, "views" | "likes" | "comments" | "favorites" | "shares">, averageViews: number) {
  const viewRatio = averageViews > 0 ? row.views / averageViews : row.views > 0 ? 1 : 0;
  const rate = engagementRate(row);
  const deepInteractionRate = row.views > 0 ? (row.favorites + row.shares) / row.views : 0;
  const score = Math.round(Math.min(50, viewRatio * 40) + Math.min(40, rate / 0.03 * 35) + Math.min(10, deepInteractionRate / 0.01 * 10));
  const status = score >= 70 ? "成功" : score >= 45 ? "一般" : "失败";
  const direction = rate >= EFFECTIVE_ENGAGEMENT_RATE
    ? "内容互动方向正确"
    : viewRatio >= 1
      ? "流量触达有效，但互动承接仍需加强"
      : "内容钩子与热点结合度需要调整";
  const follow = status === "成功"
    ? "值得持续跟进，并复用标题钩子、前三秒画面和互动设计。"
    : status === "一般"
      ? "可小范围继续验证，优先优化开场节奏和收藏分享引导。"
      : "暂不建议继续投入同类选题，应更换内容切入角度后再测试。";
  return {
    score: Math.max(0, Math.min(100, score)),
    status,
    rate,
    summary: `${status}：${direction}；${follow}`,
  };
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
    if (row.effect_score === null) continue;
    const type = row.category?.trim() || "其他热点";
    const current = groups.get(type) ?? { type, evaluatedCount: 0, successCount: 0, views: 0 };
    current.evaluatedCount += 1;
    current.successCount += row.effect_score >= 70 ? 1 : 0;
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
        f.recommended_at, f.recommended_content, f.related_post_id,
        p.title AS post_title, COALESCE(f.publish_time, p.publish_time) AS publish_time,
        f.views, f.likes, f.comments, f.favorites, f.shares,
        f.effect_score, f.ai_summary, f.is_effective, f.evaluated_at
      FROM hot_topic_feedback f
      JOIN hot_topics h ON h.id = f.hot_topic_id
      LEFT JOIN social_posts p ON p.id = f.related_post_id
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
  const linkedCount = rows.filter((row) => row.related_post_id !== null).length;
  const evaluatedCount = rows.filter((row) => row.effect_score !== null).length;
  const successCount = rows.filter((row) => row.effect_score !== null && row.effect_score >= 70).length;
  const generalCount = rows.filter((row) => row.effect_score !== null && row.effect_score >= 45 && row.effect_score < 70).length;
  const failureCount = rows.filter((row) => row.effect_score !== null && row.effect_score < 45).length;
  const summary = {
    recommendationCount,
    linkedCount,
    evaluatedCount,
    successCount,
    generalCount,
    failureCount,
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
      review_status: row.effect_score === null ? "待评估" : row.effect_score >= 70 ? "成功" : row.effect_score >= 45 ? "一般" : "失败",
    })),
    posts: postResult.results ?? [],
    highValueTypes,
    lowValueTypes,
    modelSuggestions: buildSuggestions(summary, highValueTypes, lowValueTypes),
    effectivenessRule: "效果评分综合同平台播放表现、互动率和收藏分享深度：70分及以上为成功，45—69分为一般，45分以下为失败。",
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
      p.id AS post_id, p.platform AS post_platform, p.title, p.publish_time,
      p.views, p.likes, p.comments, p.favorites, p.shares
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
  const review = calculateEffectReview(pair, averageViews);
  await d1.prepare(`
    UPDATE hot_topic_feedback SET social_post_id = ?, related_post_id = ?, platform = ?, publish_time = ?,
      views = ?, likes = ?, comments = ?, favorites = ?, shares = ?, effect_score = ?, ai_summary = ?,
      is_effective = ?, evaluated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(postId, postId, pair.post_platform, pair.publish_time, pair.views, pair.likes, pair.comments,
    pair.favorites, pair.shares, review.score, review.summary, review.status === "成功" ? 1 : 0, feedbackId).run();
  return Response.json({
    feedbackId,
    postId,
    effective: review.status === "成功",
    effectScore: review.score,
    reviewStatus: review.status,
    aiSummary: review.summary,
    engagementRate: Math.round(review.rate * 10000) / 100,
    platformAverageViews: Math.round(averageViews),
  });
}

export async function PUT() {
  await ensureDatabase();
  const d1 = getD1();
  const [linkedResult, averageResult] = await Promise.all([
    d1.prepare(`
      SELECT f.id, p.platform, p.title, p.publish_time, p.views, p.likes, p.comments, p.favorites, p.shares
      FROM hot_topic_feedback f JOIN social_posts p ON p.id = COALESCE(f.related_post_id, f.social_post_id)
    `).all<PostRow & { id: number }>(),
    d1.prepare("SELECT platform, AVG(views) AS average_views FROM social_posts GROUP BY platform")
      .all<{ platform: string; average_views: number }>(),
  ]);
  const averages = new Map((averageResult.results ?? []).map((row) => [row.platform, Number(row.average_views)]));
  const linked = linkedResult.results ?? [];
  if (linked.length) {
    await d1.batch(linked.map((row) => {
      const review = calculateEffectReview(row, averages.get(row.platform) ?? 0);
      return d1.prepare(`
        UPDATE hot_topic_feedback SET related_post_id = COALESCE(related_post_id, social_post_id), platform = ?,
          publish_time = ?, views = ?, likes = ?, comments = ?, favorites = ?, shares = ?, effect_score = ?,
          ai_summary = ?, is_effective = ?, evaluated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(row.platform, row.publish_time, row.views, row.likes, row.comments, row.favorites, row.shares,
        review.score, review.summary, review.status === "成功" ? 1 : 0, row.id);
    }));
  }
  return Response.json({ refreshedCount: linked.length, data: await readFeedbackData() });
}
