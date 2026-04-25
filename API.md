# API 接口

## POST `/api/parse` — 解析分享链接

**请求参数（二选一）：**

```json
{ "shareLink": "https://v.douyin.com/xxxxxxx/" }
```

```json
{ "shareText": "分享文本内容，包含链接即可 https://v.douyin.com/xxxxxxx/" }
```

**返回示例：**

```json
{
  "success": true,
  "data": {
    "platform": "douyin",
    "project": {
      "project_id": "7380000000000000000",
      "title": "视频标题",
      "desc": "",
      "type": "video",
      "cover": "https://example.com/cover.jpg",
      "url_list": ["https://example.com/video.mp4"]
    },
    "author": {
      "author_id": "123456789",
      "nickname": "用户昵称",
      "avatar": "https://example.com/avatar.jpg"
    },
    "statistics": {
      "digg_count": 10000,
      "comment_count": 500,
      "share_count": 200,
      "collect_count": 1000
    }
  },
  "message": "解析成功",
  "timestamp": "2025-08-19T12:00:00.000Z"
}
```

**返回数据结构说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | 平台标识：`douyin` / `xiaohongshu` / `kuaishou` / `bilibili` |
| `project.project_id` | string | 作品唯一 ID |
| `project.title` | string | 作品标题 |
| `project.desc` | string | 作品描述（部分平台为空） |
| `project.type` | string | 内容类型：`video`（视频）/ `image`（图集） |
| `project.cover` | string / null | 封面图地址，图集类型可能为 null |
| `project.url_list` | string[] | 视频/图集地址列表；视频为单个元素，图集为多张图片 |
| `author.author_id` | string | 用户 ID |
| `author.nickname` | string | 用户昵称 |
| `author.avatar` | string | 用户头像地址 |
| `statistics.digg_count` | number | 点赞数 |
| `statistics.comment_count` | number | 评论数 |
| `statistics.share_count` | number | 分享数 |
| `statistics.collect_count` | number | 收藏数 |

---

## GET `/api/download-stream` — 流式下载视频

将视频流直接输出给客户端，前端可触发浏览器下载。

**请求参数（Query）：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 是 | 视频地址（来自 `project.url_list[0]`） |
| `title` | 否 | 文件名，默认为 `video` |

**示例：**

```
GET /api/download-stream?url=https://example.com/video.mp4&title=我的视频
```

---

## GET `/api/proxyFile` — 代理下载文件

作为中间代理转发远程文件，主要用于解决图集图片的跨域问题。

**请求参数（Query）：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 是 | 远程文件地址 |

**示例：**

```
GET /api/proxyFile?url=https://example.com/image.jpg
```
