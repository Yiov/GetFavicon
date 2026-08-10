const express = require("express");
const path = require("path");
const faviconRoutes = require("./src/routes/favicon");

const app = express();
const PORT = process.env.PORT || 3000;

// 静态文件
app.use(express.static(path.join(__dirname, "public")));

// API 路由
app.use("/api", faviconRoutes);

// favicon.ico 自动重定向到 favicon.png
app.get("/favicon.ico", (req, res) => {
  res.redirect(301, "/favicon.png");
});

// 根路径返回 Web 界面
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Favicon 服务已启动: http://localhost:${PORT}`);
  console.log(`API 示例: http://localhost:${PORT}/api/favicon?domain_url=github.com`);
});
