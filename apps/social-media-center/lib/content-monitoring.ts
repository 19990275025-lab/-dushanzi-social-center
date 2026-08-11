export type MonitorPost = {
  id: number;
  title: string;
  content_type: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  duration: number | null;
  completion_rate: number | null;
  skip_rate: number | null;
};

export const interactionCount = (post: Pick<MonitorPost, "likes" | "comments" | "favorites" | "shares">) =>
  post.likes + post.comments + post.favorites + post.shares;

export const percentage = (value: number, denominator: number) =>
  denominator > 0 ? Number(((value / denominator) * 100).toFixed(2)) : 0;

function titleTraits(title: string) {
  const traits: string[] = [];
  if (/\d|[一二三四五六七八九十百千万]/.test(title)) traits.push("数字信息明确");
  if (/？|\?|为什么|如何|怎么|吗/.test(title)) traits.push("问题式标题");
  if (/攻略|路线|门票|打卡|必看|挑战|第一视角/.test(title)) traits.push("利益点清晰");
  if (/#/.test(title)) traits.push("标签承接搜索");
  if ([...title].length >= 8 && [...title].length <= 30) traits.push("标题长度适中");
  return traits.length ? traits.join("、") : "主题直接，但利益点和搜索关键词仍可加强";
}

function shootingMethod(title: string) {
  if (/第一视角|游客|体验|挑战|穿越/.test(title)) return "游客第一视角跟拍，保留真实反应与项目过程";
  if (/攻略|路线|门票|怎么玩|打卡|自驾/.test(title)) return "路线型实拍，使用全景交代位置并用近景补充关键细节";
  if (/日落|峡谷|风景|航拍|云海|雪|夕阳/.test(title)) return "大景别建立峡谷尺度感，搭配移动镜头和人物作比例参照";
  if (/活动|比赛|大赛|直播/.test(title)) return "现场多机位记录，重点捕捉人群参与和高能瞬间";
  return "竖屏实拍，前三秒用最强画面建立景区辨识度";
}

function contentStructure(post: MonitorPost) {
  const opening = /攻略|路线|门票|怎么玩/.test(post.title)
    ? "前三秒抛出游客问题或明确利益点"
    : "前三秒先给峡谷最具冲击力的画面";
  const middle = /挑战|体验|游客|第一视角/.test(post.title)
    ? "中段呈现真实体验过程与游客反应"
    : "中段补充场景、路线或项目细节";
  const ending = interactionCount(post) > 0 ? "结尾延续评论互动" : "结尾增加具体评论问题";
  return `${opening} → ${middle} → ${ending}`;
}

export function buildBreakoutAnalysis(
  post: MonitorPost & { aiScore: number; capturedComments: number; topKeywords: string[] },
  averageViews: number,
) {
  const rate = percentage(interactionCount(post), post.views);
  const reasons: string[] = [];
  if (post.views >= averageViews * 1.5 && averageViews > 0) reasons.push(`播放达到周期均值的 ${(post.views / averageViews).toFixed(1)} 倍`);
  else if (post.views >= averageViews && averageViews > 0) reasons.push("播放高于周期均值");
  if (rate >= 3) reasons.push(`互动率达到 ${rate}%`);
  if ((post.completion_rate ?? 0) >= 30) reasons.push(`完播率达到 ${post.completion_rate}%`);
  if (post.capturedComments > 0) reasons.push(`已有 ${post.capturedComments} 条真实评论样本`);
  if (!reasons.length) reasons.push("当前周期内综合表现相对领先，仍需更多样本验证爆款稳定性");

  return {
    postId: post.id,
    title: post.title,
    views: post.views,
    aiScore: post.aiScore,
    reason: reasons.join("；"),
    structure: contentStructure(post),
    titleFeature: titleTraits(post.title),
    shootingMethod: shootingMethod(post.title),
    commentSignal: post.topKeywords.length ? `评论关注：${post.topKeywords.join("、")}` : "评论关键词样本不足",
  };
}

export function buildLowEfficiencyDiagnosis(
  post: MonitorPost & { aiScore: number; capturedComments: number },
  averageViews: number,
) {
  const rate = percentage(interactionCount(post), post.views);
  const reasons: string[] = [];
  const suggestions: string[] = [];

  if (post.views < averageViews * 0.7) {
    reasons.push("播放明显低于周期均值");
    suggestions.push("把峡谷强画面或游客结果前置到前三秒，减少铺垫");
  }
  if (rate < 2) {
    reasons.push(`互动率仅 ${rate}%`);
    suggestions.push("结尾设置路线、项目或机位选择题，引导具体评论");
  }
  if ((post.completion_rate ?? 100) < 20) {
    reasons.push(`完播率仅 ${post.completion_rate}%`);
    suggestions.push("压缩重复镜头，围绕一个核心问题重排内容节奏");
  }
  if (post.aiScore < 60) {
    reasons.push(`AI评分为 ${post.aiScore} 分`);
    suggestions.push("重写标题，加入数字、游客问题或可收藏的信息点");
  }
  if (post.capturedComments === 0) suggestions.push("补充评论内容采集，再验证游客真实反馈");

  return {
    postId: post.id,
    title: post.title,
    publishTime: post.publish_time,
    views: post.views,
    interactionRate: rate,
    aiScore: post.aiScore,
    reasons: [...new Set(reasons)],
    suggestions: [...new Set(suggestions)].slice(0, 3),
  };
}
