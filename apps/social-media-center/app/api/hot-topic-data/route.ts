import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

const platforms = new Set(["douyin", "kuaishou", "weibo", "web"]);

export async function GET(request: Request) {
  await ensureDatabase();
  const requestedPlatform = new URL(request.url).searchParams.get("platform") ?? "all";
  const platform = platforms.has(requestedPlatform) ? requestedPlatform : "all";
  const statement = getD1().prepare(`
    SELECT id, platform, rank, topic_title, heat_value, keyword, url,
      publish_time, category, source_agent, ai_relevance_score,
      ai_analysis, ai_recommendation
    FROM HOT_TOPIC_DATA
    ${platform === "all" ? "" : "WHERE platform = ?"}
    ORDER BY rank ASC, id DESC
    LIMIT 500
  `);
  const result = await (platform === "all" ? statement : statement.bind(platform)).all();
  return Response.json({ topics: result.results, sourceAgent: "WorkBuddy热点监测Agent" });
}
