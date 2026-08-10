const express = require("express");
const router = express.Router();
const { fetchFavicon, normalizeDomain, resizeToSize } = require("../faviconFetcher");
const { getCache } = require("../cache");

/**
 * 解析并验证 size 参数
 * @returns {number} 有效尺寸（16-512），0 表示不缩放
 */
function parseSize(raw) {
  if (raw === undefined || raw === null || raw === "") return 0;
  const size = parseInt(raw, 10);
  if (isNaN(size) || size < 16 || size > 512) return 0;
  return size;
}

/**
 * GET /api/favicon?domain_url=xxx&size=256
 * GET /api/favicon/:domain
 */
router.get(["/favicon", "/favicon/:domain"], async (req, res) => {
  const domainInput = req.query.domain_url || req.params.domain || req.query.domain;

  if (!domainInput) {
    return res.status(400).json({
      error: "缺少 domain_url 参数",
      usage: "/api/favicon?domain_url=github.com 或 /api/favicon/github.com",
    });
  }

  const domain = normalizeDomain(domainInput);
  const size = parseSize(req.query.size);

  if (!domain) {
    return res.status(400).json({ error: "无效的域名" });
  }

  // 1. 先检查缓存（内存 → 文件）
  const cached = getCache(domain);
  if (cached) {
    let respData = cached.data;
    let respType = cached.contentType;

    // 使用缓存中已存储的原始尺寸
    if (cached.originalSize !== null && cached.originalSize !== undefined) {
      res.set("X-Icon-Size", String(Math.round(cached.originalSize)));
    }

    // 如果指定了尺寸，对缓存数据缩放
    if (size >= 16) {
      respData = resizeToSize(cached.data, cached.contentType, size);
      respType = "image/svg+xml";
    }

    res.set("Content-Type", respType);
    res.set("X-Source", "cache");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(respData);
  }

  // 2. 缓存未命中，获取 favicon
  try {
    const result = await fetchFavicon(domainInput, size);

    // 设置原始图标尺寸头
    if (result.originalSize !== null && result.originalSize !== undefined) {
      res.set("X-Icon-Size", String(Math.round(result.originalSize)));
    }

    res.set("Content-Type", result.contentType);
    res.set("X-Source", result.source);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(result.data);
  } catch (err) {
    console.error("获取 favicon 失败:", err.message);
    return res.status(500).json({ error: "获取 favicon 失败", message: err.message });
  }
});

/**
 * GET /api/info?domain_url=xxx
 * 返回 favicon 信息（源、域名等，不含图片数据）
 */
router.get("/info", async (req, res) => {
  const domainInput = req.query.domain_url || req.query.domain;
  if (!domainInput) {
    return res.status(400).json({ error: "缺少 domain_url 参数" });
  }

  const domain = normalizeDomain(domainInput);
  const cached = getCache(domain);

  res.json({
    domain,
    cached: !!cached,
    source: cached ? "cache" : "not-fetched-yet",
    apiUrl: `/api/favicon?domain_url=${domain}`,
  });
});

module.exports = router;
