import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { calculateHotTopicActionScore, topicContentDirection } from "@/lib/hot-topic-action-score";

type TopicRow = {
  id: number;
  platform: string;
  topic_name: string;
  keyword: string;
  category: string | null;
  heat_value: number;
  relevance_score: number;
  recommend_follow: number;
  recommendation_reason: string;
  recommended_title: string;
  shooting_direction: string;
  live_theme: string;
};

export async function POST(request: Request) {
  const payload = await request.json() as { id?: number };
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "热点编号无效" }, { status: 400 });
  await ensureDatabase();
  const row = await getD1().prepare(`
    SELECT h.id, h.platform, h.topic_name, h.keyword, h.category, h.heat_value,
      a.relevance_score, a.recommend_follow, a.recommendation_reason,
      a.recommended_title, a.shooting_direction, a.live_theme
    FROM hot_topics h
    JOIN hot_topic_analysis a ON a.id = (
      SELECT candidate.id FROM hot_topic_analysis candidate
      WHERE candidate.hot_topic_id = h.id
      ORDER BY CASE WHEN candidate.analysis_source = 'WorkBuddy热点监测报告' THEN 0 ELSE 1 END,
        candidate.created_at DESC, candidate.id DESC LIMIT 1
    )
    WHERE h.id = ? AND h.status = 'active'
  `).bind(id).first<TopicRow>();
  if (!row) return Response.json({ error: "热点或AI分析不存在" }, { status: 404 });

  const score = calculateHotTopicActionScore({
    heatValue: row.heat_value,
    relevanceScore: row.relevance_score,
    recommendFollow: Boolean(row.recommend_follow),
    recommendationReason: row.recommendation_reason,
    topicName: row.topic_name,
    keyword: row.keyword,
    category: row.category,
    recommendedTitle: row.recommended_title,
    shootingDirection: row.shooting_direction,
    liveTheme: row.live_theme,
  });
  const scriptDirection = [
    `前三秒：用${row.keyword.split(/\s+/).slice(0, 2).join("、") || "热点画面"}作为字幕钩子，直接呈现峡谷最有冲击力的镜头。`,
    `中段：${row.shooting_direction}`,
    "结尾：补充路线、项目或游玩提示，并用问题引导游客评论和收藏。",
  ].join("\n");
  const contentDirection = topicContentDirection(row.category, row.platform);
  const recommendedContent = {
    shortVideoTitle: row.recommended_title,
    contentDirection,
    scriptDirection,
    liveTheme: row.live_theme,
  };
  const feedback = await getD1().prepare(`
    INSERT INTO hot_topic_feedback (hot_topic_id, recommended_content)
    VALUES (?, ?)
    RETURNING id
  `).bind(row.id, JSON.stringify(recommendedContent)).first<{ id: number }>();
  if (!feedback) return Response.json({ error: "热点选题复盘记录创建失败" }, { status: 500 });
  return Response.json({
    id: row.id,
    feedbackId: feedback.id,
    topicName: row.topic_name,
    recommendationLevel: score.level,
    tourismConversionScore: score.tourismConversion,
    shortVideoTitle: row.recommended_title,
    contentDirection,
    scriptDirection,
    liveTheme: row.live_theme,
  });
}
