export type TopicForAnalysis = {
  id?: number;
  platform: string;
  topic_name: string;
  keyword: string;
  category?: string | null;
  heat_value: number;
  trend: string;
  related_degree?: number | null;
};

export type TopicRecommendation = {
  sourceTopic: string;
  title: string;
  direction: string;
  platform: string;
  shootingAdvice: string;
  relevance: number;
};

export function calculateRelevance(input: {
  topicName: string;
  keyword: string;
  category?: string | null;
  historicalText?: string;
}) {
  const subject = `${input.topicName} ${input.keyword} ${input.category ?? ""}`.toLowerCase();
  let score = 26;
  if (subject.includes("独山子大峡谷")) score += 55;
  else if (subject.includes("独山子")) score += 46;
  else if (subject.includes("大峡谷") || subject.includes("峡谷")) score += 32;

  if (subject.includes("新疆旅游")) score += 45;
  else if (subject.includes("新疆旅行")) score += 43;
  else {
    if (subject.includes("新疆")) score += 28;
    if (subject.includes("旅游") || subject.includes("旅行")) score += 22;
  }
  for (const [signal, weight] of [["自驾", 25], ["独库", 26], ["日落", 18], ["玻璃桥", 18], ["游客", 12], ["周末", 10], ["避暑", 12], ["风景", 10]] as Array<[string, number]>) {
    if (subject.includes(signal)) score += weight;
  }
  if (["旅游", "地域", "文旅", "户外"].some((item) => input.category?.includes(item))) score += 8;
  const historicalText = (input.historicalText ?? "").toLowerCase();
  const keywordTokens = input.keyword.split(/[\s,，#、/]+/).filter((token) => token.length >= 2);
  if (keywordTokens.some((token) => historicalText.includes(token.toLowerCase()))) score += 9;
  if (["新疆旅游", "新疆旅行"].includes(input.keyword.trim())) score += 16;
  return Math.min(99, Math.max(5, score));
}

export interface TopicRecommendationEngine {
  readonly name: string;
  generate(topics: TopicForAnalysis[], historicalPostTitles: string[]): TopicRecommendation[];
}

export const ruleBasedTopicEngine: TopicRecommendationEngine = {
  name: "rules-v1",
  generate(topics, historicalPostTitles) {
    const hasFirstPerson = historicalPostTitles.some((title) => title.includes("第一视角"));
    return topics
      .filter((topic) => topic.trend !== "falling")
      .sort((a, b) => (b.related_degree ?? 0) - (a.related_degree ?? 0) || b.heat_value - a.heat_value)
      .slice(0, 4)
      .map((topic, index) => {
        const keyword = topic.keyword || topic.topic_name;
        const platform = topic.platform === "weibo" ? "weibo" : index % 2 === 0 ? "douyin" : topic.platform;
        return {
          sourceTopic: topic.topic_name,
          title: `在独山子大峡谷遇见${keyword}：游客最真实的一天`,
          direction: `将“${keyword}”与峡谷游览路线、真实体验和实用提示结合，形成可收藏的在地内容。`,
          platform,
          shootingAdvice: hasFirstPerson
            ? "沿用高表现的游客第一视角，前三秒先给峡谷全景，再补路线与安全字幕。"
            : "用游客第一视角开场，前三秒呈现最具冲击力的峡谷画面，并补充路线信息。",
          relevance: Math.round((topic.related_degree ?? 0) * 100),
        };
      });
  },
};
