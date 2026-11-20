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

## ⏰ 每日解析自检（定时任务）

项目内置了每日下午 `15:00`（北京时间）的多平台解析自检任务，会自动检测各平台的视频/图集解析与媒体直链可用性，并将自检日志发送到指定邮箱。

### 方式一：GitHub Actions 定时触发（推荐，当前已配置）

工作流文件位于 `.github/workflows/daily-health-check.yml`（默认 `0 7 * * *` UTC = 北京时间 `15:00`）。

1. **配置线上触发地址**：
   - 路径：`Settings → Secrets and variables → Actions → Variables`
   - 点击 **`New repository variable`** 新增变量：
     - **Name**：`HEALTH_CHECK_URL`
     - **Value**：`https://你的线上域名/api/health-check?notify=1`（例如 `https://douyin.vues.cn/api/health-check?notify=1`）
   - 填完点击 **`Add variable`** 保存。
2. **手动触发测试**：
   - 路径：`Actions → Daily Parser Health Check → Run workflow`
   - 点击 **`Run workflow`** 即可立即执行一次自检并发送邮件报告。

### 方式二：Vercel 自带 Cron Jobs

在项目根目录的 `vercel.json` 中添加 `crons` 配置（Vercel 使用 UTC 时间，`0 7 * * *` 对应北京时间 `15:00`）：

```json
{
	"crons": [
		{
			"path": "/api/health-check?notify=1",
			"schedule": "0 7 * * *"
		}
	]
}
```

> 注意：Vercel Hobby 免费版支持每天触发 1 次，且单次函数调用超时限制为 10 秒；如果串行检测超过 10 秒，建议改用 GitHub Actions 或 `cron-job.org` 触发自有服务器。

### 方式三：第三方免费 Cron 服务（cron-job.org）

无需改动仓库代码，使用 https://cron-job.org/en/ 即可：

1. 注册并登录 https://cron-job.org/en/，新建一个 Cronjob；
2. **URL** 填写：`https://你的线上域名/api/health-check?notify=1`（例如 `https://douyin.vues.cn/api/health-check?notify=1`）；
3. **Execution schedule** 设置为每天 `15:00`（时区选择 `Asia/Shanghai`），保存即可。

---

## 🛠️ 注意事项

1. **视频下载**需要保持请求头伪装，建议使用随机 User-Agent（已在 `platformProcessor` 内部处理）。
2. 抖音页面结构若有调整，解析逻辑可能需要更新。
3. 默认视频会下载到项目指定目录，可根据需求修改存储路径。

---