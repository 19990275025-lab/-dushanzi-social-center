let latestPayload = null;

function showStatus(message, error = false) {
  const node = document.getElementById("status");
  node.textContent = message;
  node.classList.toggle("error", error);
}

async function collectVisibleDouyinPosts() {
  if (!location.hostname.endsWith("douyin.com")) {
    throw new Error("当前页面不是抖音页面");
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  for (let round = 0; round < 5; round += 1) {
    window.scrollBy({ top: Math.max(window.innerHeight * 0.85, 500), behavior: "smooth" });
    await wait(450);
  }

  const parseMetric = (value) => {
    const normalized = String(value ?? "").replaceAll(",", "").trim();
    const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([万亿]?)/);
    if (!match) return 0;
    const factor = match[2] === "亿" ? 100000000 : match[2] === "万" ? 10000 : 1;
    return Math.max(0, Math.round(Number(match[1]) * factor));
  };
  const metricByLabel = (text, labels) => {
    for (const label of labels) {
      const expression = new RegExp(`${label}[：:\\s]*([0-9.,]+\\s*[万亿]?)`, "i");
      const match = text.match(expression);
      if (match) return parseMetric(match[1]);
    }
    return 0;
  };
  const parseDate = (text) => {
    const full = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/);
    if (full) {
      const [, year, month, day, hour = "00", minute = "00"] = full;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).toISOString();
    }
    const short = text.match(/(?:发布于\s*)?(\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/);
    if (short) {
      const now = new Date();
      const [, month, day, hour = "00", minute = "00"] = short;
      return new Date(now.getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute)).toISOString();
    }
    return "";
  };
  const absoluteUrl = (value) => {
    try { return new URL(value, location.origin).href; } catch { return ""; }
  };

  const anchors = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="/note/"]'));
  const seen = new Set();
  const rows = [];
  for (const anchor of anchors) {
    const videoUrl = absoluteUrl(anchor.getAttribute("href"));
    if (!videoUrl || seen.has(videoUrl)) continue;
    const card = anchor.closest('article, li, [data-e2e*="video"], [class*="video-card"], [class*="video-item"], [class*="content-item"], [class*="work-item"]') || anchor.parentElement;
    if (!card) continue;
    const text = String(card.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 1800);
    const titleNode = card.querySelector('[title], [class*="title"], [class*="desc"]');
    const title = String(
      titleNode?.getAttribute("title") || titleNode?.textContent || anchor.getAttribute("title") || anchor.textContent || "",
    ).replace(/\s+/g, " ").trim().slice(0, 500);
    if (!title || title.length < 2) continue;
    const image = card.querySelector("img");
    const hashtags = Array.from(new Set((text.match(/#[^#\s，。！？、]{1,30}/g) || []).map((tag) => tag.slice(1)))).slice(0, 20);
    const durationText = text.match(/(?:时长[：:\s]*)?(\d{1,2}):(\d{2})(?:\s|$)/);

    seen.add(videoUrl);
    rows.push({
      rowNumber: rows.length + 1,
      platform: "douyin",
      title,
      publishTime: parseDate(text),
      contentType: videoUrl.includes("/note/") ? "image_text" : "video",
      videoUrl,
      coverUrl: absoluteUrl(image?.currentSrc || image?.src || ""),
      views: metricByLabel(text, ["播放量", "播放"]),
      likes: metricByLabel(text, ["点赞量", "点赞"]),
      comments: metricByLabel(text, ["评论量", "评论"]),
      favorites: metricByLabel(text, ["收藏量", "收藏"]),
      shares: metricByLabel(text, ["分享量", "分享"]),
      fansGrowth: metricByLabel(text, ["涨粉量", "涨粉"]),
      hashtags,
      duration: durationText ? Number(durationText[1]) * 60 + Number(durationText[2]) : null,
    });
    if (rows.length >= 100) break;
  }

  return {
    schemaVersion: "1.0",
    source: "chrome-extension",
    platform: "douyin",
    collectedAt: new Date().toISOString(),
    pageUrl: location.href,
    rows,
  };
}

document.getElementById("collect").addEventListener("click", async () => {
  const button = document.getElementById("collect");
  button.disabled = true;
  showStatus("正在滚动并读取当前页面已显示的作品……");
  document.getElementById("result").hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("无法读取当前标签页");
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectVisibleDouyinPosts,
    });
    latestPayload = results[0]?.result ?? null;
    if (!latestPayload?.rows?.length) {
      throw new Error("未识别到作品，请打开作品管理列表并确保作品卡片已加载");
    }
    showStatus(`采集完成：${latestPayload.rows.length} 条。请导出后上传校验。`);
    document.getElementById("count").textContent = `${latestPayload.rows.length} 条作品`;
    document.getElementById("result").hidden = false;
  } catch (error) {
    latestPayload = null;
    showStatus(error instanceof Error ? error.message : "采集失败", true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("download").addEventListener("click", async () => {
  if (!latestPayload) return;
  const blob = new Blob([JSON.stringify(latestPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: `douyin-collection-${latestPayload.collectedAt.slice(0, 10)}.json`,
    saveAs: true,
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
