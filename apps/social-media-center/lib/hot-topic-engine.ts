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

export const HOT_TOPIC_CATEGORIES = ["旅游", "新疆", "自驾", "户外", "摄影", "活动", "人物", "其他"] as const;

export function classifyHotTopic(topicName: string) {
  const text = topicName.toLowerCase();
  if (/新疆|独山子|独库|草原|火把节|民俗/.test(text)) return "新疆";
  if (/自驾|公路|开车|慢充/.test(text)) return "自驾";
  if (/旅行|旅游|暑期|美食|海滩/.test(text)) return "旅游";
  if (/徒步|户外|露营|登山|健身/.test(text)) return "户外";
  if (/摄影|随拍|拍照|镜头/.test(text)) return "摄影";
  if (/节|赛事|决赛|挑战|活动|演出|大会|展/.test(text)) return "活动";
  if (/嘉宾|少年|学长|白鹿|杨洋|陈楚生|王玉雯|宋茜|拜登|伦纳德/.test(text)) return "人物";
  return "其他";
}

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
  for (const [signal, weight] of [["自驾", 25], ["独库", 26], ["日落", 18], ["玻璃桥", 18], ["游客", 12], ["周末", 10], ["避暑", 12], ["风景", 10], ["草原", 24], ["徒步", 25], ["户外", 20], ["摄影", 18], ["随拍", 15], ["民俗", 26], ["火把节", 28], ["治愈", 15], ["暑期", 8]] as Array<[string, number]>) {
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
