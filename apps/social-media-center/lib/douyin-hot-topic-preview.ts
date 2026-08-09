import { calculateRelevance, classifyHotTopic, ruleBasedTopicEngine } from "@/lib/hot-topic-engine";

export const DOUYIN_HOT_PREVIEW_TOKEN = "douyin-hot-2026-08-09-185347";
export const DOUYIN_HOT_COLLECTED_AT = "2026-08-09T18:53:47+08:00";
export const DOUYIN_HOT_SOURCE_URL = "https://www.douyin.com/hot";

const rawTopics: Array<[string, number, string]> = [
  ["台风白海豚在浙江台州登陆", 11800000, "2603293"],
  ["台风白海豚实时路径", 11082000, "2602902"],
  ["我国成全球在研创新药第一大国", 11072000, "2602725"],
  ["贵州菜申请加入暑期美食展", 9710000, "2603000"],
  ["穿搭没有公式", 9161000, "2602751"],
  ["明日之星决赛取消 两队并列冠军", 9013000, "2603117"],
  ["长崎拟将南京大屠杀改为南京事件", 7804000, "2602821"],
  ["佛得角门将身价暴涨1000%", 7764000, "2603013"],
  ["金价为何突然大涨", 7742000, "2602679"],
  ["这张是烂片但我喜欢", 7741000, "2603018"],
  ["解析台风白海豚的反常特征", 7734000, "2602591"],
  ["冻结那时间 冻结初遇那一天", 7734000, "2602815"],
  ["如何杜绝二次造谣", 7734000, "2603365"],
  ["拜登儿子称拜登癌症扩散", 7731000, "2602799"],
  ["伦纳德被曝隐匿收入超5000万美元", 7728000, "2602832"],
  ["陈楚生音乐节真神来的", 7727000, "2603132"],
  ["披荆斩棘官宣完整嘉宾阵容", 7720000, "2603100"],
  ["浙江上海等地迎强风雨", 7717000, "2603041"],
  ["全球最大级别运输船通过长江大桥", 7709000, "2603385"],
  ["轰6J挂弹现身黄岩岛海空联合演训", 7704000, "2602850"],
  ["开学三件套全线暴涨", 7699000, "2602827"],
  ["得不到的就更加爱舞蹈挑战", 7697000, "2603211"],
  ["御廷谣严知有理共创甜到我了", 7694000, "2603376"],
  ["我在草原上站了一会", 7691000, "2603208"],
  ["宋茜刺激之夜即兴手势舞", 7681000, "2603092"],
  ["下辈子不一定还能遇见你手势舞", 7680000, "2602415"],
  ["用慢充旅行治愈自己", 7678000, "2601301"],
  ["郝熠然稻田草帽少年", 7676000, "2602791"],
  ["2026年“未录满”本科专业排行榜", 7664000, "2603232"],
  ["白鹿奶油风夏夜随拍", 7662000, "2602769"],
  ["王者英雄夏日海滩集结", 7658000, "2603170"],
  ["王灿党金虎薛珍麒也来正太扭腰了", 7652000, "2603152"],
  ["撕名牌撕出看海宗师形态", 7652000, "2603056"],
  ["方桃子评论区网友都在扮演NPC", 7650000, "2603426"],
  ["手写LOVE打开我的夏天", 7649000, "2603007"],
  ["和平精英百变甜包实战效果", 7648000, "2603255"],
  ["陈瑶刺激之夜红袍变装道法传人", 7647000, "2602622"],
  ["VCT正太扭腰", 7646000, "2602672"],
  ["杨洋像隔壁班新来的学长", 7645000, "2603527"],
  ["不同画师眼中的汽水音乐", 7644000, "2603005"],
  ["ruins摇我先跳了", 7644000, "2602782"],
  ["二次元痛房我也有了", 7644000, "2602389"],
  ["王者无尽之局皮肤实战测评", 7641000, "2602260"],
  ["早秋韩系奶油风穿搭", 7640000, "2602210"],
  ["三角洲鸟窝活动攻略", 7640000, "2602022"],
  ["我想呼风唤雨", 7639000, "2601831"],
  ["叫号取餐选秀大会", 7639000, "2601829"],
  ["家门口徒步燃起来了", 7635000, "2601702"],
  ["火把节的抹黑祝福", 7634000, "2601555"],
  ["王玉雯刺激之夜粉色双马尾", 7634000, "2602558"],
];

function recommendationFor(topicName: string, category: string, relevance: number) {
  if (topicName.includes("草原")) return "借势辽阔感，不冒充草原；用峡谷远景与人物停留镜头表达‘在自然里站一会’。";
  if (topicName.includes("慢充旅行")) return "拍摄独库公路—独山子大峡谷慢旅行路线，突出停留、放空和可执行行程。";
  if (topicName.includes("徒步")) return "以安全游线和轻徒步体验切入，前三秒展示峡谷纵深，字幕注明路线与安全边界。";
  if (topicName.includes("火把节")) return "结合新疆民俗氛围做知识型内容，避免挪用具体民族仪式或制造不实活动信息。";
  if (category === "旅游") return "仅在能自然连接暑期、新疆旅行或景区体验时跟进，避免生硬蹭热点。";
  if (relevance < 45) return "与景区资源关联较弱，不建议直接跟进。";
  return "以独山子大峡谷真实游览场景承接热点表达，并补充路线、天气和安全信息。";
}

export function buildDouyinHotTopicPreview(historicalText = "") {
  const topics = rawTopics.map(([topicName, heatValue, sourceRecordId], index) => {
    const category = classifyHotTopic(topicName);
    const relatedDegree = calculateRelevance({
      topicName,
      keyword: topicName,
      category,
      historicalText,
    });
    return {
      platform: "douyin",
      topic_name: topicName,
      keyword: topicName,
      heat_value: heatValue,
      ranking: index + 1,
      trend: "new",
      trend_note: "首次采集，暂无上一时点快照，不伪造涨跌趋势",
      category,
      related_degree: relatedDegree / 100,
      related_reason: relatedDegree >= 70 ? "命中新疆、旅行、户外或民俗资源信号" : relatedDegree >= 45 ? "可通过暑期或在地体验弱关联" : "与独山子大峡谷核心资源关联较弱",
      ai_suggestion: recommendationFor(topicName, category, relatedDegree),
      source_url: `https://www.douyin.com/hot/${sourceRecordId}/${encodeURIComponent(topicName)}`,
      source_record_id: sourceRecordId,
      collect_time: DOUYIN_HOT_COLLECTED_AT,
      status: "active",
    };
  });
  const opportunityPool = topics.filter((topic) => topic.related_degree >= 0.7);
  return {
    schemaVersion: "1.0",
    previewToken: DOUYIN_HOT_PREVIEW_TOKEN,
    previewOnly: true,
    confirmed: false,
    source: { platform: "douyin", name: "抖音官方热榜", url: DOUYIN_HOT_SOURCE_URL },
    collectedAt: DOUYIN_HOT_COLLECTED_AT,
    totalCount: topics.length,
    successCount: topics.length,
    failedCount: 0,
    top10: topics.slice(0, 10),
    topics,
    opportunities: ruleBasedTopicEngine.generate(opportunityPool, []),
    analysis: {
      top10Conclusion: "官方TOP10以台风、时事、体育和泛娱乐为主，与景区直接关联偏低，不建议生硬跟进。",
      recommendedTopics: opportunityPool.slice(0, 8).map((topic) => ({
        ranking: topic.ranking,
        topic: topic.topic_name,
        relevance: Math.round(topic.related_degree * 100),
        reason: topic.related_reason,
        recommendedTitle: topic.topic_name.includes("草原")
          ? "我在独山子大峡谷站了一会，风把时间吹慢了"
          : topic.topic_name.includes("慢充")
            ? "把旅行调成慢充模式：独库公路第一站这样玩"
            : topic.topic_name.includes("徒步")
              ? "家门口的峡谷轻徒步，第一视角有多震撼"
              : "新疆的祝福不止一种：在峡谷边读懂民俗温度",
        direction: topic.ai_suggestion,
        shootingDirection: topic.topic_name.includes("火把节")
          ? "采用民俗知识旁白、环境空镜与游客文明体验画面，不虚构景区活动。"
          : "前三秒用峡谷纵深或人物小景别建立冲击力，中段补路线与体验，结尾用提问引导评论。",
      })),
    },
  };
}
