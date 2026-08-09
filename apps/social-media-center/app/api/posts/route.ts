import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

const sortColumns = {
  publish_time: "publish_time",
  views: "views",
  likes: "likes",
  comments: "comments",
  favorites: "favorites",
  shares: "shares",
} as const;
const supportedPlatforms = new Set(["douyin", "kuaishou", "weibo"]);

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const params = new URL(request.url).searchParams;
  const platform = params.get("platform") ?? "all";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const requestedSort = params.get("sort") as keyof typeof sortColumns | null;
  const sort = requestedSort && sortColumns[requestedSort] ? sortColumns[requestedSort] : "publish_time";

  if (platform !== "all" && !supportedPlatforms.has(platform)) {
    return Response.json({ error: "请选择有效平台" }, { status: 400 });
  }

  const conditions: string[] = ["platform IN ('douyin', 'kuaishou', 'weibo')"];
  const values: string[] = [];

  if (platform !== "all") {
    conditions.push("platform = ?");
    values.push(platform);
  }
  if (from) {
    conditions.push("date(publish_time) >= date(?)");
    values.push(from);
  }
  if (to) {
    conditions.push("date(publish_time) <= date(?)");
    values.push(to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await d1
    .prepare(`
      SELECT id, title, platform, content_type, publish_time,
        views, likes, comments, favorites, shares
      FROM social_posts
      ${where}
      ORDER BY ${sort} DESC, id DESC
      LIMIT 100
    `)
    .bind(...values)
    .all();

  return Response.json({ posts: result.results, updatedAt: new Date().toISOString() });
}
