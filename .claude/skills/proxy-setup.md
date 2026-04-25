---
name: proxy-setup
description: 配置代理下载接口 — 为解析结果中的资源 URL 包装同源代理，解决跨域问题
model: sonnet
---

# 代理下载设置

解析结果中的 `url_list` 和 `cover` 字段需要在 API 层递归包装为同源代理地址，避免前端跨域问题。

## 代理包装

在 `src/routes/video.js` 的解析路由中，解析完成后调用：

```javascript
const proxyBase = `${ctx.origin}/api/proxyFile?url=`
wrapUrlsWithProxy(videoInfo, proxyBase)
```

`wrapUrlsWithProxy` 会递归遍历对象，将 `url_list` 数组中的每个 URL 和 `cover` 字符串包装为代理地址。

## 代理接口

`GET /api/proxyFile?url=<encoded-url>`

- 接收远程文件 URL，通过 axios stream 转发给客户端
- 透传 `Content-Type` 和 `Content-Length` 响应头
- 超时时间：10 分钟

```javascript
// 调用示例
GET /api/proxyFile?url=https%3A%2F%2Fexample.com%2Fvideo.mp4

// 响应：文件流
```

## 流式下载接口

`GET /api/download-stream?url=<encoded-url>&title=<filename>`

- 设置 `Content-Disposition: attachment` 触发浏览器下载
- 适合直接下载视频文件
