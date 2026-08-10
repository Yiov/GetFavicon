const domainInput = document.getElementById("domainInput");
const fetchBtn = document.getElementById("fetchBtn");
const resultSection = document.getElementById("resultSection");
const loadingSection = document.getElementById("loadingSection");
const faviconImg = document.getElementById("faviconImg");
const domainLabel = document.getElementById("domainLabel");
const sourceLabel = document.getElementById("sourceLabel");
const downloadBtn = document.getElementById("downloadBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const sizeSelector = document.getElementById("sizeSelector");

const sizeBtns = sizeSelector.querySelectorAll(".size-btn");

let currentDomain = "";
let currentSize = 0;

// ============================================
// Toast 通知
// ============================================
const toastContainer = document.getElementById("toastContainer");

/**
 * 类型对应的 SVG 图标
 */
const toastIcons = {
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
};

/**
 * 显示自定义 toast 通知
 * @param {string} message 消息文本
 * @param {string} type 类型: 'warning' | 'error' | 'info'
 * @param {number} duration 显示时长(ms), 默认 3000
 */
function showToast(message, type = "warning", duration = 3000) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toast-icon ${type}">${toastIcons[type] || toastIcons.warning}</div>
    <span class="toast-message">${message}</span>
  `;
  toastContainer.appendChild(el);

  setTimeout(() => {
    el.classList.add("toast-out");
    el.addEventListener("animationend", () => el.remove());
  }, duration);
}

// ============================================
// 五彩纸屑特效
// ============================================
const CONFETTI_COLORS = [
  "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff",
  "#ff922b", "#845ef7", "#ff6eb4", "#20c997",
  "#f06595", "#74c0fc", "#ffd43b", "#63e6be"
];

/**
 * 触发五彩纸屑庆祝效果
 */
function triggerConfetti() {
  const particleCount = 80;
  const layer = document.getElementById("confettiLayer");
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const size = Math.random() * 8 + 4;

    // 从中心点小范围发散
    const startX = centerX + (Math.random() - 0.5) * 80;
    const startY = centerY + (Math.random() - 0.5) * 60;

    // 360度全方向爆炸
    const angle = Math.random() * 360;
    const velocity = Math.random() * 250 + 150;
    const radians = (angle * Math.PI) / 180;
    const tx = Math.cos(radians) * velocity;
    const ty = Math.sin(radians) * velocity;

    const rotation = Math.random() * 720 - 360;
    const duration = Math.random() * 800 + 1400;
    const delay = Math.random() * 150;

    particle.className = "confetti";
    particle.style.cssText = `
      left: ${startX}px;
      top: ${startY}px;
      width: ${size}px;
      height: ${size * (Math.random() * 0.6 + 0.4)}px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
      animation: confettiFall ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms forwards;
      --tx: ${tx}px;
      --ty: ${ty}px;
      --rotation: ${rotation}deg;
      opacity: 1;
    `;

    layer.appendChild(particle);

    // 动画结束后清理
    setTimeout(() => {
      particle.remove();
    }, duration + delay + 100);
  }
}

/**
 * 从各种格式的 URL 中提取纯净域名
 * 支持: https://www.baidu.com/、www.baidu.com、baidu.com、https://baidu.com/path 等
 */
function cleanDomain(input) {
  if (!input || typeof input !== "string") return "";
  let domain = input.trim();
  domain = domain.replace(/^https?:\/\//i, "");
  domain = domain.split("/")[0].split("#")[0].split("?")[0];
  domain = domain.split(":")[0];
  domain = domain.replace(/\.+$/, "").replace(/^\.+/, "");
  return domain;
}

/**
 * 构建 API URL，包含 domain 和可选的 size
 */
function buildApiUrl(domain, size = 0) {
  let url = `/api/favicon?domain_url=${encodeURIComponent(domain)}`;
  if (size >= 16 && size <= 512) {
    url += `&size=${size}`;
  }
  return url;
}

/**
 * 更新尺寸按钮的 active 状态
 */
function setActiveSize(size) {
  currentSize = size;
  sizeBtns.forEach(btn => {
    const btnSize = parseInt(btn.dataset.size);
    btn.classList.toggle("active", btnSize === size);
  });
}

/**
 * 根据原始图标尺寸，隐藏超过其尺寸的选项按钮
 */
function filterSizeButtons(maxSize) {
  sizeBtns.forEach(btn => {
    const btnSize = parseInt(btn.dataset.size);
    if (btnSize === 0) return; // 始终显示"原始"
    if (maxSize !== null && btnSize > maxSize) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
    }
  });
}

// 获取 favicon
async function fetchFavicon(domain) {
  domain = cleanDomain(domain);

  if (!domain || !domain.includes(".")) {
    showToast("请输入有效的域名，如 github.com 或 https://www.baidu.com/", "warning");
    return;
  }

  currentDomain = domain;
  setActiveSize(0); // 重置为原始尺寸
  sizeBtns.forEach(btn => { btn.style.display = ""; }); // 重置按钮可见性

  // 显示 loading（但不隐藏之前的结果，避免闪烁）
  loadingSection.style.display = "block";

  try {
    const imgUrl = buildApiUrl(domain, 0);
    const res = await fetch(imgUrl);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const sourceHeader = res.headers.get("X-Source") || "unknown";
    const iconSizeHeader = res.headers.get("X-Icon-Size");
    const maxSize = iconSizeHeader ? parseInt(iconSizeHeader) : null;

    if (window._currentObjectUrl) {
      URL.revokeObjectURL(window._currentObjectUrl);
    }
    window._currentObjectUrl = URL.createObjectURL(blob);

    faviconImg.src = window._currentObjectUrl;
    faviconImg.onload = () => {
      loadingSection.style.display = "none";
      resultSection.style.display = "block";
      resultSection.classList.add("active");
      sizeSelector.style.display = "flex";
      domainLabel.textContent = domain;
      sourceLabel.textContent = `来源: ${sourceHeader}`;
      filterSizeButtons(maxSize);
      triggerConfetti();
    };
    faviconImg.onerror = () => {
      loadingSection.style.display = "none";
      showToast("获取失败，请检查域名是否正确", "error");
    };
  } catch {
    loadingSection.style.display = "none";
    showToast("获取失败，请稍后重试", "error");
  }
}

// 尺寸切换（直接改 src，浏览器缓存命中 = 0ms）
sizeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (!currentDomain) return;
    const size = parseInt(btn.dataset.size);
    setActiveSize(size);
    faviconImg.src = buildApiUrl(currentDomain, size);
  });
});

// 按钮事件
fetchBtn.addEventListener("click", () => {
  fetchFavicon(domainInput.value);
});

// 回车提交
domainInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    fetchFavicon(domainInput.value);
  }
});

// 快捷链接
document.querySelectorAll(".quick-links a").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const domain = link.dataset.domain;
    domainInput.value = domain;
    fetchFavicon(domain);
  });
});

// 下载（带当前尺寸）
downloadBtn.addEventListener("click", () => {
  if (!currentDomain) return;
  const link = document.createElement("a");
  link.href = buildApiUrl(currentDomain, currentSize);
  link.download = `${currentDomain}-favicon`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// 复制链接（带当前尺寸）
copyLinkBtn.addEventListener("click", () => {
  if (!currentDomain) return;
  const apiUrl = `${window.location.origin}${buildApiUrl(currentDomain, currentSize)}`;
  navigator.clipboard.writeText(apiUrl).then(() => {
    const originalText = copyLinkBtn.textContent;
    copyLinkBtn.textContent = "已复制";
    copyLinkBtn.style.color = "var(--success)";
    copyLinkBtn.style.borderColor = "var(--success)";
    setTimeout(() => {
      copyLinkBtn.textContent = originalText;
      copyLinkBtn.style.color = "";
      copyLinkBtn.style.borderColor = "";
    }, 1500);
  }).catch(() => {
    showToast("复制失败，请手动复制", "error");
  });
});

// 复制按钮
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.target;
    const code = document.getElementById(targetId).textContent;
    navigator.clipboard.writeText(code).then(() => {
      const originalText = btn.textContent;
      btn.textContent = "已复制";
      btn.style.color = "var(--success)";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = "";
      }, 1500);
    });
  });
});

// 初始化 API 示例文本
const baseUrl = window.location.origin;
document.getElementById("apiExample1").textContent =
  `<img src="${baseUrl}/api/favicon?domain_url=github.com" alt="favicon">`;
document.getElementById("apiExample2").textContent =
  `// 两种格式均可\n${baseUrl}/api/favicon?domain_url=github.com\n${baseUrl}/api/favicon/github.com`;
document.getElementById("apiExample3").textContent =
  `// 指定输出尺寸（16-512）\n${baseUrl}/api/favicon?domain_url=github.com&size=128`;
