import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

export async function GET() {
  await ensureDatabase();
  const result = await getD1().prepare(`
    SELECT id, platform, rank, topic_title, heat_value, keyword, url,
      publish_time, category, source_agent, ai_relevance_score,
      ai_analysis, ai_recommendation
    FROM HOT_TOPIC_DATA
    ORDER BY rank ASC, id DESC
    LIMIT 500
  `).all();
  return Response.json({ topics: result.results, sourceAgent: "WorkBuddy热点监测Agent" });
}

