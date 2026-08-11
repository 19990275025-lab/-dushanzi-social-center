import type { HotTopicRecord } from "@/lib/data-collection-v2";
import { analyzeWorkBuddyTopic, WORKBUDDY_SOURCE_AGENT } from "@/lib/workbuddy-hot-topic";

export function analyzeImportedHotTopic(record: HotTopicRecord, historicalText: string) {
  if (record.source !== WORKBUDDY_SOURCE_AGENT) return null;

  return analyzeWorkBuddyTopic({
    rowNumber: 1,
    platform: record.platform,
    rank: record.ranking,
    topicTitle: record.topic_name,
    heatValue: String(record.heat_value),
    keyword: record.keyword,
    url: null,
    publishTime: record.collect_time,
    category: record.category,
    sourceAgent: WORKBUDDY_SOURCE_AGENT,
  }, historicalText);
}
