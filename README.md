# 🎬 Douyin Video Parser & Downloader

一个基于 **Koa2** 的多平台视频/图集解析下载服务，支持抖音、小红书、快手、B站等主流平台。

- 🔗 **解析分享链接**：提取视频或图集信息（标题、封面、作者、播放地址等）
- 📥 **视频流式下载**：无水印视频直接下载到客户端
- 🖼️ **图集浏览**：支持图文类型内容解析
- 🔄 **代理下载**：转发远程文件流，解决跨域问题

---

## 🚀 API 接口

### POST `/api/parse` — 解析分享链接

**POST** `/parse`

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

### GET `/api/download-stream` — 流式下载视频

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

### GET `/api/proxyFile` — 代理下载文件

作为中间代理转发远程文件，主要用于解决图集图片的跨域问题。

**请求参数（Query）：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 是 | 远程文件地址 |

**示例：**

```
GET /api/proxyFile?url=https://example.com/image.jpg
```

---

## 📦 安装与运行

### 1. 克隆项目

```bash
git clone https://github.com/daipenglcc/Dou.git
cd Dou
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务

```bash
node app.js
```

默认运行在 `http://localhost:7777`

---

## 🚀 构建 & 运行容器

```bash
# 构建镜像
docker build -t douyin-server .

# 导出镜像
docker save douyin-server > douyin-server.tar

# 解压镜像
docker load < douyin-server.tar

# 运行容器并映射端口
docker run -d -p 7777:7777 --name douyin-app douyin-server

# 进入正在运行的容器
docker exec -it douyin-app /bin/sh
```

## 🛠️ 注意事项

1. **视频下载**需要保持请求头伪装，建议使用随机 User-Agent（已在 `platformProcessor` 内部处理）。
2. 抖音页面结构若有调整，解析逻辑可能需要更新。
3. 默认视频会下载到项目指定目录，可根据需求修改存储路径。

---