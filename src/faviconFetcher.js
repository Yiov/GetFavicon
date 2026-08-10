const axios = require("axios");
const cheerio = require("cheerio");
const { setCache } = require("./cache");

const TIMEOUT = 5000; // 请求超时 5 秒
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 默认占位图（256x256 SVG 地球图标）
const DEFAULT_FAVICON = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="globe" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6c5ce7"/>
      <stop offset="100%" stop-color="#a29bfe"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)" rx="36"/>
  <circle cx="128" cy="128" r="90" fill="none" stroke="url(#globe)" stroke-width="5" opacity="0.6"/>
  <ellipse cx="128" cy="128" rx="45" ry="90" fill="none" stroke="url(#globe)" stroke-width="3" opacity="0.5"/>
  <line x1="38" y1="128" x2="218" y2="128" stroke="url(#globe)" stroke-width="3" opacity="0.5"/>
  <line x1="128" y1="38" x2="128" y2="218" stroke="url(#globe)" stroke-width="3" opacity="0.5"/>
  <line x1="70" y1="60" x2="186" y2="196" stroke="url(#globe)" stroke-width="2" opacity="0.3"/>
  <line x1="186" y1="60" x2="70" y2="196" stroke="url(#globe)" stroke-width="2" opacity="0.3"/>
</svg>`);

/**
 * 从各种格式的 URL 中提取纯净域名
 * 支持: https://www.baidu.com/、www.baidu.com、baidu.com、//baidu.com/path 等
 */
function normalizeDomain(input) {
  if (!input || typeof input !== "string") return "";
  let cleaned = input.trim();
  // 去除协议头（大小写不敏感，含 // 开头）
  cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^\/\//, "");
  // 去除路径、锚点、query
  cleaned = cleaned.split("/")[0].split("#")[0].split("?")[0];
  // 去除端口
  cleaned = cleaned.split(":")[0];
  // 去除前后空格和点
  cleaned = cleaned.replace(/\.+$/, "").replace(/^\.+/, "");
  return cleaned;
}

/**
 * 将任意 favicon 缩放到指定尺寸
 * - SVG: 直接修改 width/height/viewBox
 * - 位图 (PNG/ICO/JPG等): 封装在对应尺寸的 SVG <image> 标签中
 */
function resizeToSize(data, contentType, size) {
  const isSvg = contentType && contentType.includes("svg");
  if (isSvg) {
    return resizeSvgToSize(data, size);
  }
  return wrapInSvgSize(data, contentType, size);
}

/** 修改 SVG 的 width/height/viewBox 为指定尺寸 */
function resizeSvgToSize(svgData, size) {
  let svg = svgData.toString("utf-8");
  svg = svg.replace(/width="[^"]*"/gi, `width="${size}"`);
  svg = svg.replace(/height="[^"]*"/gi, `height="${size}"`);
  if (/viewBox=/i.test(svg)) {
    svg = svg.replace(/viewBox="[^"]*"/gi, `viewBox="0 0 ${size} ${size}"`);
  } else {
    svg = svg.replace(/<svg/i, `<svg viewBox="0 0 ${size} ${size}"`);
  }
  return Buffer.from(svg);
}

/** 将位图封装在指定尺寸的 SVG <image> 中 */
function wrapInSvgSize(data, contentType, size) {
  const base64 = data.toString("base64");
  const mime = contentType || "image/png";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<image href="data:${mime};base64,${base64}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` +
    `</svg>`
  );
}

/**
 * 策略 1: 解析目标网站 HTML，提取 <link rel="icon"> 等标签
 */
async function fetchFromSiteHtml(domain) {
  const urls = [`https://${domain}`, `http://${domain}`];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        timeout: TIMEOUT,
        headers: { "User-Agent": UA },
        maxRedirects: 5,
        // 忽略 SSL 证书问题（某些网站证书不完善）
        httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
      });

      const $ = cheerio.load(res.data);

      // 按优先级查找 icon 链接
      const selectors = [
        'link[rel="icon"][type="image/svg+xml"]',
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
        'link[rel="mask-icon"]',
      ];

      for (const selector of selectors) {
        const href = $(selector).attr("href");
        if (href) {
          const iconUrl = resolveUrl(href, url);
          const imgData = await fetchImage(iconUrl);
          if (imgData) return imgData;
        }
      }
    } catch {
      // 继续尝试下一个 URL
    }
  }
  return null;
}

/**
 * 策略 2: 直接请求 /favicon.ico
 */
async function fetchFromFaviconIco(domain) {
  const urls = [
    `https://${domain}/favicon.ico`,
    `http://${domain}/favicon.ico`,
  ];

  for (const url of urls) {
    const imgData = await fetchImage(url);
    if (imgData) return imgData;
  }
  return null;
}

/**
 * 策略 3: Clearbit Logo API
 */
async function fetchFromClearbit(domain) {
  const url = `https://logo.clearbit.com/${domain}`;
  return await fetchImage(url, true); // skipContentTypeCheck = true
}

/**
 * 策略 4: DuckDuckGo Icons
 */
async function fetchFromDuckDuckGo(domain) {
  const url = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  return await fetchImage(url, true);
}

/**
 * 下载图片，返回 { data, contentType }
 */
async function fetchImage(url, skipContentTypeCheck = false) {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      maxRedirects: 5,
      httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
    });

    const contentType = (res.headers["content-type"] || "").toLowerCase();
    const data = Buffer.from(res.data);

    // 检查是否为有效图片
    if (!skipContentTypeCheck && !contentType.startsWith("image/")) {
      return null;
    }

    // 检查数据大小（太小的可能是空图/错误页）
    if (data.length < 50) return null;

    return { data, contentType: contentType || "image/png" };
  } catch {
    return null;
  }
}

/**
 * 将相对 URL 解析为绝对 URL
 */
function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/**
 * 主入口：获取域名 favicon
 * 多源回退策略
 * @param {string} domainInput - 域名
 * @param {number} size - 可选，目标尺寸（16-512），不传或为0则返回原始尺寸
 */
async function fetchFavicon(domainInput, size = 0) {
  const domain = normalizeDomain(domainInput);
  if (!domain) {
    return buildDefaultResponse(size);
  }

  // 并行竞速：谁先返回有效结果就用谁的
  // 包装每个策略，成功时 resolve({ success: true, result })，失败时永不 resolve（等超时）
  function raceStrategy(strategy) {
    return new Promise((resolve) => {
      strategy.fn()
        .then((result) => {
          if (result && result.data) {
            resolve({ success: true, result, source: strategy.name });
          }
          // 结果无效，不 resolve，让其他策略继续
        })
        .catch(() => {
          // 失败，不 resolve，让其他策略继续
        });

      // 兜底超时：TIMEOUT + 1s 后强制放行（避免一直等待）
      setTimeout(() => resolve({ success: false }), TIMEOUT + 1000);
    });
  }

  const raceResult = await Promise.race([
    raceStrategy({ name: "site-html", fn: () => fetchFromSiteHtml(domain) }),
    raceStrategy({ name: "favicon-ico", fn: () => fetchFromFaviconIco(domain) }),
    raceStrategy({ name: "clearbit", fn: () => fetchFromClearbit(domain) }),
    raceStrategy({ name: "duckduckgo", fn: () => fetchFromDuckDuckGo(domain) }),
  ]);

  if (raceResult.success && raceResult.result) {
    const result = raceResult.result;
    const originalSize = detectIconSize(result.data, result.contentType);
    setCache(domain, result.data, result.contentType, originalSize);
    if (size >= 16 && size <= 512) {
      const resized = resizeToSize(result.data, result.contentType, size);
      return { data: resized, contentType: "image/svg+xml", source: raceResult.source, domain, originalSize };
    }
    return { ...result, source: raceResult.source, domain, originalSize };
  }

  // 全部失败，返回默认图标
  return buildDefaultResponse(size);
}

/** 构建默认图标响应 */
function buildDefaultResponse(size) {
  const originalSize = 256; // DEFAULT_FAVICON is 256x256
  if (size >= 16 && size <= 512) {
    const resized = resizeToSize(DEFAULT_FAVICON, "image/svg+xml", size);
    return { data: resized, contentType: "image/svg+xml", source: "default", originalSize };
  }
  return { data: DEFAULT_FAVICON, contentType: "image/svg+xml", source: "default", originalSize };
}

/**
 * 检测图标原始像素尺寸
 * 支持 SVG / PNG / ICO / GIF 四种格式
 * @returns {number|null} 最大边长（px），未知格式返回 null
 */
function detectIconSize(buffer, contentType) {
  if (!buffer || buffer.length < 4) return null;
  if (!contentType) return null;
  const ct = contentType.toLowerCase();

  if (ct.includes("svg")) return detectSvgSize(buffer);
  if (ct.includes("png")) return detectPngSize(buffer);
  if (ct.includes("ico") || ct.includes("icon")) return detectIcoSize(buffer);
  if (ct.includes("gif")) return detectGifSize(buffer);
  return null;
}

function detectSvgSize(buffer) {
  const svg = buffer.toString("utf-8").substring(0, 1000);
  const vbMatch = svg.match(/viewBox=["']\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
  if (vbMatch) {
    return Math.max(parseFloat(vbMatch[1]), parseFloat(vbMatch[2]));
  }
  const wMatch = svg.match(/<svg[^>]*\swidth=["'](\d+(?:\.\d+)?)/i);
  const hMatch = svg.match(/<svg[^>]*\sheight=["'](\d+(?:\.\d+)?)/i);
  if (wMatch || hMatch) {
    const size = Math.max(wMatch ? parseFloat(wMatch[1]) : 0, hMatch ? parseFloat(hMatch[1]) : 0);
    return size > 0 ? size : null;
  }
  return null;
}

function detectPngSize(buffer) {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return null;
  return Math.max(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function detectGifSize(buffer) {
  if (buffer.length < 10) return null;
  return Math.max(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

function detectIcoSize(buffer) {
  if (buffer.length < 6) return null;
  const count = buffer.readUInt16LE(4);
  if (count === 0 || count > 20) return null;
  let maxSize = 0;
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    if (offset + 1 >= buffer.length) break;
    let w = buffer[offset], h = buffer[offset + 1];
    if (w === 0) w = 256;
    if (h === 0) h = 256;
    maxSize = Math.max(maxSize, w, h);
  }
  return maxSize > 0 ? maxSize : null;
}

module.exports = { fetchFavicon, normalizeDomain, resizeToSize, detectIconSize };
