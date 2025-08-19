# Douyin Video Parser & Downloader

一个基于 **Koa2** 的抖音视频解析与下载服务，支持：
- 解析抖音分享链接，获取视频信息
- 下载视频到本地，并返回路径
- 直接返回视频文件流供前端下载

---

## 🚀 功能列表

### 1. 解析接口
**POST** `/parse`

- 请求参数：
```json
{
  "shareLink": "https://v.douyin.com/xxxxxxx/"
}
````

或

```json
{
  "shareText": "快来看看这个视频 https://v.douyin.com/xxxxxxx/"
}
```

* 返回示例：

```json
{
  "success": true,
  "data": {
    "videoId": "123456789",
    "title": "这是一个示例视频",
    "author": "某某用户",
    "videoUrl": "https://example.com/video.mp4"
  },
  "message": "解析成功",
  "timestamp": "2025-08-19T12:00:00.000Z"
}
```

---

### 2. 下载接口（返回 JSON + 文件路径）

**POST** `/download`

* 请求参数同 `/parse`

* 返回示例：

```json
{
  "success": true,
  "message": "下载成功",
  "file": "/absolute/path/to/video.mp4",
  "videoInfo": { ... },
  "timestamp": "2025-08-19T12:05:00.000Z"
}
```

---

### 3. 下载接口（返回视频文件流）

**POST** `/download/stream`

* 请求参数同 `/parse`

* 响应头：

```
Content-Type: video/mp4
Content-Disposition: attachment; filename="视频标题.mp4"
```

* 直接触发浏览器下载。

---

## 📦 安装与运行

### 1. 克隆项目

```bash
git clone https://github.com/yourname/douyin-parser.git
cd douyin-parser
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

# 运行容器并映射端口 7777
docker run -d -p 7777:7777 --name douyin-app douyin-server
```

## 🛠️ 注意事项

1. **视频下载**需要保持请求头伪装，建议使用随机 User-Agent（已在 `douyinProcessor` 内部处理）。
2. 抖音页面结构若有调整，解析逻辑可能需要更新。
3. 默认视频会下载到项目指定目录，可根据需求修改存储路径。

---