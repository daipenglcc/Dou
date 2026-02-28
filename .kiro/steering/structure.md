# 项目结构

```
src/
├── app.js                  # 应用入口，Koa 实例、中间件注册、路由挂载
├── routes/
│   └── video.js            # API 路由（解析、下载、代理）
├── utils/
│   ├── douyinProcessor.js  # 核心业务逻辑：链接解析、视频下载
│   └── userAgents.js       # 随机 User-Agent 生成
├── views/
│   └── index/
│       └── index.ejs       # 前端页面（Vue 3 + 内联样式）
└── downloads/              # 视频下载存储目录（按日期子目录）
```

## 架构模式

- 简单的 MVC 分层：routes 处理请求 → utils 处理业务逻辑 → views 渲染页面
- `DouyinProcessor` 类封装所有抖音相关的解析和下载逻辑
- 路由文件按功能模块划分（当前只有 video）

## 关键约定

- 路由文件放在 `src/routes/`，通过 `koa-router` 注册到 `/api` 前缀下
- 工具类放在 `src/utils/`
- 视图模板放在 `src/views/{页面名}/` 下
- 下载文件按日期存储在 `src/downloads/{YYYY-MM-DD}/`
- 配置文件（ESLint、Prettier、PM2、Docker）放在项目根目录
