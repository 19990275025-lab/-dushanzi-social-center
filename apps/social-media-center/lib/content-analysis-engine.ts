export type AnalysisPost = {
  id: number;
  account_id: number;
  platform: string;
  title: string;
  content_type: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  fans_growth: number;
  hashtags: string[];
  duration: number | null;
};

export type AnalysisTopic = {
  platform: string;
  topic_name: string;
  keyword: string;
  heat_value: number;
  trend: string;
  related_degree: number | null;
  ai_suggestion: string | null;
};

export type ScoreDimensions = {
  visualAttraction: number;
  titleQuality: number;
  interactionAbility: number;
  propagationAbility: number;
  hotMatch: number;
};

export type AnalyzedPost = AnalysisPost & {
  viralScore: number;
  overallScore: number;
  dimensions: ScoreDimensions;
  strengths: string[];
  issues: string[];
  suggestions: string[];
  engagementRate: number;
};

export type TopicIdea = {
  sourceTopic: string;
  title: string;
  direction: string;
  platform: string;
  shootingMethod: string;
};

const dimensionNames: Record<keyof ScoreDimensions, string> = {
  visualAttraction: "视觉吸引力",
  titleQuality: "标题质量",
  interactionAbility: "互动能力",
  propagationAbility: "传播能力",
  hotMatch: "热点匹配度",
};

const clamp = (value: number, min = 0, max = 100) => Math.round(Math.min(max, Math.max(min, value)));
const rate = (value: number, total: number) => total > 0 ? value / total : 0;

function topicMatchScore(post: AnalysisPost, topics: AnalysisTopic[]) {
  const text = `${post.title} ${post.hashtags.join(" ")}`.toLowerCase();
  const matched = topics.filter((topic) => {
    const tokens = [topic.keyword, topic.topic_name]
      .flatMap((value) => value.split(/[\s,，#、/：:]+/))
      .filter((value) => value.length >= 2);
    return tokens.some((token) => text.includes(token.toLowerCase()));
  });
  if (!matched.length) {
    return /独山子|峡谷|新疆|旅游|旅行|游客|自驾/.test(text) ? 66 : 42;
  }
  const best = Math.max(...matched.map((topic) => (topic.related_degree ?? 0.6) * 100));
  return clamp(68 + best * 0.3 + Math.min(6, matched.length * 2));
}

function titleScore(post: AnalysisPost, topics: AnalysisTopic[]) {
  const length = [...post.title].length;
  let score = 50;
  if (length >= 8 && length <= 26) score += 18;
  else if (length >= 5 && length <= 36) score += 10;
  if (/[0-9一二三四五六七八九十]|攻略|挑战|第一视角|为什么|如何|？|！/.test(post.title)) score += 14;
  if (post.hashtags.length >= 2) score += 8;
  if (topicMatchScore(post, topics) >= 80) score += 10;
  return clamp(score);
}

function normalizedReach(views: number, platformAverageViews: number) {
  if (views <= 0) return 20;
  const ratio = views / Math.max(platformAverageViews, 1);
  return clamp(60 + Math.log2(Math.max(ratio, 0.125)) * 16, 24, 98);
}

export interface ContentAnalysisEngine {
  readonly name: string;
  analyzePosts(posts: AnalysisPost[], topics: AnalysisTopic[]): AnalyzedPost[];
  recommendTopics(topics: AnalysisTopic[], analyzedPosts: AnalyzedPost[]): TopicIdea[];
}

export const ruleBasedContentEngine: ContentAnalysisEngine = {
  name: "content-rules-v1",

  analyzePosts(posts, topics) {
    const platformAverages = new Map<string, number>();
    for (const platform of ["douyin", "kuaishou", "weibo"]) {
      const values = posts.filter((post) => post.platform === platform).map((post) => post.views);
      platformAverages.set(platform, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1);
    }

    return posts.map((post) => {
      const reach = normalizedReach(post.views, platformAverages.get(post.platform) ?? 1);
      const engagementRate = rate(post.likes + post.comments + post.favorites + post.shares, post.views);
      const commentRate = rate(post.comments, post.views);
      const shareRate = rate(post.shares, post.views);
      const favoriteRate = rate(post.favorites, post.views);

      const dimensions: ScoreDimensions = {
        visualAttraction: clamp(reach * 0.72 + Math.min(100, favoriteRate / 0.035 * 100) * 0.18 + (post.content_type === "video" ? 10 : 5)),
        titleQuality: titleScore(post, topics),
        interactionAbility: clamp(Math.min(100, engagementRate / 0.12 * 100) * 0.75 + Math.min(100, commentRate / 0.008 * 100) * 0.25),
        propagationAbility: clamp(Math.min(100, shareRate / 0.025 * 100) * 0.65 + Math.min(100, favoriteRate / 0.04 * 100) * 0.35),
        hotMatch: topicMatchScore(post, topics),
      };

      const overallScore = clamp(
        dimensions.visualAttraction * 0.25 + dimensions.titleQuality * 0.2 +
        dimensions.interactionAbility * 0.2 + dimensions.propagationAbility * 0.2 +
        dimensions.hotMatch * 0.15,
      );
      const viralScore = clamp(reach * 0.4 + Math.min(100, engagementRate / 0.12 * 100) * 0.3 +
        Math.min(100, shareRate / 0.025 * 100) * 0.2 + Math.min(100, Math.max(0, post.fans_growth) / 3000 * 100) * 0.1);

      const sortedDimensions = (Object.entries(dimensions) as Array<[keyof ScoreDimensions, number]>).sort((a, b) => b[1] - a[1]);
      const strengths = sortedDimensions.slice(0, 2).map(([key, value]) => `${dimensionNames[key]}表现突出（${value}分）`);
      const weakDimensions = [...sortedDimensions].reverse().slice(0, 2);
      const issues = weakDimensions.filter(([, value]) => value < 75).map(([key, value]) => `${dimensionNames[key]}仍有提升空间（${value}分）`);
      if (!issues.length) issues.push("核心维度较均衡，需要通过连续选题验证稳定性");

      const suggestions: string[] = [];
      if (dimensions.visualAttraction < 75) suggestions.push("前三秒先展示峡谷尺度感最强的画面，并减少铺垫镜头。");
      if (dimensions.titleQuality < 75) suggestions.push("标题增加明确利益点、数字或游客问题，控制在 8–26 字。");
      if (dimensions.interactionAbility < 75) suggestions.push("结尾加入路线选择或体验投票，给用户一个具体评论入口。");
      if (dimensions.propagationAbility < 75) suggestions.push("补充可收藏的路线、机位和安全提示，提升分享与收藏动机。");
      if (dimensions.hotMatch < 75) suggestions.push("从当前高关联热点中选择一个关键词，并自然写入标题和标签。");
      if (!suggestions.length) suggestions.push("保留当前结构，制作同主题系列内容并比较不同开场镜头。");

      return { ...post, viralScore, overallScore, dimensions, strengths, issues, suggestions, engagementRate };
    }).sort((a, b) => b.overallScore - a.overallScore || b.views - a.views);
  },

  recommendTopics(topics, analyzedPosts) {
    const bestPost = analyzedPosts[0];
    return [...topics]
      .filter((topic) => topic.trend !== "falling")
      .sort((a, b) => (b.related_degree ?? 0) - (a.related_degree ?? 0) || b.heat_value - a.heat_value)
      .slice(0, 4)
      .map((topic, index) => {
        const platform = topic.platform || (index % 2 === 0 ? "douyin" : "weibo");
        const keyword = topic.keyword || topic.topic_name;
        return {
          sourceTopic: topic.topic_name,
          title: platform === "weibo"
            ? `为什么说${keyword}一定要来一次独山子大峡谷？`
            : `${keyword}第一视角：在独山子大峡谷的一天`,
          direction: `用“${keyword}”承接热点，结合景区路线、真实体验与可执行攻略。${bestPost ? `参考高分作品《${bestPost.title}》的内容结构。` : ""}`,
          platform,
          shootingMethod: platform === "weibo"
            ? "图文或短视频并用，首图给峡谷全景，正文补路线、时间和安全信息。"
            : "竖屏第一视角，前三秒强景别切入，中段展示路线，结尾设置评论问题。",
        };
      });
  },
};

export const scoreWeights = {
  visualAttraction: 25,
  titleQuality: 20,
  interactionAbility: 20,
  propagationAbility: 20,
  hotMatch: 15,
};
