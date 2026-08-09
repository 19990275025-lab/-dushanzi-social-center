"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";

type Post = {
  id: number;
  title: string;
  platform: string;
  content_type: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
};

export default function ContentPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [platform, setPlatform] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("publish_time");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPosts = useCallback(() => {
    const params = new URLSearchParams({ platform, sort });
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    fetch(`/api/posts?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("内容数据读取失败");
        return response.json() as Promise<{ posts: Post[] }>;
      })
      .then((result) => {
        setPosts(result.posts);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [from, platform, sort, to]);

  useEffect(loadPosts, [loadPosts]);

  return (
    <div className="page-stack">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">CONTENT PERFORMANCE</p><h1>内容分析</h1><p>按平台、日期和核心指标审视作品表现。</p></div>
        <div className="data-freshness"><span className="status-dot" />数据来自 social_posts</div>
      </header>

      <section className="panel filter-panel">
        <div className="filter-group">
          <label>平台<select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">全部平台</option><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option>
          </select></label>
          <label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>排序方式<select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="publish_time">发布时间</option><option value="views">播放量</option><option value="likes">点赞量</option><option value="comments">评论量</option><option value="favorites">收藏量</option><option value="shares">分享量</option>
          </select></label>
        </div>
        <div className="filter-result"><strong>{posts.length}</strong><span>条作品</span></div>
      </section>

      <section className="panel data-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">CONTENT LIBRARY</span><h2>作品数据</h2></div>
          {loading && <span className="loading-inline">正在更新…</span>}
        </div>
        {error ? <div className="error-panel inline-error">{error}</div> : (
          <div className="table-wrap">
            <table className="content-table">
              <thead><tr><th>标题</th><th>平台</th><th>发布时间</th><th>播放</th><th>点赞</th><th>评论</th><th>收藏</th><th>分享</th></tr></thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td><div className="content-title"><span>{post.content_type === "video" ? "▶" : "文"}</span><strong>{post.title}</strong></div></td>
                    <td><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span></td>
                    <td className="date-cell">{formatDate(post.publish_time)}</td>
                    <td className="metric-cell">{formatCompact(post.views)}</td>
                    <td>{formatCompact(post.likes)}</td><td>{formatCompact(post.comments)}</td><td>{formatCompact(post.favorites)}</td><td>{formatCompact(post.shares)}</td>
                  </tr>
                ))}
                {!loading && posts.length === 0 && <tr><td className="empty-cell" colSpan={8}>当前筛选条件下没有作品数据</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
