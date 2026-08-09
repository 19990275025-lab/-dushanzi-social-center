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
  account_id: number;
  platform: string;
  fans_count: number;
  gender_distribution: string;
  age_distribution: string;
  region_distribution: string;
  interest_distribution: string;
  active_time_distribution: string;
  source_type: string;
  collected_at: string;
};
type GrowthRow = {
  platform: string;
  record_date: string;
  fans_count: number;
  net_growth: number;
  new_fans: number;
  lost_fans: number;
  source_type: string;
};
type DerivedGrowthRow = { platform: string; record_date: string; net_growth: number };
type DistributionItem = { label: string; value: number };

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

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const searchParams = new URL(request.url).searchParams;
  const range = resolveDateRange(searchParams);
  const requestedPeriod = searchParams.get("trend") ?? "7d";
  const trendPeriod = (["7d", "30d", "month"] as const).includes(requestedPeriod as "7d" | "30d" | "month") ? requestedPeriod as "7d" | "30d" | "month" : "7d";
  const endDate = new Date(`${range.to}T00:00:00Z`);
  const trendFrom = trendPeriod === "month" ? `${range.to.slice(0, 7)}-01` : new Date(endDate.getTime() - (trendPeriod === "30d" ? 29 : 6) * 86400000).toISOString().slice(0, 10);
  const [accounts, profiles, growth, derivedGrowth] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, followers_count
      FROM social_accounts
      WHERE status = 'active'
      ORDER BY id
    `).all<AccountRow>(),
    d1.prepare(`
      SELECT account_id, platform, fans_count, gender_distribution,
        age_distribution, region_distribution, interest_distribution,
        active_time_distribution, source_type, collected_at
      FROM social_fans
      WHERE date(collected_at) BETWEEN date(?) AND date(?)
      ORDER BY collected_at DESC, id DESC
      LIMIT 200
    `).bind(range.from, range.to).all<ProfileRow>(),
    d1.prepare(`
      SELECT platform, record_date, fans_count, net_growth, new_fans,
        lost_fans, source_type
      FROM fan_growth_records
      WHERE date(record_date) BETWEEN date(?) AND date(?)
      ORDER BY record_date ASC, id ASC
      LIMIT 1000
    `).bind(trendFrom, range.to).all<GrowthRow>(),
    d1.prepare(`
      SELECT platform, date(publish_time) AS record_date,
        COALESCE(SUM(fans_growth), 0) AS net_growth
      FROM social_posts
      WHERE date(publish_time) BETWEEN date(?) AND date(?)
      GROUP BY platform, date(publish_time)
      ORDER BY record_date ASC
      LIMIT 1000
    `).bind(trendFrom, range.to).all<DerivedGrowthRow>(),
  ]);

  const latestProfile = new Map<string, ProfileRow>();
  for (const profile of profiles.results) {
    if (!latestProfile.has(profile.platform)) latestProfile.set(profile.platform, profile);
  }

  const result = platforms.map((platform) => {
    const profile = latestProfile.get(platform);
    const realTrend = growth.results.filter((item) => item.platform === platform);
    const fallbackTrend = derivedGrowth.results
      .filter((item) => item.platform === platform)
      .map((item) => ({
        platform,
        record_date: item.record_date,
        fans_count: 0,
        net_growth: item.net_growth,
        new_fans: Math.max(0, item.net_growth),
        lost_fans: Math.max(0, -item.net_growth),
        source_type: "social_posts",
      }));
    const trend = realTrend.length ? realTrend : fallbackTrend;
    const accountFollowers = accounts.results
      .filter((account) => account.platform === platform)
      .reduce((sum, account) => sum + account.followers_count, 0);

    const netGrowth = trend.reduce((sum, item) => sum + item.net_growth, 0);
    const newFans = trend.reduce((sum, item) => sum + item.new_fans, 0);
    const baseFans = Math.max(0, (profile?.fans_count ?? accountFollowers) - netGrowth);
    return {
      platform,
      fansCount: profile?.fans_count ?? accountFollowers,
      netGrowth,
      newFans,
      growthRate: baseFans > 0 ? Number(((netGrowth / baseFans) * 100).toFixed(2)) : 0,
      trend,
      trendSource: realTrend.length ? "fan_growth_records" : "social_posts.fans_growth",
      strategy: strategies[platform],
      profile: profile ? {
        gender: distribution(profile.gender_distribution),
        ages: distribution(profile.age_distribution),
        regions: distribution(profile.region_distribution),
        interests: distribution(profile.interest_distribution),
        activeTimes: distribution(profile.active_time_distribution),
        sourceType: profile.source_type,
        collectedAt: profile.collected_at,
      } : null,
    };
  });

  return Response.json({
    platforms: result,
    range,
    trendPeriod,
    trendRange: { from: trendFrom, to: range.to },
    sources: ["social_accounts", "social_fans", "fan_growth_records", "social_posts"],
    collectionApi: "/api/v1/social/fans/collect",
    updatedAt: new Date().toISOString(),
  });
}
