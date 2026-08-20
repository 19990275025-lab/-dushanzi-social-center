export type EvaluationAvailability = "available" | "partial" | "expired" | "unavailable" | "failed";

export type ContentEffectFact = {
  id: number;
  accountId: number;
  platform: string;
  title: string;
  postType: string;
  contentType: string;
  publishTime: string;
  snapshotTime: string | null;
  sourceRecordStatus: string;
  dataAvailabilityStatus: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  favorites: number | null;
  shares: number | null;
  followerGain: number | null;
  durationSeconds: number | null;
  actualLoadedCount: number | null;
  commentRowsCount: number;
  traffic: {
    completionRate: number | null;
    averagePlayDurationSeconds: number | null;
    twoSecBounceRate: number | null;
    fiveSecCompletionRate: number | null;
    averagePlayRatio: number | null;
    pageEntryRate: number | null;
    textExpandRate: number | null;
    textCompletionRate: number | null;
    averageImagesViewed: number | null;
  };
  trafficSources: Array<{ name: string; percentage: number | null; value: number | null; nature: string }>;
  paidTraffic: Array<{
    campaignType: string;
    playCount: number | null;
    relationshipToOverview: "additional" | "included" | "unknown";
    availability: EvaluationAvailability;
  }>;
  audience: Array<{
    dimensionType: string;
    dimensionName: string;
    percentage: number | null;
    value: number | null;
  }>;
  commentKeywords: Array<{ keyword: string; rank: number | null }>;
  commentSamples: Array<{
    text: string | null;
    type: string;
    likes: number | null;
    sentiment: string;
  }>;
  metricSeries: Array<{
    metricType: string;
    seriesName: string;
    pointIndex: number;
    pointTime: string | null;
    value: number;
  }>;
};

export type EvaluationDimension = {
  score: number | null;
  maxScore: number;
  confidence: number;
  availableIndicators: number;
  totalIndicators: number;
  evidence: string[];
};

export type ContentEffectEvaluation = {
  postId: number;
  overallScore: number | null;
  grade: "S" | "A" | "B" | "C" | "D" | null;
  gradeLabel: string;
  labels: string[];
  dimensions: {
    propagation: EvaluationDimension;
    interaction: EvaluationDimension;
    attraction: EvaluationDimension;
    efficiency: EvaluationDimension;
  };
  dataCompleteness: number;
  dataConfidence: "low" | "medium" | "high";
  naturalPerformanceConfidence: "low" | "medium" | "high";
  naturalEvidenceViews: number | null;
  paidViews: number;
  rankingSignals: {
    naturalPropagation: number | null;
    interactionQuality: number | null;
    completionPerformance: number | null;
    followerGrowth: number | null;
  };
  historicalBaseline: {
    sampleSize: number;
    detailedSampleSize: number;
    last7Days: number;
    last30Days: number;
    medianViews: number | null;
    top25Views: number | null;
    top10Views: number | null;
    sampleInsufficient: boolean;
    message: string | null;
  };
  isNaturalBreakout: boolean;
  isPaidAmplifiedHighPlay: boolean;
  diagnosis: {
    performanceConclusion: string;
    strengths: string[];
    problems: string[];
    trafficAssessment: string;
    audienceFeatures: string;
    commentFeedback: string;
    paidImpact: string;
    nextOptimization: string[];
  };
};

type Indicator = { label: string; score: number | null; weight: number; evidence?: string };

const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function valid(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function percentileScore(value: number | null, population: Array<number | null>, lowerIsBetter = false) {
  if (!valid(value)) return null;
  const values = population.filter(valid);
  if (values.length < 2) return 50;
  const below = values.filter((item) => item < value).length;
  const equal = values.filter((item) => item === value).length;
  const percentile = ((below + Math.max(0, equal - 1) / 2) / Math.max(1, values.length - 1)) * 100;
  return round(lowerIsBetter ? 100 - percentile : percentile);
}

function weightedDimension(indicators: Indicator[], maxScore: number): EvaluationDimension {
  const available = indicators.filter((item) => valid(item.score));
  const totalWeight = indicators.reduce((sum, item) => sum + item.weight, 0);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const normalized = availableWeight
    ? available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / availableWeight
    : 0;
  return {
    score: availableWeight ? round((normalized / 100) * maxScore) : null,
    maxScore,
    confidence: round(totalWeight ? (availableWeight / totalWeight) * 100 : 0),
    availableIndicators: available.length,
    totalIndicators: indicators.length,
    evidence: available.map((item) => item.evidence).filter((item): item is string => Boolean(item)),
  };
}

function overallScore(dimensions: EvaluationDimension[]) {
  const available = dimensions.filter((dimension) => valid(dimension.score));
  if (!available.length) return null;
  const availableWeight = available.reduce((sum, dimension) => sum + dimension.maxScore, 0);
  return round(available.reduce((sum, dimension) => (
    sum + ((dimension.score as number) / dimension.maxScore) * dimension.maxScore
  ), 0) / availableWeight * 100);
}

function rate(value: number | null, denominator: number | null) {
  return valid(value) && valid(denominator) && denominator > 0 ? (value / denominator) * 100 : null;
}

function sourcePercentage(post: ContentEffectFact, pattern: RegExp) {
  const values = post.trafficSources.filter((item) => pattern.test(item.name)).map((item) => item.percentage).filter(valid);
  return values.length ? values.reduce((sum, item) => sum + item, 0) : null;
}

function naturalEvidence(post: ContentEffectFact) {
  const paidViews = post.paidTraffic.reduce((sum, item) => sum + (item.playCount ?? 0), 0);
  if (!post.paidTraffic.length) return { views: post.views, confidence: "high" as const, paidViews };
  if (post.paidTraffic.every((item) => item.relationshipToOverview === "additional")) {
    return { views: post.views, confidence: "high" as const, paidViews };
  }
  return { views: null, confidence: "low" as const, paidViews };
}

function ageHours(post: ContentEffectFact) {
  if (!post.snapshotTime) return null;
  const start = Date.parse(post.publishTime);
  const end = Date.parse(post.snapshotTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.max(1, (end - start) / 3_600_000);
}

function trendStrength(post: ContentEffectFact) {
  const points = post.metricSeries
    .filter((item) => item.metricType === "play" && item.seriesName === "hourly_new")
    .sort((a, b) => a.pointIndex - b.pointIndex)
    .map((item) => item.value);
  if (points.length < 6) return null;
  const windowSize = Math.min(12, Math.floor(points.length / 2));
  const recent = points.slice(-windowSize).reduce((sum, item) => sum + item, 0) / windowSize;
  const previous = points.slice(-windowSize * 2, -windowSize).reduce((sum, item) => sum + item, 0) / windowSize;
  return previous > 0 ? recent / previous : recent > 0 ? 2 : 0;
}

function retentionStrength(post: ContentEffectFact) {
  const points = post.metricSeries.filter((item) => item.metricType === "retention" && item.seriesName === "current");
  if (!points.length) return null;
  return points.reduce((sum, item) => sum + item.value, 0) / points.length;
}

function commentQuality(post: ContentEffectFact) {
  if (!post.commentSamples.length) return null;
  const substantive = post.commentSamples.filter((item) => (item.text?.trim().length ?? 0) >= 4).length;
  const positive = post.commentSamples.filter((item) => item.sentiment === "positive").length;
  const liked = post.commentSamples.filter((item) => valid(item.likes) && item.likes > 0).length;
  return ((substantive / post.commentSamples.length) * 60) + ((positive / post.commentSamples.length) * 25) + ((liked / post.commentSamples.length) * 15);
}

function audienceMatch(post: ContentEffectFact) {
  if (!post.audience.length) return null;
  const percentageFor = (type: string, pattern: RegExp) => post.audience
    .filter((item) => item.dimensionType === type && pattern.test(item.dimensionName) && valid(item.percentage))
    .reduce((sum, item) => sum + (item.percentage as number), 0);
  const age = percentageFor("age", /24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|24-30|31-40|41-50/);
  const interest = percentageFor("interest", /旅行|旅游|自驾|户外|摄影|亲子|汽车|风景/);
  const local = percentageFor("region", /新疆/);
  const parts = [age ? { score: clamp(age), weight: 35 } : null, interest ? { score: clamp(interest * 2), weight: 40 } : null, local ? { score: clamp(local * 3), weight: 25 } : null]
    .filter((item): item is { score: number; weight: number } => Boolean(item));
  if (!parts.length) return null;
  return parts.reduce((sum, item) => sum + item.score * item.weight, 0) / parts.reduce((sum, item) => sum + item.weight, 0);
}

function topAudience(post: ContentEffectFact, type: string, limit = 3) {
  return post.audience.filter((item) => item.dimensionType === type && valid(item.percentage))
    .sort((a, b) => (b.percentage as number) - (a.percentage as number)).slice(0, limit);
}

function formatPercent(value: number | null) {
  return valid(value) ? `${round(value, 2)}%` : "平台未提供";
}

function confidenceText(value: "low" | "medium" | "high") {
  return value === "high" ? "高" : value === "medium" ? "中" : "低";
}

function postType(post: ContentEffectFact) {
  const value = `${post.postType} ${post.contentType}`.toLowerCase();
  return /图文|image|photo/.test(value) ? "image" : "video";
}

function gradeFromScore(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

const gradeRank = { D: 0, C: 1, B: 2, A: 3, S: 4 } as const;
function capGrade(grade: "S" | "A" | "B" | "C" | "D", cap: "S" | "A" | "B" | "C" | "D") {
  return gradeRank[grade] > gradeRank[cap] ? cap : grade;
}

const gradeLabels = { S: "自然爆款", A: "优秀内容", B: "正常内容", C: "需要优化", D: "低效内容" } as const;

function buildPools(posts: ContentEffectFact[]) {
  const numberPool = (read: (post: ContentEffectFact) => number | null) => posts.map(read);
  return {
    naturalViews: numberPool((post) => naturalEvidence(post).views),
    velocity: numberPool((post) => {
      const natural = naturalEvidence(post).views;
      const hours = ageHours(post);
      return valid(natural) && valid(hours) ? natural / hours : null;
    }),
    trend: numberPool(trendStrength),
    recommendation: numberPool((post) => sourcePercentage(post, /推荐/)),
    search: numberPool((post) => sourcePercentage(post, /搜索/)),
    likeRate: numberPool((post) => rate(post.likes, post.views)),
    commentRate: numberPool((post) => rate(post.comments, post.views)),
    favoriteRate: numberPool((post) => rate(post.favorites, post.views)),
    shareRate: numberPool((post) => rate(post.shares, post.views)),
    followerRate: numberPool((post) => rate(post.followerGain, post.views)),
    pageEntry: numberPool((post) => post.traffic.pageEntryRate),
    followSource: numberPool((post) => sourcePercentage(post, /关注页/)),
    completion: numberPool((post) => post.traffic.completionRate),
    playRatio: numberPool((post) => post.traffic.averagePlayRatio),
    durationRatio: numberPool((post) => valid(post.traffic.averagePlayDurationSeconds) && valid(post.durationSeconds) && post.durationSeconds > 0 ? (post.traffic.averagePlayDurationSeconds / post.durationSeconds) * 100 : null),
    bounce: numberPool((post) => post.traffic.twoSecBounceRate),
    fiveSec: numberPool((post) => post.traffic.fiveSecCompletionRate),
    retention: numberPool(retentionStrength),
    textCompletion: numberPool((post) => post.traffic.textCompletionRate),
    textExpand: numberPool((post) => post.traffic.textExpandRate),
    imagesViewed: numberPool((post) => post.traffic.averageImagesViewed),
    commentQuality: numberPool(commentQuality),
    keywords: numberPool((post) => post.commentKeywords.length),
  };
}

export function evaluateContentEffects(allPosts: ContentEffectFact[], selectedIds?: Set<number>): ContentEffectEvaluation[] {
  const rankable = allPosts.filter((post) => !["private", "failed", "unavailable"].includes(post.sourceRecordStatus));
  const pools = buildPools(rankable);
  const published = rankable.map((post) => Date.parse(post.publishTime)).filter(Number.isFinite);
  const referenceTime = published.length ? Math.max(...published, Date.now()) : Date.now();
  const historicalViews = rankable.map((post) => naturalEvidence(post).views).filter(valid);
  const detailedSampleSize = rankable.filter((post) => post.metricSeries.length || post.trafficSources.length || post.audience.length).length;
  const baseline = {
    sampleSize: historicalViews.length,
    detailedSampleSize,
    last7Days: rankable.filter((post) => referenceTime - Date.parse(post.publishTime) <= 7 * 86_400_000).length,
    last30Days: rankable.filter((post) => referenceTime - Date.parse(post.publishTime) <= 30 * 86_400_000).length,
    medianViews: quantile(historicalViews, 0.5),
    top25Views: quantile(historicalViews, 0.75),
    top10Views: quantile(historicalViews, 0.9),
    sampleInsufficient: historicalViews.length < 10 || detailedSampleSize < 10,
  };

  return allPosts.filter((post) => !selectedIds || selectedIds.has(post.id)).map((post) => {
    if (post.sourceRecordStatus === "private") {
      const empty = weightedDimension([], 100);
      return {
        postId: post.id, overallScore: null, grade: null, gradeLabel: "私密作品", labels: ["私密作品", "数据不足"],
        dimensions: { propagation: { ...empty, maxScore: 30 }, interaction: { ...empty, maxScore: 25 }, attraction: { ...empty, maxScore: 25 }, efficiency: { ...empty, maxScore: 20 } },
        dataCompleteness: 0, dataConfidence: "low", naturalPerformanceConfidence: "low", naturalEvidenceViews: null, paidViews: 0,
        rankingSignals: { naturalPropagation: null, interactionQuality: null, completionPerformance: null, followerGrowth: null },
        historicalBaseline: { ...baseline, message: "私密作品不参与正常排名。" }, isNaturalBreakout: false, isPaidAmplifiedHighPlay: false,
        diagnosis: { performanceConclusion: "私密作品不参与内容效果评价。", strengths: [], problems: ["平台未提供公开表现数据"], trafficAssessment: "私密作品无可评价流量结构。", audienceFeatures: "平台未提供作品观众画像。", commentFeedback: "平台未提供评论数据。", paidImpact: "未发现可核验付费流量。", nextOptimization: ["如需评价，请在作品公开且平台提供数据后重新采集。"] },
      };
    }

    const natural = naturalEvidence(post);
    const viewsPerHour = valid(natural.views) && valid(ageHours(post)) ? natural.views / (ageHours(post) as number) : null;
    const recommendation = sourcePercentage(post, /推荐/);
    const search = sourcePercentage(post, /搜索/);
    const followSource = sourcePercentage(post, /关注页/);
    const likeRate = rate(post.likes, post.views);
    const commentRate = rate(post.comments, post.views);
    const favoriteRate = rate(post.favorites, post.views);
    const shareRate = rate(post.shares, post.views);
    const followerRate = rate(post.followerGain, post.views);
    const quality = commentQuality(post);
    const match = audienceMatch(post);
    const trend = trendStrength(post);
    const retention = retentionStrength(post);

    const propagation = weightedDimension([
      { label: "账号播放分位", weight: 25, score: percentileScore(natural.views, pools.naturalViews), evidence: valid(natural.views) ? `可核验自然口径播放 ${natural.views}` : undefined },
      { label: "播放增长速度", weight: 20, score: percentileScore(viewsPerHour, pools.velocity), evidence: valid(viewsPerHour) ? `发布至快照平均每小时 ${round(viewsPerHour)} 播放` : undefined },
      { label: "趋势曲线", weight: 20, score: percentileScore(trend, pools.trend), evidence: valid(trend) ? `最近时段播放增量为前一时段 ${round(trend, 2)} 倍` : undefined },
      { label: "推荐流量", weight: 15, score: percentileScore(recommendation, pools.recommendation), evidence: valid(recommendation) ? `推荐流量 ${formatPercent(recommendation)}` : undefined },
      { label: "搜索流量", weight: 5, score: percentileScore(search, pools.search), evidence: valid(search) ? `搜索流量 ${formatPercent(search)}` : undefined },
      { label: "分享传播", weight: 15, score: percentileScore(shareRate, pools.shareRate), evidence: valid(shareRate) ? `分享率 ${formatPercent(shareRate)}` : undefined },
    ], 30);

    const interaction = weightedDimension([
      { label: "点赞率", weight: 25, score: percentileScore(likeRate, pools.likeRate), evidence: valid(likeRate) ? `点赞率 ${formatPercent(likeRate)}` : undefined },
      { label: "评论率", weight: 20, score: percentileScore(commentRate, pools.commentRate), evidence: valid(commentRate) ? `评论率 ${formatPercent(commentRate)}` : undefined },
      { label: "收藏率", weight: 20, score: percentileScore(favoriteRate, pools.favoriteRate), evidence: valid(favoriteRate) ? `收藏率 ${formatPercent(favoriteRate)}` : undefined },
      { label: "分享率", weight: 20, score: percentileScore(shareRate, pools.shareRate), evidence: valid(shareRate) ? `分享率 ${formatPercent(shareRate)}` : undefined },
      { label: "评论质量", weight: 10, score: percentileScore(quality, pools.commentQuality), evidence: valid(quality) ? `${post.commentSamples.length} 条真实评论，文本质量得分 ${round(quality)}` : undefined },
      { label: "评论热词", weight: 5, score: post.commentKeywords.length ? percentileScore(post.commentKeywords.length, pools.keywords) : null, evidence: post.commentKeywords.length ? `${post.commentKeywords.length} 个平台评论热词` : undefined },
    ], 25);

    const attraction = weightedDimension([
      { label: "新增关注", weight: 25, score: percentileScore(followerRate, pools.followerRate), evidence: valid(followerRate) ? `作品涨粉率 ${formatPercent(followerRate)}` : undefined },
      { label: "主页访问", weight: 20, score: percentileScore(post.traffic.pageEntryRate, pools.pageEntry), evidence: valid(post.traffic.pageEntryRate) ? `主页/详情进入率 ${formatPercent(post.traffic.pageEntryRate)}` : undefined },
      { label: "关注页流量", weight: 10, score: percentileScore(followSource, pools.followSource), evidence: valid(followSource) ? `关注页流量 ${formatPercent(followSource)}` : undefined },
      { label: "目标游客匹配", weight: 30, score: match, evidence: valid(match) ? `真实作品观众匹配度 ${round(match)} 分` : undefined },
      { label: "评论反馈", weight: 15, score: quality, evidence: valid(quality) ? `${post.commentSamples.length} 条真实评论参与反馈判断` : undefined },
    ], 25);

    const videoIndicators: Indicator[] = [
      { label: "完播率", weight: 25, score: percentileScore(post.traffic.completionRate, pools.completion), evidence: valid(post.traffic.completionRate) ? `完播率 ${formatPercent(post.traffic.completionRate)}` : undefined },
      { label: "平均播放进度", weight: 20, score: percentileScore(post.traffic.averagePlayRatio, pools.playRatio), evidence: valid(post.traffic.averagePlayRatio) ? `平均播放进度 ${formatPercent(post.traffic.averagePlayRatio)}` : undefined },
      { label: "平均观看时长", weight: 20, score: percentileScore(valid(post.traffic.averagePlayDurationSeconds) && valid(post.durationSeconds) && post.durationSeconds > 0 ? (post.traffic.averagePlayDurationSeconds / post.durationSeconds) * 100 : null, pools.durationRatio), evidence: valid(post.traffic.averagePlayDurationSeconds) ? `平均观看 ${post.traffic.averagePlayDurationSeconds} 秒` : undefined },
      { label: "2秒跳出", weight: 15, score: percentileScore(post.traffic.twoSecBounceRate, pools.bounce, true), evidence: valid(post.traffic.twoSecBounceRate) ? `2秒跳出率 ${formatPercent(post.traffic.twoSecBounceRate)}` : undefined },
      { label: "5秒完播", weight: 10, score: percentileScore(post.traffic.fiveSecCompletionRate, pools.fiveSec), evidence: valid(post.traffic.fiveSecCompletionRate) ? `5秒完播率 ${formatPercent(post.traffic.fiveSecCompletionRate)}` : undefined },
      { label: "留存趋势", weight: 10, score: percentileScore(retention, pools.retention), evidence: valid(retention) ? `真实留存曲线均值 ${formatPercent(retention)}` : undefined },
    ];
    const imageIndicators: Indicator[] = [
      { label: "文字读完率", weight: 30, score: percentileScore(post.traffic.textCompletionRate, pools.textCompletion), evidence: valid(post.traffic.textCompletionRate) ? `文字读完率 ${formatPercent(post.traffic.textCompletionRate)}` : undefined },
      { label: "文字展开率", weight: 20, score: percentileScore(post.traffic.textExpandRate, pools.textExpand), evidence: valid(post.traffic.textExpandRate) ? `文字展开率 ${formatPercent(post.traffic.textExpandRate)}` : undefined },
      { label: "平均浏览图片", weight: 25, score: percentileScore(post.traffic.averageImagesViewed, pools.imagesViewed), evidence: valid(post.traffic.averageImagesViewed) ? `平均浏览 ${post.traffic.averageImagesViewed} 张` : undefined },
      { label: "收藏效率", weight: 15, score: percentileScore(favoriteRate, pools.favoriteRate), evidence: valid(favoriteRate) ? `收藏率 ${formatPercent(favoriteRate)}` : undefined },
      { label: "评论效率", weight: 10, score: percentileScore(commentRate, pools.commentRate), evidence: valid(commentRate) ? `评论率 ${formatPercent(commentRate)}` : undefined },
    ];
    const efficiency = weightedDimension(postType(post) === "image" ? imageIndicators : videoIndicators, 20);

    const rawScore = overallScore([propagation, interaction, attraction, efficiency]);
    const completeness = round(propagation.confidence * 0.3 + interaction.confidence * 0.25 + attraction.confidence * 0.25 + efficiency.confidence * 0.2);
    const dataConfidence = completeness >= 75 ? "high" : completeness >= 45 ? "medium" : "low";
    if (rawScore === null) {
      return {
        postId: post.id,
        overallScore: null,
        grade: null,
        gradeLabel: "数据不足",
        labels: ["数据不足", ...(post.dataAvailabilityStatus === "expired" ? ["平台数据过期"] : [])],
        dimensions: { propagation, interaction, attraction, efficiency },
        dataCompleteness: completeness,
        dataConfidence,
        naturalPerformanceConfidence: natural.confidence,
        naturalEvidenceViews: natural.views,
        paidViews: natural.paidViews,
        rankingSignals: { naturalPropagation: null, interactionQuality: null, completionPerformance: null, followerGrowth: null },
        historicalBaseline: { ...baseline, message: "可用指标不足，暂时无法生成内容效果评分。" },
        isNaturalBreakout: false,
        isPaidAmplifiedHighPlay: false,
        diagnosis: {
          performanceConclusion: "可用指标不足，未生成综合评分。",
          strengths: [],
          problems: [`数据完整度 ${completeness}%`],
          trafficAssessment: "平台未提供足够的流量结构证据。",
          audienceFeatures: "平台未提供足够的作品级观众画像。",
          commentFeedback: post.commentSamples.length ? `已保存 ${post.commentSamples.length} 条真实评论，但其他评价指标不足。` : "本次没有可分析评论正文。",
          paidImpact: natural.paidViews > 0 ? `已识别 DOU+ ${natural.paidViews} 播放，不作自然爆款判定。` : "未发现 DOU+ 记录。",
          nextOptimization: ["等待平台提供更完整的趋势、流量、观众或内容效率指标后重新评价。"],
        },
      };
    }
    let grade = gradeFromScore(rawScore);
    if (completeness < 40) grade = capGrade(grade, "D");
    else if (completeness < 60) grade = capGrade(grade, "C");
    else if (completeness < 75) grade = capGrade(grade, "B");
    if (baseline.sampleInsufficient) grade = capGrade(grade, "A");
    if (natural.paidViews > 0 || natural.confidence !== "high") grade = capGrade(grade, "A");

    const isNaturalBreakout = grade === "S" && natural.paidViews === 0 && natural.confidence === "high" && valid(natural.views) && valid(baseline.top10Views) && natural.views >= baseline.top10Views;
    const isPaidAmplifiedHighPlay = natural.paidViews > 0 && valid(post.views) && valid(baseline.top25Views) && post.views >= baseline.top25Views;
    if (grade === "S" && !isNaturalBreakout) grade = "A";
    const labels: string[] = [];
    if (natural.paidViews > 0) labels.push("含付费流量");
    if (isNaturalBreakout) labels.push("自然爆款");
    if (isPaidAmplifiedHighPlay) labels.push("投流放大型高播放作品");
    if (completeness < 60) labels.push("数据不足");
    if (post.dataAvailabilityStatus === "expired") labels.push("平台数据过期");

    const strengths: string[] = [];
    if (valid(propagation.score) && propagation.score >= 20) strengths.push(`传播力 ${propagation.score}/30；${propagation.evidence.slice(0, 2).join("，")}`);
    if (valid(interaction.score) && interaction.score >= 16) strengths.push(`互动质量 ${interaction.score}/25；${interaction.evidence.slice(0, 2).join("，")}`);
    if (valid(attraction.score) && attraction.score >= 16) strengths.push(`用户吸引力 ${attraction.score}/25；${attraction.evidence.slice(0, 2).join("，")}`);
    if (valid(efficiency.score) && efficiency.score >= 13) strengths.push(`内容效率 ${efficiency.score}/20；${efficiency.evidence.slice(0, 2).join("，")}`);
    if (!strengths.length) {
      const availableDimensions = [["传播力", propagation.score], ["互动质量", interaction.score], ["用户吸引力", attraction.score], ["内容效率", efficiency.score]]
        .filter((item): item is [string, number] => valid(item[1] as number | null))
        .sort((a, b) => b[1] - a[1]);
      strengths.push(`当前最高维度为${availableDimensions[0]?.[0] ?? "暂无"}，仍需更多真实指标验证。`);
    }

    const problems: string[] = [];
    if (valid(post.traffic.twoSecBounceRate) && post.traffic.twoSecBounceRate >= 50) problems.push(`2秒跳出率 ${formatPercent(post.traffic.twoSecBounceRate)}，开场流失明显`);
    if (valid(post.traffic.completionRate) && post.traffic.completionRate < 10) problems.push(`完播率仅 ${formatPercent(post.traffic.completionRate)}`);
    if (valid(commentRate) && commentRate < 0.3) problems.push(`评论率仅 ${formatPercent(commentRate)}，互动深度偏弱`);
    if (valid(favoriteRate) && favoriteRate < 0.2) problems.push(`收藏率仅 ${formatPercent(favoriteRate)}，可保存信息不足`);
    if (natural.paidViews > 0) problems.push(`含 DOU+ ${natural.paidViews} 播放，不能仅凭总曝光判断自然传播`);
    if (completeness < 75) problems.push(`数据完整度 ${completeness}%，部分维度置信度有限`);

    const topSources = [...post.trafficSources].filter((item) => valid(item.percentage)).sort((a, b) => (b.percentage as number) - (a.percentage as number)).slice(0, 2);
    const trafficAssessment = topSources.length
      ? `主要流量来自${topSources.map((item) => `${item.name}${formatPercent(item.percentage)}`).join("、")}；自然表现可信度为${confidenceText(natural.confidence)}。`
      : `平台未提供可核验流量来源；自然表现可信度为${confidenceText(natural.confidence)}。`;
    const audienceParts = [
      ...topAudience(post, "age", 1).map((item) => `年龄以${item.dimensionName}（${formatPercent(item.percentage)}）为主`),
      ...topAudience(post, "region", 2).map((item) => `${item.dimensionName}（${formatPercent(item.percentage)}）`),
      ...topAudience(post, "interest", 2).map((item) => `兴趣${item.dimensionName}（${formatPercent(item.percentage)}）`),
    ];
    const audienceFeatures = audienceParts.length ? audienceParts.join("；") : "平台未提供作品级观众画像。";
    const commentFeedback = post.commentSamples.length
      ? `平台评论总览 ${post.comments ?? "未提供"} 条，本次真实读取 ${post.commentSamples.length} 条；${post.commentKeywords.length ? `热词：${post.commentKeywords.slice(0, 5).map((item) => item.keyword).join("、")}` : "平台未提供评论热词"}。`
      : `平台评论总览 ${post.comments ?? "未提供"} 条，但本次没有可分析评论正文。`;
    const paidImpact = natural.paidViews > 0
      ? `DOU+ ${natural.paidViews} 播放已独立处理；${natural.confidence === "high" ? `基础播放 ${post.views ?? "未提供"} 采用平台明确的独立口径` : "平台未明确自然与付费拆分，未执行“总播放－DOU+”推算"}。`
      : "未发现 DOU+ 记录，当前播放可作为自然表现证据。";

    const nextOptimization: string[] = [];
    if (valid(post.traffic.twoSecBounceRate) && post.traffic.twoSecBounceRate >= 50) nextOptimization.push(`当前2秒跳出率 ${formatPercent(post.traffic.twoSecBounceRate)}；下一条首2秒直接展示峡谷尺度、项目结果或游客反应，删除环境铺垫。`);
    if (valid(post.traffic.completionRate) && post.traffic.completionRate < 10) nextOptimization.push(`当前完播率 ${formatPercent(post.traffic.completionRate)}；下一条围绕一个游客问题压缩镜头，并在中段补路线、项目或安全信息。`);
    if (valid(commentRate) && commentRate < 0.3) nextOptimization.push(`当前评论率 ${formatPercent(commentRate)}；结尾改成“自驾路线/项目选择/最佳机位”具体问题，避免泛化求评论。`);
    if (valid(favoriteRate) && favoriteRate < 0.2) nextOptimization.push(`当前收藏率 ${formatPercent(favoriteRate)}；增加可保存的路线、时间、机位或项目清单。`);
    if (natural.paidViews > 0) nextOptimization.push(`该作品含 DOU+ ${natural.paidViews} 播放；下一条先观察首个自然窗口的播放与互动，再决定是否投流，并继续独立记录付费增量。`);
    if (!nextOptimization.length) nextOptimization.push(`保持当前已验证的表现，下一条优先验证${(propagation.score ?? 0) < (interaction.score ?? 0) ? "传播入口" : "互动承接"}，继续采集完整趋势与作品观众数据。`);

    return {
      postId: post.id,
      overallScore: rawScore,
      grade,
      gradeLabel: gradeLabels[grade],
      labels,
      dimensions: { propagation, interaction, attraction, efficiency },
      dataCompleteness: completeness,
      dataConfidence,
      naturalPerformanceConfidence: natural.confidence,
      naturalEvidenceViews: natural.views,
      paidViews: natural.paidViews,
      rankingSignals: {
        naturalPropagation: valid(propagation.score) ? round((propagation.score / propagation.maxScore) * 100) : null,
        interactionQuality: valid(interaction.score) ? round((interaction.score / interaction.maxScore) * 100) : null,
        completionPerformance: valid(efficiency.score) ? round((efficiency.score / efficiency.maxScore) * 100) : null,
        followerGrowth: percentileScore(followerRate, pools.followerRate),
      },
      historicalBaseline: {
        ...baseline,
        message: baseline.sampleInsufficient ? "历史样本不足，当前评分为初步评价。" : null,
      },
      isNaturalBreakout,
      isPaidAmplifiedHighPlay,
      diagnosis: {
        performanceConclusion: `${grade}级·${gradeLabels[grade]}，综合 ${rawScore} 分，数据完整度 ${completeness}%。`,
        strengths: strengths.slice(0, 3),
        problems: problems.slice(0, 4),
        trafficAssessment,
        audienceFeatures,
        commentFeedback,
        paidImpact,
        nextOptimization: [...new Set(nextOptimization)].slice(0, 4),
      },
    };
  });
}
