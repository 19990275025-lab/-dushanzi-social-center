import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";

const platforms = ["douyin", "kuaishou", "weibo"] as const;
const strategies = {
  douyin: { positioning: "流量获取与爆款内容", actions: ["复用高完播作品的前三秒结构", "围绕热点连续发布同主题短视频", "用评论问题提升推荐流互动"] },
  kuaishou: { positioning: "用户关系与直播互动", actions: ["强化主播和游客的真实互动", "用固定直播时段培养观看习惯", "通过评论回复维护熟人关系"] },
  weibo: { positioning: "品牌传播与热点运营", actions: ["结合城市与旅游热点输出品牌观点", "用图文长帖沉淀完整攻略", "联动文旅账号扩大话题传播"] },
} as const;

type ProfileRow = {
  id: number; account_id: number; platform: string; fans_count: number;
  batch_id: number | null; snapshot_date: string | null; display_fans_count: string | null;
  male_ratio: number | null; female_ratio: number | null;
  gender_distribution: string; age_distribution: string; region_distribution: string;
  interest_distribution: string; active_time_distribution: string;
  source_type: string; collected_at: string; collection_time: string | null;
};
type GrowthRow = {
  platform: string; record_date: string; period_type: string; period_start: string | null;
  period_end: string | null; fans_count: number; net_growth: number;
  new_followers: number | null; lost_followers: number | null;
  returning_followers: number | null; source_type: string;
};
type ProfileDetailRow = {
  batch_id: number; dimension_type: string; dimension_name: string;
  dimension_value: number | null; percentage: number | null; ranking: number | null; raw_value: string | null;
};
type PostRow = {
  id: number; title: string; content_type: string; publish_time: string; views: number;
  likes: number; comments: number; favorites: number; shares: number; fans_growth: number;
};
type DistributionItem = { label: string; value: number };
type ProfileSnapshot = {
  id: number; fansCount: number; gender: DistributionItem[]; ages: DistributionItem[];
  regions: DistributionItem[]; interests: DistributionItem[]; devices: DistributionItem[];
  activityLevels: DistributionItem[]; activeTimes: DistributionItem[]; followKeywords: DistributionItem[];
  unavailableFields: string[]; sourceType: string; collectedAt: string; snapshotDate: string | null;
  displayFansCount: string | null;
};

function distribution(value: string): DistributionItem[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as { label?: unknown; value?: unknown };
      return typeof candidate.label === "string" && typeof candidate.value === "number"
        ? [{ label: candidate.label, value: candidate.value }]
        : [];
    });
  } catch {
    return [];
  }
}

function profileDimensions(details: ProfileDetailRow[], type: string) {
  return details.filter((item) => item.dimension_type === type && item.dimension_value !== null)
    .sort((a, b) => Number(a.ranking ?? 9999) - Number(b.ranking ?? 9999))
    .map((item) => ({ label: item.dimension_name, value: Number(item.percentage ?? item.dimension_value) }));
}

function profileSnapshot(profile: ProfileRow, details: ProfileDetailRow[]): ProfileSnapshot {
  const detailGender = profileDimensions(details, "gender");
  return {
    id: profile.id,
    fansCount: Number(profile.fans_count),
    gender: detailGender.length ? detailGender : distribution(profile.gender_distribution),
    ages: profileDimensions(details, "age").length ? profileDimensions(details, "age") : distribution(profile.age_distribution),
    regions: profileDimensions(details, "region").length ? profileDimensions(details, "region") : distribution(profile.region_distribution),
    interests: profileDimensions(details, "interest").length ? profileDimensions(details, "interest") : distribution(profile.interest_distribution),
    devices: profileDimensions(details, "device"),
    activityLevels: profileDimensions(details, "activity"),
    activeTimes: distribution(profile.active_time_distribution),
    followKeywords: profileDimensions(details, "follow_keyword"),
    unavailableFields: details.filter((item) => item.dimension_type === "other" && item.raw_value?.startsWith("unavailable"))
      .map((item) => item.dimension_name),
    sourceType: profile.source_type,
    collectedAt: profile.collection_time ?? profile.collected_at,
    snapshotDate: profile.snapshot_date,
    displayFansCount: profile.display_fans_count,
  };
}

function distributionChanges(current: DistributionItem[], previous: DistributionItem[]) {
  const previousValues = new Map(previous.map((item) => [item.label, item.value]));
  return current.map((item) => ({
    label: item.label,
    value: item.value,
    previousValue: previousValues.get(item.label) ?? 0,
    delta: Number((item.value - (previousValues.get(item.label) ?? 0)).toFixed(2)),
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function topLabel(items: DistributionItem[]) {
  return [...items].sort((a, b) => b.value - a.value)[0]?.label ?? "暂无数据";
}

function contentTypeLabel(type: string) {
  return ({ video: "短视频", image_text: "图文", text: "文字", live: "直播", article: "文章" } as Record<string, string>)[type] ?? type;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const searchParams = new URL(request.url).searchParams;
  const range = resolveDateRange(searchParams);
  const requestedPeriod = searchParams.get("trend") ?? "7d";
  const trendPeriod = (["7d", "30d", "month", "custom"] as const).includes(requestedPeriod as "7d" | "30d" | "month" | "custom")
    ? requestedPeriod as "7d" | "30d" | "month" | "custom" : "7d";
  const endDate = new Date(`${range.to}T00:00:00Z`);
  const trendFrom = trendPeriod === "custom"
    ? range.from
    : trendPeriod === "month"
      ? `${range.to.slice(0, 7)}-01`
      : new Date(endDate.getTime() - (trendPeriod === "30d" ? 29 : 6) * 86400000).toISOString().slice(0, 10);
  const summaryPeriodType = trendPeriod === "month" ? "natural_month" : trendPeriod;

  const [profiles, profileDetails, growth, periodSummaries, posts] = await Promise.all([
    d1.prepare(`SELECT id, account_id, platform, fans_count, batch_id, snapshot_date,
      display_fans_count, male_ratio, female_ratio, gender_distribution,
      age_distribution, region_distribution, interest_distribution,
      active_time_distribution, source_type, collected_at, collection_time FROM social_fans
      ORDER BY platform, COALESCE(snapshot_date, date(collected_at)) DESC, id DESC LIMIT 200`)
      .all<ProfileRow>(),
    d1.prepare(`SELECT batch_id, dimension_type, dimension_name, dimension_value,
      percentage, ranking, raw_value FROM fan_profile_records
      ORDER BY batch_id DESC, dimension_type, ranking, id LIMIT 5000`).all<ProfileDetailRow>(),
    d1.prepare(`SELECT platform, record_date, period_type, period_start, period_end,
      fans_count, net_growth, new_followers, lost_followers, returning_followers, source_type
      FROM fan_growth_records WHERE period_type = 'daily'
      AND date(period_end) BETWEEN date(?) AND date(?)
      ORDER BY period_end ASC, id ASC LIMIT 1000`)
      .bind(trendFrom, range.to).all<GrowthRow>(),
    d1.prepare(`SELECT platform, record_date, period_type, period_start, period_end,
      fans_count, net_growth, new_followers, lost_followers, returning_followers, source_type
      FROM fan_growth_records WHERE period_type = ?
      AND date(period_start) = date(?) AND date(period_end) = date(?)
      ORDER BY snapshot_date DESC, id DESC LIMIT 20`)
      .bind(summaryPeriodType, trendFrom, range.to).all<GrowthRow>(),
    d1.prepare(`SELECT id, title, content_type, publish_time, views, likes,
      comments, favorites, shares, fans_growth FROM social_posts
      WHERE platform = 'douyin' AND date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY fans_growth DESC, views DESC, id DESC LIMIT 200`)
      .bind(trendFrom, range.to).all<PostRow>(),
  ]);

  const platformResult = platforms.map((platform) => {
    const history = profiles.results.filter((item) => item.platform === platform).slice(0, 12).map((item) =>
      profileSnapshot(item, item.batch_id === null ? [] : profileDetails.results.filter((detail) => detail.batch_id === item.batch_id)));
    const profile = history[0] ?? null;
    const previousProfile = history[1] ?? null;
    const realTrend = growth.results.filter((item) => item.platform === platform);
    const trend = realTrend.map((item) => ({
      ...item,
      record_date: item.period_end ?? item.record_date,
      new_fans: Number(item.new_followers),
      lost_fans: Number(item.lost_followers),
    }));
    const summary = periodSummaries.results.find((item) => item.platform === platform) ?? null;
    const netGrowth = summary === null ? null : Number(summary.net_growth);
    const newFans = summary?.new_followers === null || summary?.new_followers === undefined ? null : Number(summary.new_followers);
    const lostFans = summary?.lost_followers === null || summary?.lost_followers === undefined ? null : Number(summary.lost_followers);
    const returningFans = summary?.returning_followers === null || summary?.returning_followers === undefined ? null : Number(summary.returning_followers);
    const fansCount = profile?.fansCount ?? null;
    const baseFans = fansCount !== null && netGrowth !== null ? Math.max(0, fansCount - netGrowth) : null;
    return {
      platform, fansCount, netGrowth, newFans, lostFans, returningFans,
      growthRate: baseFans !== null && baseFans > 0 && netGrowth !== null ? Number(((netGrowth / baseFans) * 100).toFixed(2)) : null,
      metricsAvailable: summary !== null,
      metricsUnavailableReason: summary === null ? "平台暂未提供该统计周期数据" : null,
      trend, trendSource: realTrend.length ? "fan_growth_records.daily" : "unavailable",
      strategy: strategies[platform], profile, previousProfile, profileHistory: history,
      profileComparison: profile && previousProfile ? {
        currentDate: profile.collectedAt, previousDate: previousProfile.collectedAt,
        gender: distributionChanges(profile.gender, previousProfile.gender),
        ages: distributionChanges(profile.ages, previousProfile.ages),
        regions: distributionChanges(profile.regions, previousProfile.regions),
        interests: distributionChanges(profile.interests, previousProfile.interests),
        activeTimes: distributionChanges(profile.activeTimes, previousProfile.activeTimes),
      } : null,
    };
  });

  const douyin = platformResult.find((item) => item.platform === "douyin")!;
  const dailyGrowth = new Map(douyin.trend.map((item) => [item.record_date, Number(item.net_growth)]));
  const contentPosts = posts.results.map((post) => ({
    ...post,
    fans_growth: Number(post.fans_growth),
    day_net_growth: dailyGrowth.get(post.publish_time.slice(0, 10)) ?? null,
    interaction_rate: post.views > 0
      ? Number(((post.likes + post.comments + post.favorites + post.shares) * 100 / post.views).toFixed(2)) : 0,
  }));
  const typeMap = new Map<string, { contentType: string; label: string; posts: number; fansGrowth: number; views: number }>();
  for (const post of contentPosts) {
    const item = typeMap.get(post.content_type) ?? { contentType: post.content_type, label: contentTypeLabel(post.content_type), posts: 0, fansGrowth: 0, views: 0 };
    item.posts += 1; item.fansGrowth += post.fans_growth; item.views += Number(post.views);
    typeMap.set(post.content_type, item);
  }
  const contentTypes = [...typeMap.values()].map((item) => ({
    ...item, averageFansGrowth: item.posts ? Number((item.fansGrowth / item.posts).toFixed(1)) : 0,
  })).sort((a, b) => b.fansGrowth - a.fansGrowth);
  const bestPost = contentPosts.find((post) => post.fans_growth > 0) ?? null;
  const bestType = contentTypes.find((item) => item.fansGrowth > 0) ?? null;

  const profile = douyin.profile;
  const previousProfile = douyin.previousProfile;
  const topAge = topLabel(profile?.ages ?? []);
  const topRegion = topLabel(profile?.regions ?? []);
  const topInterest = topLabel(profile?.interests ?? []);
  const profileChange = douyin.profileComparison;
  const strongestChange = profileChange
    ? [...profileChange.ages, ...profileChange.regions, ...profileChange.interests]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null
    : null;
  const growthReason = bestPost && bestPost.fans_growth > 0
    ? `“${bestPost.title}”贡献 ${bestPost.fans_growth} 名涨粉，是当前周期最强内容信号。`
    : douyin.netGrowth === null ? "平台暂未提供该统计周期增长数据。"
      : douyin.netGrowth > 0 ? "粉丝保持净增长，但作品级涨粉归因数据不足，需要继续补采 fans_growth。" : "当前周期没有明确的正向涨粉信号。";
  const lossReason = douyin.lostFans === null ? "平台暂未提供该统计周期流失数据。" : douyin.lostFans > 0
    ? `记录到 ${douyin.lostFans} 名流失粉丝；需结合发布频率、内容重复度和评论反馈继续验证原因。`
    : "当前周期未记录粉丝流失；若平台后台存在取关数据，请补充写入 lost_fans。";
  const nextWeekSuggestions = [
    bestType && bestType.fansGrowth > 0
      ? `优先复用${bestType.label}结构，围绕表现最好的作品拆分 2-3 个连续选题。`
      : "补采作品 fans_growth，建立作品与粉丝增长的稳定归因样本。",
    topRegion !== "暂无数据" ? `面向${topRegion}粉丝强化可执行攻略、路线与到访决策信息。` : "补充地域画像后再制定区域化内容策略。",
    topInterest !== "暂无数据" ? `围绕“${topInterest}”兴趣增加第一视角和游客体验内容，减少缺少行动信息的纯展示。` : "补充兴趣画像后再调整内容类型占比。",
  ];

  return Response.json({
    platforms: platformResult,
    range, trendPeriod, trendRange: { from: trendFrom, to: range.to },
    contentAttraction: {
      platform: "douyin", posts: contentPosts, contentTypes, bestPost, bestType,
      attributionNote: "作品涨粉使用 social_posts.fans_growth；同日净增长仅作背景校验，不代表单一作品因果贡献。",
    },
    weeklyReport: {
      platform: "douyin",
      growthSummary: douyin.metricsAvailable
        ? `本周期新增 ${douyin.newFans}，流失 ${douyin.lostFans}，净增长 ${Number(douyin.netGrowth) >= 0 ? "+" : ""}${douyin.netGrowth}，增长率 ${douyin.growthRate}%。`
        : "平台暂未提供该统计周期数据。",
      profileSummary: profile
        ? `核心画像为 ${topAge}、${topRegion}、兴趣偏好“${topInterest}”。${strongestChange ? `较上次快照变化最大的是“${strongestChange.label}”${strongestChange.delta >= 0 ? "上升" : "下降"}${Math.abs(strongestChange.delta)}个百分点。` : "暂无可用历史快照对比。"}`
        : "当前没有可用粉丝画像快照。",
      growthReason, lossReason,
      bestPost: bestPost ? { id: bestPost.id, title: bestPost.title, fansGrowth: bestPost.fans_growth, views: bestPost.views } : null,
      easiestContent: bestType ? `${bestType.label}累计带来 ${bestType.fansGrowth} 名涨粉，篇均 ${bestType.averageFansGrowth}。` : "暂无可比较的作品涨粉数据。",
      nextWeekSuggestions,
      profileSnapshotDate: profile?.collectedAt ?? null,
      previousProfileSnapshotDate: previousProfile?.collectedAt ?? null,
    },
    sources: ["social_fans", "fan_growth_records", "fan_profile_records", "fan_collection_batches", "social_posts"],
    collectionApi: "/api/collections/fans-v2",
    updatedAt: new Date().toISOString(),
  });
}
