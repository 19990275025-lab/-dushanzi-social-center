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

async function collectVisibleDouyinComments() {
  if (!location.hostname.endsWith("douyin.com") || !/\/(video|note)\//.test(location.pathname)) {
    throw new Error("请先从作品列表的评论入口进入作品详情页");
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  for (let round = 0; round < 8; round += 1) {
    window.scrollBy({ top: Math.max(window.innerHeight * 0.9, 600), behavior: "smooth" });
    await wait(450);
  }
  for (let round = 0; round < 3; round += 1) {
    const expandButtons = Array.from(document.querySelectorAll("button")).filter((button) => /展开\s*\d+\s*条回复/.test(button.innerText || ""));
    if (!expandButtons.length) break;
    for (const button of expandButtons.slice(0, 50)) button.click();
    await wait(500);
  }

  const parseMetric = (value) => {
    const normalized = String(value ?? "").replaceAll(",", "").trim();
    const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([万亿]?)/);
    if (!match) return 0;
    const factor = match[2] === "亿" ? 100000000 : match[2] === "万" ? 10000 : 1;
    return Math.max(0, Math.round(Number(match[1]) * factor));
  };
  const parseCommentTime = (value) => {
    const text = String(value ?? "").split("·")[0].trim();
    const now = new Date();
    const relative = text.match(/(\d+)\s*(分钟|小时|天|周|个月|月|年)前/);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2];
      const milliseconds = unit === "分钟" ? 60000 : unit === "小时" ? 3600000 : unit === "天" ? 86400000 : unit === "周" ? 604800000 : unit === "年" ? 31536000000 : 2592000000;
      return new Date(now.getTime() - amount * milliseconds).toISOString();
    }
    if (text === "刚刚") return now.toISOString();
    const full = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/);
    if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]), Number(full[4] || 0), Number(full[5] || 0)).toISOString();
    const short = text.match(/(\d{1,2})[-/.月](\d{1,2})日?/);
    if (short) return new Date(now.getFullYear(), Number(short[1]) - 1, Number(short[2])).toISOString();
    return "";
  };

  const commentHeading = Array.from(document.querySelectorAll("*")).find((element) => (element.textContent || "").trim() === "全部评论");
  let commentRoot = commentHeading?.parentElement || document.body;
  for (let level = 0; level < 5 && commentRoot.parentElement; level += 1) {
    const parent = commentRoot.parentElement;
    const userLinks = parent.querySelectorAll('a[href*="/user/"]').length;
    if (userLinks > 60 || (parent.innerText || "").length > 30000) break;
    commentRoot = parent;
  }

  const anchors = Array.from(commentRoot.querySelectorAll('a[href*="/user/"]'));
  const rows = [];
  const seenCards = new Set();
  for (const anchor of anchors) {
    let card = anchor.parentElement;
    for (let level = 0; level < 6 && card; level += 1, card = card.parentElement) {
      const text = String(card.innerText || "");
      if (text.includes("回复") && /(刚刚|\d+\s*(?:分钟|小时|天|周|个月|月|年)前|20\d{2}[-/.年]|\d{1,2}[-/.月]\d{1,2})/.test(text)) break;
    }
    if (!card || seenCards.has(card)) continue;
    const rawText = String(card.innerText || "").replace(/\r/g, "");
    if (!rawText.includes("回复") || rawText.length > 2500) continue;

    const username = String(anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const timeMatch = rawText.match(/(刚刚|\d+\s*(?:分钟|小时|天|周|个月|月|年)前|20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?|\d{1,2}[-/.月]\d{1,2}日?)(?:·[^\n]*)?/);
    const commentTime = parseCommentTime(timeMatch?.[0] || "");
    const paragraphNumbers = Array.from(card.querySelectorAll("p")).map((node) => (node.textContent || "").trim()).filter((value) => /^[0-9.,]+\s*[万亿]?$/.test(value));
    const likes = parseMetric(paragraphNumbers[0] || "0");
    const clone = card.cloneNode(true);
    for (const image of clone.querySelectorAll("img")) image.replaceWith(document.createTextNode(image.getAttribute("alt") || ""));
    const lines = String(clone.innerText || "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const ignored = new Set([username, "...", "分享", "回复", "作者", ...paragraphNumbers]);
    const commentText = lines.filter((line) => !ignored.has(line) && !/^展开\d+条回复$/.test(line) && !/(刚刚|\d+\s*(?:分钟|小时|天|周|个月|月|年)前|20\d{2}[-/.年]|\d{1,2}[-/.月]\d{1,2})/.test(line)).join(" ").trim().slice(0, 2000);
    if (!username || !commentText || !commentTime) continue;

    seenCards.add(card);
    rows.push({
      rowNumber: rows.length + 1,
      postUrl: `${location.origin}${location.pathname}`,
      username,
      commentText,
      commentTime,
      likes,
    });
    if (rows.length >= 50) break;
  }

  return {
    schemaVersion: "1.0",
    source: "chrome-extension",
    entityType: "comment",
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

document.getElementById("collect-comments").addEventListener("click", async () => {
  const button = document.getElementById("collect-comments");
  button.disabled = true;
  showStatus("正在加载并读取当前作品前 50 条评论……");
  document.getElementById("result").hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("无法读取当前标签页");
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectVisibleDouyinComments });
    latestPayload = results[0]?.result ?? null;
    if (!latestPayload?.rows?.length) throw new Error("未识别到评论，请确认已从评论入口进入详情并加载评论区域");
    showStatus(`采集完成：${latestPayload.rows.length} 条评论。请导出后上传预览。`);
    document.getElementById("count").textContent = `${latestPayload.rows.length} 条评论`;
    document.getElementById("result").hidden = false;
  } catch (error) {
    latestPayload = null;
    showStatus(error instanceof Error ? error.message : "评论采集失败", true);
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
    filename: `douyin-${latestPayload.entityType === "comment" ? "comments" : "collection"}-${latestPayload.collectedAt.slice(0, 10)}.json`,
    saveAs: true,
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
