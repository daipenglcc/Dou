---
name: add-parser
description: 添加新平台解析器 — 创建解析器类、注册到调度器、添加域名检测规则
model: sonnet
---

# 添加新平台解析器

根据现有抖音/小红书解析器的模式，为新平台添加解析支持。

## Step 1: 创建解析器文件

在 `src/utils/platforms/` 下创建 `{Platform}Parser.js`，遵循以下规范：

### 解析器骨架

```javascript
const axios = require('axios')
const { getRandomUA } = require('../userAgents')

class PlatformParser {
  async parseUrl(shareUrl) {
    // 1. 跟随重定向
    const shareResp = await axios.get(shareUrl, { headers: getRandomUA() })
    const realUrl = shareResp.request.res.responseUrl

    // 2. 提取内容 ID（根据 URL 格式调整正则）
    const idMatch = realUrl.match(/\/path\/([\w]+)/)
    if (!idMatch) throw new Error('无法提取内容ID')
    const contentId = idMatch[1]

    // 3. 获取标准页面
    const finalUrl = realUrl  // 或构造标准 URL
    const resp = await axios.get(finalUrl, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2'
      }
    })

    // 4. 提取数据源（script 中的 JSON）
    const html = resp.data
    const scriptMatch = html.match(/window\.__DATA__\s*=\s*({.*?})\s*<\/script>/s)
    if (!scriptMatch) throw new Error('无法从页面提取数据')

    let jsonStr = scriptMatch[1].replace(/undefined/g, 'null')
    const jsonData = JSON.parse(jsonStr)

    // 5. 提取具体内容
    const contentData = this.extractContent(jsonData, contentId)
    if (!contentData) throw new Error('未找到内容数据')

    // 6. 转为统一格式
    return this.toUnifiedFormat(contentData, contentId)
  }
}

module.exports = PlatformParser
```

### 必须实现的方法

- `parseUrl(shareUrl)` — 主入口，返回统一格式
  - 输入：分享链接（字符串）
  - 输出：`{ project, author, statistics, platform }`
  - 异常：`throw new Error('描述性错误信息')`

### 统一输出格式

```javascript
{
  project: {
    project_id: String,   // 作品唯一 ID
    title: String,        // 标题（清理特殊字符）
    desc: String,         // 描述
    type: 'video'|'image',// 内容类型
    cover: String,        // 封面 URL
    url_list: String[]    // 视频/图片地址列表
  },
  author: {
    author_id: String,    // 用户 ID / 抖音号
    nickname: String,     // 昵称
    avatar: String        // 头像 URL
  },
  statistics: {
    digg_count: Number,   // 点赞数
    comment_count: Number,// 评论数
    share_count: Number,  // 分享数
    collect_count: Number // 收藏数
  },
  platform: String        // 平台标识
}
```

## Step 2: 注册解析器

编辑 `src/utils/platformProcessor.js`：

```javascript
// 1. 导入新解析器
const NewParser = require('./platforms/newParser')

// 2. 在 constructor 中注册
this.parsers = {
  ...existingParsers,
  newPlatform: new NewParser(),
}

// 3. 在 detectPlatform 中添加域名规则
if (domain.includes('newplatform.com') || domain.includes('np.com')) {
  return 'newPlatform'
}
```

## 现有实现参考

| 平台 | 解析器 | 数据源 | ID 提取 |
|------|--------|--------|---------|
| 抖音 | `douyinParser.js` | `window._ROUTER_DATA` | 从真实URL取最后一段 |
| 小红书 | `xiaohongshuParser.js` | `window.__INITIAL_STATE__` | 从 `/explore/` `/note/` 路径提取 |
| 快手 | `kuaishouParser.js` | `window.INIT_STATE`（混淆 key，递归搜索） | 从 `/fw/photo/` 路径提取 |
| B站 | `bilibiliParser.js` | (未实现) | - |

## 调试命令

```bash
# 启动开发服务器
npm run dev

# 测试解析接口
curl -X POST http://localhost:7777/api/parse \
  -H "Content-Type: application/json" \
  -d '{"shareText": "分享链接"}'

# 查看日志
npm run pm2:logs
```

## 编码规范

- 单引号，无分号，Tab 缩进 4 空格
- `console.log` 允许用于调试
- 文件名：`{platform}Parser.js`（小写驼峰）
- 类名：`{Platform}Parser`（大写驼峰）

## 常见陷阱

### `getRandomUA()` 不能 spread

`getRandomUA()` 返回**字符串**，不是对象。以下代码**错误**：

```javascript
// ❌ 错误：展开字符串变成 {0: 'M', 1: 'o', ...}
headers: {
  ...getRandomUA(),
  'Accept': '...'
}
```

正确的写法：

```javascript
// ✅ 正确：显式设置 User-Agent
headers: {
  'User-Agent': getRandomUA(),
  'Accept': '...'
}
```

当 headers 只有 UA 时可以直接传字符串：

```javascript
// ✅ 只设置 UA 时可以直接传字符串
axios.get(url, { headers: getRandomUA() })
```
