import { evaluateContentEffects, type ContentEffectFact } from "./content-effect-evaluation";
import { KuaishouEvaluationStrategy } from "./kuaishou-evaluation";

// A single dispatch boundary, not three copied AI engines. The Douyin function and weights are unchanged.
export const DouyinEvaluationStrategy = {
  evaluate(posts: ContentEffectFact[], selectedIds: Set<number>) {
    if (posts.some(p => p.platform !== "douyin")) throw new Error("抖音评价策略拒绝其他平台数据");
    return evaluateContentEffects(posts, selectedIds);
  },
};
export const platformEvaluationStrategies = { douyin: DouyinEvaluationStrategy, kuaishou: KuaishouEvaluationStrategy } as const;
