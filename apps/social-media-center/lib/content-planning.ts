import { calculateHotTopicActionScore, topicContentDirection } from "@/lib/hot-topic-action-score";

export type PlanningTopic = {
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
  prior_effect_score?: number | null;
};

export type PerformanceBaseline = {
  average_views: number;
  average_interaction_rate: number;
  average_fans_growth: number;
};

type FeedbackPost = {
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  fans_growth: number;
};

const contentTypeLabels = {
  guide: "攻略",
  scenery: "风景",
  visitor_experience: "游客体验",
  challenge: "挑战",
  live: "直播",
} as const;

export type PlanningContentType = keyof typeof contentTypeLabels;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanKeyword(topic: PlanningTopic) {
  return topic.keyword.split(/[，,、#\s]+/).find((item) => item.length >= 2) ?? topic.topic_name.slice(0, 12);
}

export function inferPlanningContentType(topic: PlanningTopic): PlanningContentType {
  const text = `${topic.topic_name} ${topic.keyword} ${topic.category ?? ""} ${topic.live_theme}`;
  if (/直播|云游|连线/.test(text)) return "live";
  if (/挑战|比赛|大赛|运动/.test(text)) return "challenge";
  if (/攻略|路线|门票|自驾|交通|避暑|预约|怎么玩/.test(text)) return "guide";
  if (/游客|体验|亲子|研学|打卡/.test(text)) return "visitor_experience";
  return "scenery";
}

function nextPublishTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)} 19:30`;
}

export function generateContentPlan(topic: PlanningTopic, baseline: PerformanceBaseline, now = new Date()) {
  const keyword = cleanKeyword(topic);
  const contentType = inferPlanningContentType(topic);
  const contentTypeLabel = contentTypeLabels[contentType];
  const titleSeed = topic.recommended_title && !/不适合|待生成/.test(topic.recommended_title)
    ? topic.recommended_title
    : `独山子大峡谷遇上${keyword}`;
  const titleOptions = unique([
    titleSeed,
    `${keyword}怎么玩？独山子大峡谷一条视频讲清楚`,
    `新疆旅行别错过：独山子大峡谷${contentTypeLabel}实测`,
    `第一视角走进独山子大峡谷，${keyword}到底值不值？`,
    `来独库公路第一景，把${keyword}拍成一支大片`,
  ]).slice(0, 5);
  while (titleOptions.length < 5) titleOptions.push(`${keyword} × 独山子大峡谷创意方案 ${titleOptions.length + 1}`);

  const hook = contentType === "guide"
    ? `“${keyword}到底怎么玩？”画面直接给出路线结果和峡谷全景。`
    : contentType === "challenge"
      ? `从挑战结果倒叙开场，用游客最真实的反应制造悬念。`
      : `前三秒用峡谷最具尺度感的画面，让人物进入画面作比例参照。`;
  const script = [
    `开场（0–3秒）：${hook}`,
    `展开（4–15秒）：围绕“${topic.topic_name}”说明它与独山子大峡谷的连接点，快速交代地点、项目或路线。`,
    `体验（16–35秒）：${topic.shooting_direction || "用第一视角呈现游客体验，并补充安全、机位和出行信息。"}`,
    `价值（36–50秒）：提供一个可收藏的信息点，例如最佳拍摄时间、路线或项目选择。`,
    `互动（结尾）：你最想在峡谷拍风景、玩项目还是走攻略路线？评论区告诉我们。`,
  ].join("\n");
  const shotList = [
    { shot: 1, scene: "强钩子", visual: "峡谷全景或游客高能反应", voiceover: hook, duration: "0–3秒" },
    { shot: 2, scene: "位置交代", visual: "入口、路线牌与人物行进", voiceover: `这里是独库公路第一景，今天用${keyword}打开峡谷。`, duration: "4–10秒" },
    { shot: 3, scene: "核心体验", visual: topic.shooting_direction || "第一视角项目或景观体验", voiceover: "用一个核心体验推进故事，不堆砌无关镜头。", duration: "11–28秒" },
    { shot: 4, scene: "实用信息", visual: "字幕卡叠加路线、时间或安全提示", voiceover: "补充一条值得收藏的游客信息。", duration: "29–42秒" },
    { shot: 5, scene: "互动收口", visual: "人物回望峡谷或游客真实评价", voiceover: "设置具体选择题，引导评论与转发。", duration: "43–55秒" },
  ];
  const hashtags = unique(["独山子大峡谷", "独库公路第一景", "新疆旅游", "新疆自驾", keyword, contentTypeLabel]);
  const recommendedTopics = unique([`#${keyword}`, "#新疆旅游", "#独库公路", "#独山子大峡谷"]);
  const targetViews = Math.max(1000, Math.round(Math.max(baseline.average_views, 800) * 1.5 / 100) * 100);
  const targetInteractionRate = Number(Math.max(3, baseline.average_interaction_rate * 1.2).toFixed(2));
  const targetFansGrowth = Math.max(10, Math.round(Math.max(baseline.average_fans_growth, 5) * 1.4));

  return {
    contentType,
    contentTypeLabel,
    title: titleOptions[0],
    titleOptions,
    script,
    shotList,
    coverText: `${keyword}\n独山子大峡谷这样拍`,
    hashtags,
    recommendedTopics,
    backgroundMusic: /民俗|新疆|民族/.test(`${topic.topic_name}${topic.category ?? ""}`)
      ? "新疆民族器乐节奏版（使用抖音可商用曲库）"
      : "自然旅行感渐进节奏纯音乐（使用抖音可商用曲库）",
    publishTime: nextPublishTime(now),
    liveTheme: contentType === "live" || topic.live_theme ? topic.live_theme || `云游独山子大峡谷：${keyword}现场答疑` : null,
    targetViews,
    targetInteractionRate,
    targetFansGrowth,
  };
}

export function planningRecommendation(topic: PlanningTopic) {
  const action = calculateHotTopicActionScore({
    heatValue: topic.heat_value,
    relevanceScore: topic.relevance_score,
    recommendFollow: Boolean(topic.recommend_follow),
    recommendationReason: topic.recommendation_reason,
    topicName: topic.topic_name,
    keyword: topic.keyword,
    category: topic.category,
    recommendedTitle: topic.recommended_title,
    shootingDirection: topic.shooting_direction,
    liveTheme: topic.live_theme,
  });
  return {
    recommendationLevel: action.level,
    recommendationIndex: topic.prior_effect_score === null || topic.prior_effect_score === undefined
      ? action.tourismConversion
      : clamp(action.tourismConversion * 0.85 + topic.prior_effect_score * 0.15),
    relevanceScore: clamp(topic.relevance_score),
    platform: "douyin" as const,
    contentType: inferPlanningContentType(topic),
    contentTypeLabel: contentTypeLabels[inferPlanningContentType(topic)],
    direction: topicContentDirection(topic.category, "douyin"),
  };
}

export function calculatePlanFeedback(
  target: { targetViews: number; targetInteractionRate: number; targetFansGrowth: number },
  post: FeedbackPost,
) {
  const interactions = post.likes + post.comments + post.favorites + post.shares;
  const interactionRate = post.views > 0 ? interactions / post.views * 100 : 0;
  const viewAchievement = Math.min(1.2, post.views / Math.max(target.targetViews, 1));
  const interactionAchievement = Math.min(1.2, interactionRate / Math.max(target.targetInteractionRate, 0.1));
  const fansAchievement = Math.min(1.2, Math.max(post.fans_growth, 0) / Math.max(target.targetFansGrowth, 1));
  const score = clamp((viewAchievement * 0.5 + interactionAchievement * 0.35 + fansAchievement * 0.15) / 1.2 * 100);
  const result = score >= 75 ? "达到预期" : score >= 50 ? "部分达到预期" : "未达到预期";
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (viewAchievement >= 1) strengths.push("播放达到目标，选题具备流量承接能力");
  else weaknesses.push("播放未达目标，需要强化前三秒和标题利益点");
  if (interactionAchievement >= 1) strengths.push("互动率达到目标，评论引导有效");
  else weaknesses.push("互动率未达目标，结尾问题需要更具体");
  if (fansAchievement >= 1) strengths.push("涨粉达到目标，内容与账号定位匹配");
  else weaknesses.push("涨粉低于目标，需要增加系列关注理由");
  const continueSimilar = score >= 65;
  return {
    score,
    result,
    interactionRate: Number(interactionRate.toFixed(2)),
    summary: `${result}。${strengths.join("；") || "暂无明显超预期维度"}。${weaknesses.join("；") || "核心指标表现均衡"}。${continueSimilar ? "建议继续推荐类似内容，并复用有效结构。" : "暂不建议直接复制，应调整后再进行小样本验证。"}`,
    continueSimilar,
  };
}

export async function refreshContentPlanFeedback(d1: D1Database, now = new Date()) {
  const rows = await d1.prepare(`
    SELECT cp.plan_id, cp.target_views, cp.target_interaction_rate, cp.target_fans_growth,
      p.id AS post_id, p.publish_time, p.views, p.likes, p.comments, p.favorites, p.shares, p.fans_growth
    FROM content_plans cp
    JOIN social_posts p ON p.id = cp.related_post_id
    WHERE julianday(?) - julianday(p.publish_time) >= 7
  `).bind(now.toISOString()).all<{
    plan_id: number; target_views: number; target_interaction_rate: number; target_fans_growth: number;
    post_id: number; publish_time: string; views: number; likes: number; comments: number; favorites: number; shares: number; fans_growth: number;
  }>();
  if (!rows.results.length) return { reviewed: 0 };
  const statements = rows.results.map((row) => {
    const feedback = calculatePlanFeedback({
      targetViews: row.target_views,
      targetInteractionRate: row.target_interaction_rate,
      targetFansGrowth: row.target_fans_growth,
    }, row);
    return d1.prepare(`
      INSERT INTO content_plan_feedback
        (plan_id, post_id, views, likes, comments, favorites, shares, effect_score, ai_summary, evaluated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(plan_id) DO UPDATE SET post_id = excluded.post_id, views = excluded.views,
        likes = excluded.likes, comments = excluded.comments, favorites = excluded.favorites,
        shares = excluded.shares, effect_score = excluded.effect_score,
        ai_summary = excluded.ai_summary, evaluated_at = CURRENT_TIMESTAMP
    `).bind(row.plan_id, row.post_id, row.views, row.likes, row.comments, row.favorites, row.shares, feedback.score, feedback.summary);
  });
  await d1.batch(statements);
  await d1.prepare("UPDATE content_plans SET status = 'reviewed', updated_time = CURRENT_TIMESTAMP WHERE plan_id IN (SELECT plan_id FROM content_plan_feedback)").run();
  return { reviewed: rows.results.length };
}
