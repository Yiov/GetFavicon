# Favicon 获取工具

在线获取任意网站 favicon 的代理服务，国内可直接访问，无需代理/VPN。替代 Google Favicon 服务的最佳选择。

## ✨ 特性

-   **多源回退** — 网站 HTML 解析 → `/favicon.ico` → Clearbit → DuckDuckGo → 默认图标
-   **三层缓存** — 浏览器缓存（1 天）→ 内存 LRU（1000 条）→ 文件缓存（7 天）
-   **智能尺寸** — 支持指定输出 16-512px，自动检测原始图标尺寸并过滤过大选项
-   **并行竞速** — 多数据源同时请求，谁先返回用谁的
-   **现代 UI** — 纯黑深色主题 + 动态光束背景 + 毛玻璃卡片 + 五彩纸屑特效 + 移动端适配
-   **轻量** — 仅依赖 Express + Axios + Cheerio，无数据库

## 🚀 快速开始

### 环境要求

-   Node.js >= 18（Cheerio 1.x 需要 Node 18+）
-   npm / pnpm

### 安装

```bash
# 克隆仓库
git clone https://github.com/你的用户名/favicon-tool.git
cd favicon-tool

# 安装依赖（国内用户建议使用淘宝镜像）
npm install --registry=https://registry.npmmirror.com
```

### 运行

```bash
# 默认端口 3000
node server.js

# 自定义端口
PORT=8080 node server.js
```

访问 `http://localhost:3000` 即可看到 Web 界面。

## 📡 API 文档

| 接口 | 说明 |
|------|------|
| `GET /api/favicon?domain_url=域名` | 通过 query 参数获取 favicon |
| `GET /api/favicon/:domain` | 通过路径参数获取 favicon |
| `GET /api/favicon?domain_url=域名&size=尺寸` | 指定输出尺寸（16-512），默认返回原始尺寸 |
| `GET /api/info?domain_url=域名` | 查询缓存状态等信息 |

### 示例

```html
<!-- HTML 中直接引用 -->
<img src="https://你的域名/api/favicon?domain_url=github.com" alt="favicon">

<!-- 指定 128px 尺寸 -->
<img src="https://你的域名/api/favicon?domain_url=github.com&size=128" alt="favicon">
```

## 🖥️ 部署

### 方式一：宝塔面板 + PM2（推荐）

```bash
# 1. 上传项目到服务器
# 2. 进入项目目录，安装依赖
cd /www/wwwroot/favicon-tool
npm install --registry=https://registry.npmmirror.com

# 3. 安装 PM2
npm install -g pm2

# 4. 启动服务
pm2 start server.js --name favicon-tool
pm2 save
pm2 startup

# 5. 在宝塔面板中创建站点，配置反向代理到 http://127.0.0.1:3000
```

### 方式二：Nginx 反向代理

在宝塔面板的网站配置中添加：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 方式三：Docker（Ubuntu）

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t favicon-tool .
docker run -d -p 3000:3000 --name favicon-tool favicon-tool
```

### 方式四：直接运行（备选）

```bash
# 使用 nohup 后台运行
nohup node server.js > app.log 2>&1 &

# 或使用 screen
screen -S favicon
node server.js
# Ctrl+A D 分离
```

### 防火墙/安全组

确保服务器开放对应端口（默认 3000，或通过 Nginx 反向代理走 80/443）。

## 📁 项目结构

```
favicon-tool/
├── server.js                # Express 入口
├── package.json
├── src/
│   ├── faviconFetcher.js    # favicon 获取核心逻辑（多源回退）
│   ├── cache.js             # 三级缓存（内存 + 文件）
│   └── routes/
│       └── favicon.js       # API 路由
├── public/
│   ├── index.html           # Web 界面
│   ├── style.css            # 样式（深色主题 + CSS 变量）
│   ├── app.js               # 前端逻辑（Toast/纸屑/API 调用）
│   ├── lightrays.js         # Three.js 动态光束背景
│   └── favicon.png          # 站点图标
├── cache/                   # 文件缓存目录（自动创建）
└── README.md
```

## ⚙️ 配置说明

所有主要配置集中在 `server.js` 和各模块文件顶部：

| 配置项 | 文件 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | `server.js` | `3000` | 服务端口，支持环境变量覆盖 |
| `TIMEOUT` | `faviconFetcher.js` | `5000` | 单次请求超时（毫秒） |
| `CACHE_EXPIRE_DAYS` | `cache.js` | `7` | 文件缓存过期天数 |
| `MEMORY_CACHE_MAX` | `cache.js` | `1000` | 内存缓存最大条目数 |

## 🌐 关于国内部署

-   Cheerio 1.0.0-rc.12 可在 Node 16+ 正常运行，如果使用 Cheerio 1.2.0+ 则需要 Node 18+
-   项目使用的第三方源（Clearbit、DuckDuckGo）国内均可直接访问
-   建议使用**淘宝 npm 镜像**安装依赖，速度更快：
    ```bash
    npm install --registry=https://registry.npmmirror.com
    ```

## 📄 License

MIT
