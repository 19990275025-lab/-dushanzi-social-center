export const WORKBUDDY_REPORT_SOURCE = "WorkBuddy热点监测报告";

export type WorkBuddyReportAnalysis = {
  topic_name: string;
  relevance_score: number;
  recommend_follow: boolean;
  recommendation_reason: string;
  recommended_title: string;
  shooting_direction: string;
  live_theme: string;
};

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " ",
  };
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function extract(block: string, pattern: RegExp) {
  const match = block.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

export function parseWorkBuddyReportAnalyses(html: string): WorkBuddyReportAnalysis[] {
  const analyses: WorkBuddyReportAnalysis[] = [];
  for (const block of html.split(/<div class="card">/i).slice(1)) {
    const topicName = extract(block, /<h3>([\s\S]*?)<\/h3>/i);
    const suitability = extract(block, /<span class="suit-(?:high|mid|low)">([\s\S]*?)<\/span>/i);
    const relevanceScore = Number(block.match(/关联度：\s*(\d+(?:\.\d+)?)\s*\/\s*100/i)?.[1]);
    const shootingDirection = extract(block, /推荐拍摄方向：<\/strong>([\s\S]*?)<\/p>/i);
    const recommendedTitle = extract(block, /推荐短视频标题：<\/strong>([\s\S]*?)<\/p>/i);
    const liveTheme = extract(block, /推荐直播主题：<\/strong>([\s\S]*?)<\/p>/i);
    if (!topicName || !Number.isFinite(relevanceScore) || !shootingDirection || !recommendedTitle || !liveTheme) continue;

    const recommendFollow = suitability.includes("适合借势") && !suitability.includes("不适合");
    const recommendationReason = suitability.includes("不适合")
      ? `报告判断关联度为${relevanceScore}分，不建议直接跟进；可参考其表达方式或风险提示。`
      : suitability.includes("谨慎")
        ? `报告判断关联度为${relevanceScore}分，具备借势价值，但需结合独山子大峡谷真实场景谨慎转化。`
        : `报告判断关联度为${relevanceScore}分，与独山子大峡谷资源和游客需求高度相关，建议优先跟进。`;
    analyses.push({
      topic_name: topicName,
      relevance_score: relevanceScore,
      recommend_follow: recommendFollow,
      recommendation_reason: recommendationReason,
      recommended_title: recommendedTitle,
      shooting_direction: shootingDirection,
      live_theme: liveTheme,
    });
  }
  return analyses;
}
