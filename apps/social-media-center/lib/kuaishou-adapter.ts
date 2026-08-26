/** WorkBuddy 快手 daily V2.2 的只读边界。不会调用采集工具，也不会猜测字段。 */
export type JsonObject = Record<string, unknown>;
export type KuaishouStatus = "available" | "partial" | "unavailable" | "no_data" | "failed";
const object = (v: unknown): JsonObject => v !== null && typeof v === "object" && !Array.isArray(v) ? v as JsonObject : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
export const realNumber = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const identifier = (v: unknown): string | null => text(v) ?? (typeof v === "number" && Number.isSafeInteger(v) ? String(v) : null);
const flag = (v: unknown): boolean | null => typeof v === "boolean" ? v : null;
const fieldStatus = (record: JsonObject, key: string): KuaishouStatus => !Object.hasOwn(record, key)
  ? "unavailable" : record[key] == null || (Array.isArray(record[key]) && record[key].length === 0) ? "no_data" : "available";

export function kuaishouTime(v: unknown): string | null {
  const value = text(v);
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return null;
  const normalized = value.length === 10 ? `${value}T00:00:00+08:00`
    : /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T")
    : `${value.replace(" ", "T")}${value.length === 16 ? ":00" : ""}+08:00`;
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

export type KuaishouPoint = {
  metricType: string; seriesName: string; pointIndex: number; pointTime: string | null;
  pointLabel: string; value: number; unit: string; sourcePath: string; raw: unknown;
};
export type KuaishouSource = {
  metricDimension: string; sourceType: string; sourceName: string; value: number | null;
  percentage: null; nature: "other"; raw: unknown;
};
export type KuaishouComment = {
  sourceId: string | null; author: string | null; authorId: string | null; content: string | null;
  publishTime: string | null; likes: number | null; replies: number | null; raw: JsonObject;
  availability: Record<string, KuaishouStatus>;
};
export type KuaishouPost = {
  id: string; title: string; publishTime: string; postType: string; durationSeconds: number | null;
  status: string; isNew: boolean; url: string | null; accountId: string; accountName: string;
  fans: number | null; collectionTime: string; collectionBatch: string;
  metrics: { plays: number | null; likes: number | null; comments: number | null; favorites: number | null; shares: number | null; followers: number | null; actualLoaded: number | null };
  quality: { completion: number | null; avgSeconds: number | null; bounce2s: number | null; completion5s: number | null; coverClick: number | null };
  series: KuaishouPoint[]; sources: KuaishouSource[]; comments: KuaishouComment[];
  paid: { present: boolean | null; raw: JsonObject }; support: { present: boolean | null; enabled: boolean | null; raw: JsonObject };
  availability: Record<string, KuaishouStatus>; raw: JsonObject;
};
export type KuaishouBatch = {
  platform: "kuaishou"; date: string; collectionTime: string; batch: string;
  accountId: string; accountName: string; fans: number | null; posts: KuaishouPost[];
  raw: JsonObject; warnings: string[];
};

export function normalizeKuaishouDaily(payload: unknown): KuaishouBatch {
  const root = object(payload);
  const errors: string[] = [];
  const collectionTime = kuaishouTime(root.collection_time);
  const date = text(root.monitor_date);
  const batch = text(root.collection_batch);
  if (root.platform !== "kuaishou") errors.push("仅接受 platform=kuaishou");
  if (root.data_truthfulness !== "real_data_only_no_estimation") errors.push("缺少真实采集声明");
  if (!collectionTime || !date || date !== collectionTime.slice(0, 10)) errors.push("采集日期/时间无效或不一致");
  if (!batch) errors.push("collection_batch 缺失");
  if (!Array.isArray(root.posts) || !root.posts.length) errors.push("posts 必须是非空数组");
  const seen = new Set<string>();
  const warnings: string[] = [];
  const posts = array(root.posts).map((item, index): KuaishouPost => {
    const r = object(item), p = object(r.post), a = object(r.account), m = object(r.basic_metrics), q = object(r.content_quality);
    const id = identifier(p.post_id), accountId = identifier(a.user_id), title = text(p.title);
    const publishTime = kuaishouTime(p.publish_time), postTime = kuaishouTime(r.collection_time);
    const sourcePrefix = `posts[${index}]`;
    if (r.platform !== "kuaishou" || !id || !accountId || !title || !publishTime) errors.push(`${sourcePrefix}: 作品/账号身份、标题或发布时间缺失`);
    if (postTime !== collectionTime || r.collection_batch !== batch) errors.push(`${sourcePrefix}: 批次或采集时间不一致`);
    if (seen.has(`${accountId}:${id}`)) errors.push(`${sourcePrefix}: 重复作品身份`);
    seen.add(`${accountId}:${id}`);
    const nullableNumber = (value: unknown, field: string, percentage = false): number | null => {
      const n = realNumber(value);
      if (value !== null && value !== undefined && n === null) errors.push(`${sourcePrefix}.${field}: 不是有效数字，禁止自动转为0`);
      if (n !== null && (n < 0 || (percentage && n > 100))) errors.push(`${sourcePrefix}.${field}: 数值超出范围`);
      return n;
    };
    const trend = object(r.traffic_trend), source = object(r.traffic_source), viewing = object(r.viewing_analysis);
    const series: KuaishouPoint[] = [];
    for (const [key, metricType] of [["hourly_play_series", "play_hourly"], ["play_daily_series", "play_daily"], ["like_daily_series", "like_daily"]]) {
      for (const [pointIndex, value] of array(trend[key]).entries()) {
        const row = object(value), pointTime = kuaishouTime(row.time), n = realNumber(row.value);
        if (!pointTime || n === null) { errors.push(`${sourcePrefix}.traffic_trend.${key}[${pointIndex}]: 无效真实数据点`); continue; }
        series.push({ metricType, seriesName: "platform_actual", pointIndex, pointTime, pointLabel: String(row.time), value: n, unit: "count", sourcePath: `traffic_trend.${key}`, raw: value });
      }
    }
    for (const view of array(viewing.raw_data)) {
      const v = object(view);
      // hotDetailList 是平台对标示例，不是本作品的真实趋势。只留原始payload，不写作品曲线。
      if (v.type !== 1 && v.type !== 2) continue;
      for (const [pointIndex, value] of array(v.detailList).entries()) {
        const row = object(value), n = realNumber(row.ratio), second = realNumber(row.time);
        if (n === null || second === null || n < 0 || n > 100 || second < 0) { errors.push(`${sourcePrefix}.viewing_analysis: 无效逐秒数据`); continue; }
        series.push({ metricType: v.type === 1 ? "retention_second" : "like_second", seriesName: "platform_actual", pointIndex,
          pointTime: null, pointLabel: `${second}s`, value: n, unit: "percent", sourcePath: `viewing_analysis.raw_data.type${v.type}.detailList`, raw: value });
      }
    }
    const sources: KuaishouSource[] = [];
    for (const [key, metricDimension] of Object.entries({ play: "play", like: "like", comment: "comment", collect: "favorite", share: "share", complete_play_count: "completion", follower_gain: "follow" })) {
      for (const value of array(source[key])) {
        const row = object(value), name = text(row.traffic_source_name);
        if (!name) { errors.push(`${sourcePrefix}.traffic_source.${key}: 缺少来源名称`); continue; }
        sources.push({ metricDimension, sourceType: key, sourceName: name,
          value: nullableNumber(row.traffic_source_value, `traffic_source.${key}.${name}`), percentage: null, nature: "other", raw: value });
      }
    }
    const c = object(r.comments);
    const comments = array(c.list).map((value): KuaishouComment => {
      const row = object(value), content = text(row.content), author = text(row.author_name);
      const likes = nullableNumber(row.liked_count, "comments.liked_count"), replies = nullableNumber(row.sub_comment_count, "comments.sub_comment_count");
      const publish = kuaishouTime(row.comment_time) ?? (realNumber(row.comment_time_ms) === null ? null : new Date(row.comment_time_ms as number).toISOString());
      return { sourceId: identifier(row.comment_id), author, authorId: identifier(row.author_id), content, publishTime: publish, likes, replies, raw: row,
        availability: { author: author ? "available" : "unavailable", content: content ? "available" : "unavailable", publish_time: publish ? "available" : "unavailable", like_count: likes === null ? "unavailable" : "available", reply_count: replies === null ? "unavailable" : "available" } };
    });
    if (realNumber(c.total_visible) !== null && c.total_visible !== comments.length) warnings.push(`${id}: 可见评论数与comments.list长度不同，分别保存，不认定为采集失败`);
    const paid = object(r.paid_traffic), support = object(r.platform_support_traffic);
    const quality = { completion: nullableNumber(q.finish_rate_percent, "content_quality.finish_rate_percent", true),
      avgSeconds: q.avg_play_duration_ms === null || q.avg_play_duration_ms === undefined ? null : nullableNumber(q.avg_play_duration_ms, "content_quality.avg_play_duration_ms")! / 1000,
      bounce2s: nullableNumber(q.bounce_rate_2s_percent, "content_quality.bounce_rate_2s_percent", true),
      completion5s: nullableNumber(q.finish_rate_5s_percent, "content_quality.finish_rate_5s_percent", true),
      coverClick: nullableNumber(q.cover_click_rate_percent, "content_quality.cover_click_rate_percent", true) };
    const availability: Record<string, KuaishouStatus> = {
      download_count: "unavailable", search_traffic_percentage: "unavailable", audience_gender: "unavailable", audience_age: "unavailable", audience_region: "unavailable", audience_interest: "unavailable", comment_keywords: "unavailable",
      search_keywords: fieldStatus(object(r.search_data), "favorV2_searchKeywords"),
      search_diagnosis: fieldStatus(object(object(r.diagnosis).favor_diagnosis), "searchDiagnose"), like_second: viewing.like_analysis === "available" ? "available" : viewing.like_analysis === "no_data" ? "no_data" : "unavailable",
      retention_second: viewing.continue_watching === "available" ? "available" : "unavailable",
    };
    // Explicit status from later compatible files takes priority; do not fabricate missing dimensions.
    for (const [key, value] of Object.entries(object(r.availability))) if (["available", "partial", "unavailable", "no_data", "failed"].includes(String(value))) availability[key] = value as KuaishouStatus;
    return { id: id ?? "", title: title ?? "", publishTime: publishTime ?? "", postType: text(p.type) ?? "unknown", status: text(p.status) ?? "unavailable", isNew: p.is_new_post === true,
      durationSeconds: p.duration_ms == null ? null : nullableNumber(p.duration_ms, "post.duration_ms")! / 1000,
      url: text(p.detail_url), accountId: accountId ?? "", accountName: text(a.account_name) ?? "", fans: nullableNumber(a.fans_count_at_collection, "account.fans_count_at_collection"),
      collectionTime: postTime ?? "", collectionBatch: text(r.collection_batch) ?? "", quality, series, sources, comments, availability,
      metrics: { plays: nullableNumber(m.play_count, "basic_metrics.play_count"), likes: nullableNumber(m.like_count, "basic_metrics.like_count"), comments: nullableNumber(m.comment_count, "basic_metrics.comment_count"),
        favorites: nullableNumber(m.collect_count, "basic_metrics.collect_count"), shares: nullableNumber(m.share_count, "basic_metrics.share_count"), followers: nullableNumber(m.follower_gain_count, "basic_metrics.follower_gain_count"), actualLoaded: realNumber(c.total_visible) },
      paid: { present: flag(paid.present), raw: paid }, support: { present: flag(support.present), enabled: flag(support.enable_boost), raw: support }, raw: r };
  });
  if (new Set(posts.map(p => p.accountId)).size !== 1) errors.push("一个文件必须对应一个真实账号；不按账号名称猜测合并身份");
  if (new Set(posts.map(p => p.fans)).size !== 1) errors.push("同批账号粉丝快照不一致");
  if (errors.length) throw new Error(errors.join("\n"));
  return { platform: "kuaishou", date: date!, collectionTime: collectionTime!, batch: batch!, accountId: posts[0].accountId,
    accountName: posts[0].accountName, fans: posts[0].fans, posts, raw: root, warnings };
}

export function selectKuaishouSample(batch: KuaishouBatch, ids: string[]) {
  if (ids.length !== 2 || new Set(ids).size !== 2) throw new Error("阶段3A只允许明确选择2条作品");
  const selected = ids.map(id => batch.posts.find(p => p.id === id));
  if (selected.some(p => !p)) throw new Error("选择的作品不在本批真实文件中");
  const posts = selected as KuaishouPost[];
  if (posts.filter(p => p.isNew).length !== 1) throw new Error("必须选择1条新发现作品和1条持续监测作品");
  if (posts.some(p => p.status !== "published")) throw new Error("阶段3A仅验证两条正常公开作品；其他状态保留原始文件，不补0");
  return posts;
}
