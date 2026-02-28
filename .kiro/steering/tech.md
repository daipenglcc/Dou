# 技术栈

## 运行时

- Node.js (CommonJS 模块，`require` 语法)
- 纯 JavaScript，无 TypeScript

## 后端框架

- Koa 2 — Web 框架
- koa-router — 路由
- koa-bodyparser — 请求体解析
- koa-views + EJS — 服务端模板渲染
- axios — HTTP 请求（用于抓取抖音页面和下载文件流）

## 前端

- Vue 3（通过 CDN 引入，非构建工具）
- 内联在 EJS 模板中，无独立前端构建流程

## 进程管理

- PM2（ecosystem.config.js 配置）
- Docker 部署支持（Dockerfile）

## 代码质量

- ESLint + Prettier（通过 eslint-plugin-prettier 集成）
- Husky + lint-staged（pre-commit 钩子自动格式化）

## 常用命令

```bash
# 开发
npm run dev          # nodemon 热重载启动

# 生产
npm run start        # 直接启动

# PM2 管理
npm run pm2:start    # PM2 启动
npm run pm2:stop     # PM2 停止
npm run pm2:restart  # PM2 重启
npm run pm2:logs     # 查看日志

# 代码检查
npm run lint         # ESLint 检查并自动修复
```

## 代码风格规则

- 单引号，无分号
- Tab 缩进（宽度 4）
- 行宽 100
- 无尾逗号
- `no-console` 关闭（允许 console）
- 未使用变量报错（`_` 前缀参数除外）
