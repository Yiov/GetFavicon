const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_EXPIRE_DAYS = 7; // 缓存过期天数
const MEMORY_CACHE_MAX = 1000; // 内存缓存最大条目数

// 确保缓存目录存在
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ============================================
//  内存缓存层 (LRU Map) — sub-ms 响应
// ============================================
const memoryCache = new Map();

/**
 * 从内存缓存读取
 */
function getMemoryCache(domain) {
  const entry = memoryCache.get(domain);
  if (!entry) return null;
  // 检查过期
  if (Date.now() > entry.expireAt) {
    memoryCache.delete(domain);
    return null;
  }
  // LRU: 移到末尾（最近使用）
  memoryCache.delete(domain);
  memoryCache.set(domain, entry);
  return entry;
}

/**
 * 写入内存缓存（自动淘汰最旧的条目）
 */
function setMemoryCache(domain, entry) {
  // 淘汰最旧的
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
  // 先删后加，确保 LRU 顺序
  memoryCache.delete(domain);
  memoryCache.set(domain, entry);
}

/**
 * 生成缓存键（域名的 hash）
 */
function getCacheKey(domain) {
  return crypto.createHash("md5").update(domain).digest("hex");
}

/**
 * 获取缓存文件路径
 */
function getCacheFilePath(domain, ext) {
  return path.join(CACHE_DIR, `${getCacheKey(domain)}.${ext}`);
}

/**
 * 获取缓存元数据路径
 */
function getCacheMetaPath(domain) {
  return path.join(CACHE_DIR, `${getCacheKey(domain)}.meta.json`);
}

/**
 * 从缓存读取（内存 → 文件 → null）
 * @returns {{ data: Buffer, contentType: string, originalSize: number|null }|null}
 */
function getCache(domain) {
  // 1. 内存缓存（sub-ms）
  const mem = getMemoryCache(domain);
  if (mem) return { data: mem.data, contentType: mem.contentType, originalSize: mem.originalSize };

  // 2. 文件缓存
  const metaPath = getCacheMetaPath(domain);
  if (!fs.existsSync(metaPath)) return null;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const expireTime = meta.timestamp + CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() > expireTime) {
      removeCache(domain);
      return null;
    }

    const filePath = getCacheFilePath(domain, meta.ext);
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath);

    // 回填内存缓存
    setMemoryCache(domain, {
      data,
      contentType: meta.contentType,
      originalSize: meta.originalSize || null,
      expireAt: meta.timestamp + CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
    });

    return {
      data,
      contentType: meta.contentType,
      originalSize: meta.originalSize || null,
    };
  } catch {
    return null;
  }
}

/**
 * 写入缓存（内存 + 文件）
 */
function setCache(domain, data, contentType, originalSize = null) {
  try {
    // 根据 contentType 确定扩展名
    let ext = "png";
    if (contentType.includes("svg")) ext = "svg";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("ico")) ext = "ico";
    else if (contentType.includes("gif")) ext = "gif";
    else if (contentType.includes("webp")) ext = "webp";

    const now = Date.now();
    const expireAt = now + CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

    // 写入内存缓存
    setMemoryCache(domain, { data, contentType, originalSize, expireAt });

    // 写入文件缓存
    const filePath = getCacheFilePath(domain, ext);
    fs.writeFileSync(filePath, data);

    const metaPath = getCacheMetaPath(domain);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        domain,
        contentType,
        ext,
        originalSize,
        timestamp: now,
      })
    );
  } catch (err) {
    console.error("写入缓存失败:", err.message);
  }
}

/**
 * 删除缓存
 */
function removeCache(domain) {
  try {
    const metaPath = getCacheMetaPath(domain);
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const filePath = getCacheFilePath(domain, meta.ext);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      fs.unlinkSync(metaPath);
    }
  } catch {
    // 忽略错误
  }
}

module.exports = { getCache, setCache, removeCache, getCacheKey };
