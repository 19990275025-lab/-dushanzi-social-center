export default function InsightsHomePage() {
  return (
    <div className="page-stack insights-home-page">
      <header className="page-heading compact-heading">
        <div>
          <p className="eyebrow">CONTENT &amp; AUDIENCE INTELLIGENCE</p>
          <h1>内容与用户洞察中心</h1>
          <p>内容表现与粉丝资产分开分析，避免指标混杂，支持按业务问题快速进入对应视图。</p>
        </div>
        <div className="data-freshness"><span className="status-dot" />真实数据库驱动</div>
      </header>

      <section className="insight-entry-grid" aria-label="洞察功能入口">
        <a className="insight-entry-card content-entry" href="/insights/content">
          <span className="entry-code">01</span>
          <div className="entry-icon">内</div>
          <p>CONTENT ANALYSIS</p>
          <h2>内容分析</h2>
          <small>查看作品数量、播放、互动、内容类型、爆款排行、AI 建议及内容转粉关联。</small>
          <strong>进入内容分析 <i>→</i></strong>
        </a>
        <a className="insight-entry-card fans-entry" href="/insights/fans">
          <span className="entry-code">02</span>
          <div className="entry-icon">粉</div>
          <p>FAN ANALYSIS</p>
          <h2>粉丝分析</h2>
          <small>查看四平台粉丝量、增长趋势、地域、年龄、兴趣及活跃时间画像。</small>
          <strong>进入粉丝分析 <i>→</i></strong>
        </a>
      </section>

      <section className="panel insight-boundary-panel">
        <span>V1.0 数据边界</span>
        <p>内容分析读取 <code>social_posts</code>；粉丝分析读取 <code>social_accounts</code>、<code>social_fans</code> 与 <code>fan_growth_records</code>。粉丝采集数据缺失时只展示明确的等待状态，不生成虚构画像。</p>
      </section>
    </div>
  );
}
