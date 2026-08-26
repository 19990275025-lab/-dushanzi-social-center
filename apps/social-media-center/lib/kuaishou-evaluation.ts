import { realNumber, type KuaishouPost } from "./kuaishou-adapter";

type Indicator = { name: string; score: number | null; evidence: string };
export type KuaishouDimension = { score: number | null; available: number; expected: number; confidence: number; evidence: string[] };
export type KuaishouEvaluation = {
  platform: "kuaishou"; modelVersion: "kuaishou-content-v0.5"; postId: string;
  totalScore: number | null; grade: "A" | "B" | "C" | "D" | null;
  dimensions: Record<"propagation" | "interaction" | "viewing" | "followers", KuaishouDimension>;
  confidence: "low" | "medium"; dataCompleteness: number; baselineSampleSize: number;
  promotionStatus: string; promotionType: "paid" | "platform_support" | "organic" | "unknown";
  naturalPerformanceConfidence: "low" | "medium"; naturalViews: null; isNaturalBreakout: false;
  labels: string[]; strengths: string[]; problems: string[]; suggestions: string[];
};
const round = (v: number) => Number(v.toFixed(2));
const clamp = (v: number) => Math.min(100, Math.max(0, v));
const rate = (n: number | null, d: number | null) => n !== null && d !== null && d > 0 ? n / d * 100 : null;
function average(values: Array<number | null>) { const valid = values.filter((v): v is number => v !== null); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; }
function percentile(value: number | null, population: Array<number | null>) {
  const valid = population.filter((n): n is number => n !== null);
  if (value === null || valid.length < 2) return null;
  if (valid.every(n => n === 0)) return value === 0 ? 0 : null;
  return round(100 * (valid.filter(n => n < value).length + (valid.filter(n => n === value).length - 1) / 2) / (valid.length - 1));
}
function dimension(indicators: Indicator[]): KuaishouDimension {
  const available = indicators.filter(i => i.score !== null);
  const score = average(available.map(i => i.score));
  return { score: score === null ? null : round(score), available: available.length, expected: indicators.length,
    confidence: round(available.length / indicators.length * 100), evidence: available.map(i => i.evidence) };
}
function interactionRate(p: KuaishouPost) {
  const m = p.metrics;
  return [m.likes, m.comments, m.favorites, m.shares].every(n => n !== null)
    ? rate(m.likes! + m.comments! + m.favorites! + m.shares!, m.plays) : null;
}
function hourlyVelocity(p: KuaishouPost) {
  const points = p.series.filter(s => s.metricType === "play_hourly").sort((a, b) => (a.pointTime ?? "").localeCompare(b.pointTime ?? ""));
  // 只比较完整小时；采集所在小时尚未结束，不把它当作完整小时速度。
  const completed = points.filter(s => s.pointTime && Date.parse(s.pointTime) + 3_600_000 <= Date.parse(p.collectionTime));
  return completed.length >= 6 ? average(completed.slice(-6).map(s => s.value)) : null;
}
function sourcePlays(p: KuaishouPost, name: RegExp) {
  const values = p.sources.filter(s => s.metricDimension === "play" && name.test(s.sourceName)).map(s => s.value);
  return values.length && values.every(v => v !== null) ? values.reduce<number>((a, b) => a + b!, 0) : null;
}

/** 平台策略边界：不引用抖音评价器、DOU+、作品画像、热词或情绪。四维等权，仅可用指标参与。 */
export const KuaishouEvaluationStrategy = {
  evaluate(post: KuaishouPost, history: KuaishouPost[]): KuaishouEvaluation {
    const peers = history.filter(p => p.accountId === post.accountId && p.status === "published");
    const m = post.metrics, q = post.quality;
    const promotionType = post.paid.present === true ? "paid" : post.support.present === true ? "platform_support" : post.paid.present === false && post.support.present === false ? "organic" : "unknown";
    const promotionStatus = post.paid.present === true ? "paid_present" : post.support.enabled ? "support_enabled_volume_unknown" : post.paid.present === false ? "paid_not_observed" : "unknown";
    const naturalPerformanceConfidence = promotionType === "organic" ? "medium" : "low";
    const playsEligible = post.paid.present === false;
    const dimensions = {
      propagation: dimension([
        { name: "play", score: playsEligible ? percentile(m.plays, peers.filter(p => p.paid.present === false).map(p => p.metrics.plays)) : null, evidence: `作品播放${m.plays}，仅衡量已观察触达，不认定为自然播放` },
        { name: "velocity", score: playsEligible ? percentile(hourlyVelocity(post), peers.filter(p => p.paid.present === false).map(hourlyVelocity)) : null, evidence: `近6个完整小时平均播放${hourlyVelocity(post) ?? "未提供"}；来源为平台小时数据` },
        { name: "discovery", score: percentile(sourcePlays(post, /精选|发现/), peers.map(p => sourcePlays(p, /精选|发现/))), evidence: `精选/发现页播放来源${sourcePlays(post, /精选|发现/) ?? "未提供"}，来源窗口独立于累计播放` },
        { name: "share", score: percentile(rate(m.shares, m.plays), peers.map(p => rate(p.metrics.shares, p.metrics.plays))), evidence: `分享${m.shares} / 同次累计播放${m.plays}` },
      ]),
      interaction: dimension([
        { name: "interaction", score: percentile(interactionRate(post), peers.map(interactionRate)), evidence: `同次基础数据互动率${interactionRate(post) === null ? "不可计算" : `${round(interactionRate(post)!)}%`}，分子=赞+评+藏+分享` },
        ...(["likes", "comments", "favorites"] as const).map(k => ({ name: k, score: percentile(rate(m[k], m.plays), peers.map(p => rate(p.metrics[k], p.metrics.plays))), evidence: `${k}=${m[k]}，累计播放=${m.plays}` })),
      ]),
      viewing: dimension([
        { name: "completion", score: q.completion, evidence: `完整播放率${q.completion}%（平台原值）` },
        { name: "5s", score: q.completion5s, evidence: `5秒完播率${q.completion5s}%（平台原值）` },
        { name: "2s", score: q.bounce2s === null ? null : 100 - q.bounce2s, evidence: `2秒跳出率${q.bounce2s}%，使用其互补率评价留存` },
        { name: "watch", score: rate(q.avgSeconds, post.durationSeconds) === null ? null : clamp(rate(q.avgSeconds, post.durationSeconds)!), evidence: `平均播放${q.avgSeconds}秒 / 作品时长${post.durationSeconds}秒（时长比，非平台完播率）` },
        { name: "cover", score: q.coverClick, evidence: `封面点击率${q.coverClick}%（平台原值）` },
      ]),
      followers: dimension([
        { name: "follower_count", score: percentile(m.followers, peers.map(p => p.metrics.followers)), evidence: `本作品平台涨粉${m.followers}，不使用账号粉丝净变化归因` },
        { name: "follower_rate", score: percentile(rate(m.followers, m.plays), peers.map(p => rate(p.metrics.followers, p.metrics.plays))), evidence: `涨粉${m.followers} / 同次累计播放${m.plays}` },
      ]),
    };
    if (post.postType !== "video") dimensions.viewing = dimension(Array.from({ length: 5 }, () => ({ name: "video_only", score: null, evidence: "非视频不适用" })));
    const values = Object.values(dimensions);
    const averageScore = post.status === "published" ? average(values.map(d => d.score)) : null;
    const totalScore = averageScore === null ? null : round(averageScore);
    const dataCompleteness = round(values.reduce((n, d) => n + d.available, 0) / values.reduce((n, d) => n + d.expected, 0) * 100);
    const labels = ["快手V0.5初步评价", ...(post.paid.present ? ["含粉条付费推广"] : []), ...(post.support.enabled ? ["平台助推已启用，量级未知"] : []), ...(peers.length < 10 ? ["同账号历史样本不足"] : []), ...(dataCompleteness < 80 ? ["数据不足"] : [])];
    return { platform: "kuaishou", modelVersion: "kuaishou-content-v0.5", postId: post.id, totalScore,
      grade: totalScore === null ? null : totalScore >= 80 ? "A" : totalScore >= 60 ? "B" : totalScore >= 40 ? "C" : "D",
      dimensions, confidence: peers.length < 10 || dataCompleteness < 80 ? "low" : "medium", dataCompleteness,
      baselineSampleSize: peers.length, promotionStatus, promotionType, naturalPerformanceConfidence,
      naturalViews: null, isNaturalBreakout: false, labels,
      strengths: [m.plays === null ? "暂无可核实播放" : `真实累计播放${m.plays}，已保留${post.series.length}个作品自身趋势点`, `真实读取${post.comments.length}条评论，不推断情绪`],
      problems: [peers.length < 10 ? "历史样本少且作品年龄不同，排名只作初步比较" : "评分只反映本账号已采集样本", ...(q.bounce2s === null ? [] : [`前2秒跳出${q.bounce2s}%`]), "来源统计与累计指标更新窗口不同，不能相减推算自然量"],
      suggestions: [q.bounce2s === null ? "补齐平台实际提供的观看质量后再判断开头效果" : `针对${q.bounce2s}%的2秒跳出，优先复查本作品前2秒；下一次用真实留存验证开头调整`,
        m.followers === null ? "平台未提供作品涨粉，暂不判断吸粉能力" : `本作品确认涨粉${m.followers}，下一条可加入明确的景区关注理由，并继续比较作品涨粉指标`,
        ...post.series.filter(s => s.metricType === "retention_second" && realNumber(s.value) !== null).slice(-1).map(s => `真实留存截至${s.pointLabel}为${s.value}%，未观察区间不插值；结合对应画面定位流失`)],
    };
  },
};
