export const visitorNeedCategories = [
  "旅游攻略",
  "交通路线",
  "价格咨询",
  "项目体验",
  "亲子需求",
  "老人需求",
  "服务评价",
  "其他",
] as const;

export type VisitorNeed = typeof visitorNeedCategories[number];
export type Sentiment = "positive" | "negative" | "neutral";

export type CommentForAnalysis = {
  id: number;
  comment_text: string;
  post_title: string;
};

export type CommentAnalysis = {
  sentiment: Sentiment;
  sentimentScore: number;
  keywords: string[];
  userNeed: VisitorNeed;
  confidence: number;
  matchedRules: string[];
};

const positiveTerms = ["好看", "漂亮", "美丽", "好棒", "哇哦", "震撼", "值得", "喜欢", "推荐", "壮观", "满意", "不错", "太美", "想去", "期待", "方便", "热情", "专业", "赞", "比心", "心动", "👍", "😍", "❤"];
const negativeTerms = ["贵", "失望", "不好", "差", "坑", "危险", "排队", "拥挤", "不方便", "看不清", "脏", "态度差", "没意思", "不值得"];

const needRules: Array<{ category: VisitorNeed; terms: string[] }> = [
  { category: "亲子需求", terms: ["孩子", "小孩", "儿童", "亲子", "宝宝", "婴儿", "带娃"] },
  { category: "老人需求", terms: ["老人", "老年", "父母", "轮椅", "腿脚", "爬不动", "长辈"] },
  { category: "价格咨询", terms: ["多少钱", "票价", "门票", "收费", "价格", "费用", "优惠", "免票"] },
  { category: "交通路线", terms: ["怎么去", "路线", "导航", "停车", "开车", "公交", "交通", "入口", "出口", "距离"] },
  { category: "旅游攻略", terms: ["攻略", "几月份", "几点", "时间", "天气", "开放", "预约", "住宿", "行程", "怎么玩", "注意事项"] },
  { category: "项目体验", terms: ["玻璃桥", "项目", "挑战", "刺激", "体验", "好玩", "达瓦孜", "徒步", "第一视角"] },
  { category: "服务评价", terms: ["服务", "工作人员", "态度", "讲解", "卫生", "管理", "安全", "排队", "设施"] },
];

const suggestionMap: Record<VisitorNeed, { theme: string; title: string; optimization: string }> = {
  旅游攻略: { theme: "独山子大峡谷半日游完整攻略", title: "第一次来独山子大峡谷，这份路线攻略请收好", optimization: "在字幕和置顶评论中补充开放时间、最佳季节、游览时长与注意事项。" },
  交通路线: { theme: "自驾导航与停车实拍", title: "导航到哪里？独山子大峡谷停车入园路线实测", optimization: "用连续镜头展示关键路口、停车场、入口距离和返程路线。" },
  价格咨询: { theme: "门票及项目费用说明", title: "来独山子大峡谷要花多少钱？费用一次讲清", optimization: "价格信息注明更新时间，区分门票、项目与优惠政策，避免模糊表述。" },
  项目体验: { theme: "热门项目第一视角体验", title: "第一视角挑战独山子大峡谷，这个项目敢玩吗？", optimization: "前三秒呈现最强体验画面，中段补安全条件，结尾设置体验投票。" },
  亲子需求: { theme: "亲子游路线与安全提示", title: "带孩子来独山子大峡谷，怎么玩更轻松？", optimization: "明确适龄范围、步行强度、卫生间与休息点，增加家长视角。" },
  老人需求: { theme: "长辈友好游览路线", title: "带父母游独山子大峡谷，这条省力路线更合适", optimization: "标明台阶、坡度、步行距离和休息点，避免只展示高强度体验。" },
  服务评价: { theme: "景区服务与游览保障", title: "从停车到离园，独山子大峡谷服务流程实拍", optimization: "针对高频评价展示工作人员、卫生、安全和客流管理的真实改进。" },
  其他: { theme: "游客真实反馈与评论互动", title: "游客都在关注什么？独山子大峡谷评论区真实反馈", optimization: "优先呈现高频好评与人物亮点，并在结尾引导游客提出路线、价格和体验问题。" },
};

function includesTerm(text: string, term: string) {
  return text.includes(term.toLowerCase());
}

export function analyzeComment(comment: CommentForAnalysis): CommentAnalysis {
  const text = comment.comment_text.toLowerCase();
  const positive = positiveTerms.filter((term) => includesTerm(text, term));
  const negative = negativeTerms.filter((term) => includesTerm(text, term));
  const sentimentScore = Math.max(-100, Math.min(100, (positive.length - negative.length) * 35));
  const sentiment: Sentiment = sentimentScore > 0 ? "positive" : sentimentScore < 0 ? "negative" : "neutral";

  const categoryMatches = needRules.map((rule) => ({
    ...rule,
    matches: rule.terms.filter((term) => includesTerm(text, term)),
  })).filter((rule) => rule.matches.length).sort((a, b) => b.matches.length - a.matches.length);
  const best = categoryMatches[0];
  const userNeed = best?.category ?? "其他";
  const keywords = [...new Set([
    ...(best?.matches ?? []),
    ...positive,
    ...negative,
  ])].slice(0, 5);
  const evidenceCount = keywords.length;

  return {
    sentiment,
    sentimentScore,
    keywords: keywords.length ? keywords : ["一般反馈"],
    userNeed,
    confidence: Math.min(0.96, Number((0.55 + Math.min(4, evidenceCount) * 0.09).toFixed(2))),
    matchedRules: categoryMatches.slice(0, 3).map((item) => `${item.category}:${item.matches.join("/")}`),
  };
}

export function buildOperatingSuggestions(needs: Array<{ name: VisitorNeed; count: number }>) {
  return needs.filter((item) => item.count > 0).slice(0, 3).map((item) => ({
    need: item.name,
    evidenceCount: item.count,
    ...suggestionMap[item.name],
  }));
}

export const commentInsightEngine = {
  name: "comment-rules-v1",
  futureEndpoint: "/api/v1/social/ai/comment-insights",
};
