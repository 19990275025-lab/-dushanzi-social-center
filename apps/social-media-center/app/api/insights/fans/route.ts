import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";

const platforms = ["douyin", "kuaishou", "weibo"] as const;
const strategies = {
  douyin: { positioning: "流量获取与爆款内容", actions: ["复用高完播作品的前三秒结构", "围绕热点连续发布同主题短视频", "用评论问题提升推荐流互动"] },
  kuaishou: { positioning: "用户关系与直播互动", actions: ["强化主播和游客的真实互动", "用固定直播时段培养观看习惯", "通过评论回复维护熟人关系"] },
  weibo: { positioning: "品牌传播与热点运营", actions: ["结合城市与旅游热点输出品牌观点", "用图文长帖沉淀完整攻略", "联动文旅账号扩大话题传播"] },
} as const;

type AccountRow = { id: number; platform: string; followers_count: number };
type ProfileRow = {
  id: number; account_id: number; platform: string; fans_count: number;
  gender_distribution: string; age_distribution: string; region_distribution: string;
  interest_distribution: string; active_time_distribution: string;
  source_type: string; collected_at: string;
};
type GrowthRow = {
  platform: string; record_date: string; fans_count: number; net_growth: number;
  new_fans: number; lost_fans: number; source_type: string;
};
type DerivedGrowthRow = { platform: string; record_date: string; net_growth: number };
type PostRow = {
  id: number; title: string; content_type: string; publish_time: string; views: number;
  likes: number; comments: number; favorites: number; shares: number; fans_growth: number;
};
type DistributionItem = { label: string; value: number };
type ProfileSnapshot = {
  id: number; fansCount: number; gender: DistributionItem[]; ages: DistributionItem[];
  regions: DistributionItem[]; interests: DistributionItem[]; activeTimes: DistributionItem[];
  sourceType: string; collectedAt: string;
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

function profileSnapshot(profile: ProfileRow): ProfileSnapshot {
  return {
    id: profile.id,
    fansCount: Number(profile.fans_count),
    gender: distribution(profile.gender_distribution),
    ages: distribution(profile.age_distribution),
    regions: distribution(profile.region_distribution),
    interests: distribution(profile.interest_distribution),
    activeTimes: distribution(profile.active_time_distribution),
    sourceType: profile.source_type,
    collectedAt: profile.collected_at,
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

  const [accounts, profiles, growth, derivedGrowth, posts] = await Promise.all([
    d1.prepare(`SELECT id, platform, followers_count FROM social_accounts
      WHERE status = 'active' ORDER BY id`).all<AccountRow>(),
    d1.prepare(`SELECT id, account_id, platform, fans_count, gender_distribution,
      age_distribution, region_distribution, interest_distribution,
      active_time_distribution, source_type, collected_at FROM social_fans
      WHERE date(collected_at) <= date(?) ORDER BY platform, collected_at DESC, id DESC LIMIT 200`)
      .bind(range.to).all<ProfileRow>(),
    d1.prepare(`SELECT platform, record_date, fans_count, net_growth, new_fans,
      lost_fans, source_type FROM fan_growth_records
      WHERE date(record_date) BETWEEN date(?) AND date(?)
      ORDER BY record_date ASC, id ASC LIMIT 1000`)
      .bind(trendFrom, range.to).all<GrowthRow>(),
    d1.prepare(`SELECT platform, date(publish_time) AS record_date,
      COALESCE(SUM(fans_growth), 0) AS net_growth FROM social_posts
      WHERE date(publish_time) BETWEEN date(?) AND date(?)
      GROUP BY platform, date(publish_time) ORDER BY record_date ASC LIMIT 1000`)
      .bind(trendFrom, range.to).all<DerivedGrowthRow>(),
    d1.prepare(`SELECT id, title, content_type, publish_time, views, likes,
      comments, favorites, shares, fans_growth FROM social_posts
      WHERE platform = 'douyin' AND date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY fans_growth DESC, views DESC, id DESC LIMIT 200`)
      .bind(trendFrom, range.to).all<PostRow>(),
  ]);

  const platformResult = platforms.map((platform) => {
    const history = profiles.results.filter((item) => item.platform === platform).slice(0, 12).map(profileSnapshot);
    const profile = history[0] ?? null;
    const previousProfile = history[1] ?? null;
    const realTrend = growth.results.filter((item) => item.platform === platform);
    const fallbackTrend = derivedGrowth.results.filter((item) => item.platform === platform).map((item) => ({
      platform, record_date: item.record_date, fans_count: 0, net_growth: item.net_growth,
      new_fans: Math.max(0, item.net_growth), lost_fans: Math.max(0, -item.net_growth), source_type: "social_posts",
    }));
    const trend = realTrend.length ? realTrend : fallbackTrend;
    const accountFollowers = accounts.results.filter((account) => account.platform === platform)
      .reduce((sum, account) => sum + Number(account.followers_count), 0);
    const netGrowth = trend.reduce((sum, item) => sum + Number(item.net_growth), 0);
    const newFans = trend.reduce((sum, item) => sum + Number(item.new_fans), 0);
    const lostFans = trend.reduce((sum, item) => sum + Number(item.lost_fans), 0);
    const fansCount = profile?.fansCount ?? accountFollowers;
    const baseFans = Math.max(0, fansCount - netGrowth);
    return {
      platform, fansCount, netGrowth, newFans, lostFans,
      growthRate: baseFans > 0 ? Number(((netGrowth / baseFans) * 100).toFixed(2)) : 0,
      trend, trendSource: realTrend.length ? "fan_growth_records" : "social_posts.fans_growth",
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
    : douyin.netGrowth > 0 ? "粉丝保持净增长，但作品级涨粉归因数据不足，需要继续补采 fans_growth。" : "当前周期没有明确的正向涨粉信号。";
  const lossReason = douyin.lostFans > 0
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
      growthSummary: `本周期新增 ${douyin.newFans}，流失 ${douyin.lostFans}，净增长 ${douyin.netGrowth >= 0 ? "+" : ""}${douyin.netGrowth}，增长率 ${douyin.growthRate}%。`,
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
    sources: ["social_accounts", "social_fans", "fan_growth_records", "social_posts"],
    collectionApi: "/api/v1/social/fans/collect",
    updatedAt: new Date().toISOString(),
  });
}
