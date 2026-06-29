# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

基于 Koa2 的多平台视频/图集解析下载服务，支持抖音、小红书、快手、B站、今日头条。运行端口 `7777`。

## 常用命令

```bash
npm run dev          # 开发模式（nodemon 热重载）
npm start            # 生产模式启动
npm run lint         # ESLint 检查并自动修复

# PM2 管理
npm run pm2:start    # 启动
npm run pm2:restart  # 重启
npm run pm2:logs     # 查看日志

# Docker
docker build -t douyin-server .
docker run -d -p 7777:7777 --name douyin-app douyin-server
```

无测试套件，验证需手动调用 API 或启动服务后在浏览器测试。

## 代码风格

- **模块系统**：CommonJS（`require`/`module.exports`），不使用 TypeScript
- **格式化**：单引号、无分号、Tab 缩进（宽度 4）、行宽 100、无尾逗号
- Pre-commit hook（Husky + lint-staged）自动执行 ESLint 和 Prettier 修复

## 架构

### 分层结构

```
src/app.js                        ← Koa 入口，挂载中间件和路由
src/routes/video.js               ← 所有 API 路由（解析/下载/代理/微信登录/历史记录）
src/utils/platformProcessor.js    ← 调度层：域名识别 → 策略分发
src/utils/platforms/*Parser.js    ← 各平台解析器，每个输出统一结构
src/utils/db.js                   ← MySQL 连接池（mysql2/promise）
src/utils/userAgents.js           ← UA 池，getRandomUA()
src/views/index/index.ejs         ← 前端页面（Vue 3 CDN）
```

### 核心流程：解析分享链接

```
用户输入分享文本 → 提取 URL → detectPlatform(域名匹配) → 对应 Parser.parseUrl()
  → 跟随重定向 → 抓取 HTML → 提取 window.__变量__ 中的 JSON → 转为统一格式
  → routes/video.js 包装 url_list/cover 为 /api/proxyFile?url= 代理地址
  → 返回给前端
```

### 统一输出格式

所有解析器的 `parseUrl(shareUrl)` 必须返回：

```js
{
  project:   { project_id, title, desc, type: 'video'|'image', cover, url_list },
  author:    { author_id, nickname, avatar },
  statistics: { digg_count, comment_count, share_count, collect_count },
  platform:  'douyin' | 'xiaohongshu' | 'kuaishou' | 'bilibili' | 'toutiao'
}
```

### 添加新平台的步骤

1. 在 `src/utils/platforms/` 创建 `xxxParser.js`，实现 `parseUrl(shareUrl)` 方法
2. 在 `src/utils/platformProcessor.js` 中：import 新解析器 → 注册到 `this.parsers` → 添加 `detectPlatform` 域名匹配规则
3. 确保使用 `getRandomUA()` 发送请求

### 代理包装机制

`routes/video.js` 中的 `wrapUrlsWithProxy()` 会递归遍历解析结果，将 `url_list` 和 `cover` 字段替换为 `{origin}/api/proxyFile?url={原始URL}`，前端无需处理跨域。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/parse` | 解析分享链接，body: `{ shareLink }` 或 `{ shareText }`，可选 `{ openid }` 记录到数据库 |
| GET | `/api/download-stream` | 流式下载视频，query: `url`, `title` |
| GET | `/api/proxyFile` | 代理转发远程文件（解决跨域），query: `url` |
| GET | `/api/wechat/login` | 微信小程序 code 换 openid，query: `code` |
| GET | `/api/records` | 获取用户解析历史，query: `openid` |

## 数据库

MySQL（腾讯云 CynosDB），数据库名 `douyin_app`，通过 `src/utils/db.js` 管理连接池。

表 `parse_records`：`id`, `openid`, `platform`, `media_type`, `url`, `title`, `created_at`。

**特殊逻辑**：openid 为 `obb9c16_q4N-aZ1mHu26hfvEp3Pk` 时，`/api/records` 返回全量记录而非按 openid 过滤。

环境区分：`NODE_ENV === 'production'` 时连接内网地址 `10.46.103.108:3306`，否则走腾讯云外网。

## 各平台解析要点

- **抖音**：从 `window._ROUTER_DATA` 提取，需尝试 `video_(id)/page` 和 `note_(id)/page` 两条路径；URL 中 `playwm` 替换为 `play` 去水印
- **小红书**：从 `window.__INITIAL_STATE__` 提取，JSON 中可能含 `undefined` 需替换为 `null` 再解析；统计字段为字符串需 `parseInt`
- **快手**：从 `window.INIT_STATE` 提取，需递归搜索含 `mainMvUrls` 的对象
- **B站**：使用移动端子域名 `m.bilibili.com` 获取页面；视频地址需调 `api.bilibili.com/x/player/playurl` API 获取（支持 durl 和 dash 两种模式）
- **今日头条**：从 `<script type="application/ld+json">` 提取结构化数据；使用 Googlebot UA

## JSON 解析容错

页面嵌入的 JSON 常包含 JS 特有值，解析前需清理：
```js
jsonStr = jsonStr.replace(/undefined/g, 'null')
// 必要时处理尾逗号：.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
```
