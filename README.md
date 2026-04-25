# 🎬 Douyin Video Parser & Downloader

一个基于 **Koa2** 的多平台视频/图集解析下载服务，支持抖音、小红书、快手、B站等主流平台。

- 🔗 **解析分享链接**：提取视频或图集信息（标题、封面、作者、播放地址等）
- 📥 **视频流式下载**：无水印视频直接下载到客户端
- 🖼️ **图集浏览**：支持图文类型内容解析
- 🔄 **代理下载**：转发远程文件流，解决跨域问题

---

## 🚀 API 接口

查看 [API.md](API.md) 获取详细接口文档。

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