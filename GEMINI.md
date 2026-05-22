# Gemini 项目指令 - Dou

本项目是一个基于 Node.js 和 Koa2 构建的多平台视频/图集解析与下载服务。它允许用户通过分享链接，从多个社交媒体平台提取媒体内容（视频、图片、标题、作者信息等）。

## 项目概览

- **核心功能**：解析社交媒体平台的分享链接，提供视频流直接下载或通过代理访问文件。
- **支持平台**：抖音、小红书、快手、B站（Bilibili）以及今日头条。
- **架构设计**：
    - **后端**：使用 Koa2 框架及 `koa-router` 进行路由管理。
    - **解析逻辑**：在 `src/utils/platformProcessor.js` 中实现了策略模式，将具体的解析任务委托给 `src/utils/platforms/` 下的特定类。
    - **前端**：简单的 EJS 单页界面，通过 CDN 引入 Vue 3，位于 `src/views/index/index.ejs`。
    - **代理功能**：服务端包含代理接口（`/api/proxyFile`），用于绕过媒体下载时的跨域（CORS）和 Referer 限制。

## 技术栈

- **运行时**：Node.js (CommonJS 模块)
- **Web 框架**：Koa 2
- **模板引擎**：EJS
- **HTTP 客户端**：Axios（用于网页抓取和流式下载）
- **进程管理**：PM2
- **容器化**：Docker

## 构建与运行

### 开发环境
- **安装依赖**：`npm install`
- **热重载运行**：`npm run dev`（使用 `nodemon`）
- **代码规范检查**：`npm run lint`（使用 ESLint 和 Prettier）

### 生产环境
- **启动服务**：`npm start`
- **使用 PM2 启动**：`npm run pm2:start`
- **停止 PM2 服务**：`npm run pm2:stop`
- **重启 PM2 服务**：`npm run pm2:restart`
- **查看 PM2 日志**：`npm run pm2:logs`

### Docker
- **构建镜像**：`docker build -t douyin-server .`
- **运行容器**：`docker run -d -p 7777:7777 --name douyin-app douyin-server`

## 开发规范

### 代码风格
- **编程语言**：纯 JavaScript (ES6+)，不使用 TypeScript。
- **模块化**：CommonJS (`require`/`module.exports`)。
- **格式化要求**：
    - 使用单引号 (`'`)
    - 不使用分号 (`;`)
    - 使用 Tab 缩进（宽度为 4）
    - 行宽限制：100
- **代码校验**：通过 Husky 和 lint-staged 在 pre-commit 钩子中强制执行 ESLint 和 Prettier 规则。

### 项目结构
- `src/app.js`：应用入口文件，配置 Koa 中间件。
- `src/routes/`：API 路由定义。
- `src/utils/platformProcessor.js`：平台检测和解析器选择的核心逻辑。
- `src/utils/platforms/`：各平台的具体解析实现。
- `src/views/`：Web 界面的 EJS 模板。

### 添加新平台的指南
1. 在 `src/utils/platforms/` 下创建新的解析类（例如 `youtubeParser.js`）。
2. 实现 `parseUrl(shareUrl)` 方法，返回标准化的对象结构（包含 project、author、statistics 字段）。
3. 在 `src/utils/platformProcessor.js` 的 `constructor` 和 `detectPlatform` 方法中注册新的解析器。
4. 确保新解析器在发起请求时使用 `src/utils/userAgents.js` 中的 `getRandomUA()`。
