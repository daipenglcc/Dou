---
name: testing
description: 平台解析测试 — 使用分享文本测试解析接口，验证各平台返回值
model: sonnet
---

# 平台解析测试

## 测试解析接口

```bash
# 通用测试
curl -X POST http://localhost:7777/api/parse \
  -H "Content-Type: application/json" \
  -d '{"shareText": "分享链接或完整分享文本"}'

# 只传纯链接
curl -X POST http://localhost:7777/api/parse \
  -H "Content-Type: application/json" \
  -d '{"shareLink": "https://..."}'
```

## 验证返回格式

成功响应格式：

```json
{
  "success": true,
  "data": {
    "project": {
      "project_id": "string",
      "title": "string",
      "desc": "string",
      "type": "video|image",
      "cover": "string(proxy-url)",
      "url_list": ["string(proxy-urls)"]
    },
    "author": {
      "author_id": "string",
      "nickname": "string",
      "avatar": "string(proxy-url)"
    },
    "statistics": {
      "digg_count": 0,
      "comment_count": 0,
      "share_count": 0,
      "collect_count": 0
    },
    "platform": "douyin|xiaohongshu|kuaishou|bilibili"
  },
  "message": "解析成功",
  "timestamp": "ISO-8601"
}
```

## 验证要点

- `project.type` 与实际内容匹配（视频/图集）
- `project.url_list` 不为空
- `project.cover` 是代理 URL（以 `/api/proxyFile?url=` 开头）
- `statistics` 各字段为数字类型
- `author.nickname` 不为空
