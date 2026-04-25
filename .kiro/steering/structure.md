# 项目结构

```
src/
├── app.js                  # 应用入口，Koa 实例、中间件注册、路由挂载
├── routes/
│   └── video.js            # API 路由（解析、下载、代理）
├── utils/
│   ├── platformProcessor.js # 多平台解析统一入口
│   ├── platforms/          # 各平台解析器模块
│   │   ├── douyinParser.js     # 抖音平台解析器
│   │   ├── xiaohongshuParser.js # 小红书平台解析器
│   │   ├── kuaishouParser.js   # 快手平台解析器
│   │   └── bilibiliParser.js   # B站平台解析器
│   └── userAgents.js       # 随机 User-Agent 生成
├── views/
│   └── index/
│       └── index.ejs       # 前端页面（Vue 3 + 内联样式）
└── downloads/              # 视频下载存储目录（按日期子目录）
```

## 架构模式

- **模块化分层**：routes 处理请求 → platformProcessor 统一调度 → 各平台解析器处理具体逻辑 → views 渲染页面
- **策略模式**：`PlatformProcessor` 根据链接类型选择对应的平台解析器
- **单一职责**：每个平台解析器只负责自己平台的解析逻辑，便于维护和扩展

## 关键约定

- 路由文件放在 `src/routes/`，通过 `koa-router` 注册到 `/api` 前缀下
- 平台解析器放在 `src/utils/platforms/`，统一实现 `parseUrl(shareUrl)` 方法
- 工具类放在 `src/utils/`
- 视图模板放在 `src/views/{页面名}/` 下
- 下载文件按日期存储在 `src/downloads/{YYYY-MM-DD}/`
- 配置文件（ESLint、Prettier、PM2、Docker）放在项目根目录

## 解析结果数据结构

所有平台解析器的 `parseUrl` 方法返回统一格式：

```js
{
  project: {
    project_id: '',   // 作品唯一ID
    title: '',        // 作品标题
    desc: '',         // 作品描述
    type: 'video' | 'image', // 内容类型
    cover: '',        // 封面图 URL
    url_list: [],     // 视频或图集地址列表
  },
  author: {
    author_id: '',    // 用户ID
    nickname: '',     // 用户昵称
    avatar: '',       // 用户头像 URL
  },
  statistics: {
    digg_count: 0,    // 点赞数
    comment_count: 0, // 评论数
    share_count: 0,   // 分享数
    collect_count: 0, // 收藏数
  },
  platform: '',       // 平台标识（douyin/xiaohongshu/kuaishou/bilibili）
}
```

## 新增平台解析器步骤

1. 在 `src/utils/platforms/` 创建 `{platform}Parser.js`，实现 `parseUrl(shareUrl)` 方法，返回上述统一格式
2. 在 `src/utils/platformProcessor.js` 中导入并注册到 `this.parsers`
3. 在 `detectPlatform` 方法中添加域名识别逻辑
