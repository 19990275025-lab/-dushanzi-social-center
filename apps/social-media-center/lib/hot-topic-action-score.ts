export type HotTopicActionLevel = "A" | "B" | "C";

type ActionScoreInput = {
  heatValue: number;
  relevanceScore: number;
  recommendFollow: boolean;
  recommendationReason: string | null;
  topicName: string;
  keyword: string;
  category: string | null;
  recommendedTitle: string | null;
  shootingDirection: string | null;
  liveTheme: string | null;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

export function recommendationLevel(input: Pick<ActionScoreInput, "relevanceScore" | "recommendFollow" | "recommendationReason">): HotTopicActionLevel {
  if (input.recommendFollow && input.relevanceScore >= 80) return "A";
  if (input.recommendationReason?.includes("具备借势价值") || input.relevanceScore >= 50) return "B";
  return "C";
}

export function calculateHotTopicActionScore(input: ActionScoreInput) {
  const heat = clamp(input.heatValue);
  const relevance = clamp(input.relevanceScore);
  const actionCompleteness = [input.recommendedTitle, input.shootingDirection, input.liveTheme]
    .filter((value) => Boolean(value?.trim())).length * 20;
  const categoryFit = /旅游|自驾|景区|自然|新媒体|交通|文创|户外|摄影|活动/.test(input.category ?? "") ? 25 : 10;
  const contentFit = clamp(actionCompleteness + categoryFit + relevance * 0.15);
  const commercialText = `${input.topicName} ${input.keyword} ${input.category ?? ""}`;
  const commercial = /攻略|自驾|路线|门票|预约|亲子|避暑|打卡|直播|文创|消费|研学|住宿/.test(commercialText)
    ? 90
    : /新疆|旅游|景区|风景|户外|摄影|旅行|活动/.test(commercialText) ? 75 : 55;
  const tourismConversion = clamp(heat * 0.2 + relevance * 0.35 + contentFit * 0.25 + commercial * 0.2);
  return {
    level: recommendationLevel(input),
    tourismConversion,
    components: { heat, relevance, contentFit, commercial },
  };
}

export function topicContentDirection(category: string | null, platform: string) {
  const platformDirection = platform === "douyin"
    ? "短视频强钩子"
    : platform === "kuaishou" ? "真实互动与直播承接" : platform === "weibo" ? "品牌话题传播" : "多平台内容验证";
  return `${category || "热点借势"} · ${platformDirection}`;
}
