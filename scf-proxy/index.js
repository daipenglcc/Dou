const http = require('http')
const https = require('https')
const path = require('path')
const { URL } = require('url')

const PORT = parseInt(process.env.PORT || '9000', 10)
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 单文件最大 50MB
const MAX_REDIRECTS = 5

// 允许代理的官方媒体 CDN 域名后缀白名单（防开放代理被刷流量账单）
const ALLOWED_HOST_SUFFIXES = [
	// 抖音 / 字节跳动系
	'douyinpic.com',
	'douyinvod.com',
	'douyin.com',
	'iesdouyin.com',
	'365yg.com',
	'bytedance.com',
	'bytecdn.com',
	'bytetos.com',
	'snssdk.com',
	'amemv.com',
	'zjcdn.com',
	// 今日头条 / 西瓜视频
	'toutiaoimg.com',
	'toutiaovod.com',
	'toutiaostatic.com',
	'toutiao.com',
	'ixigua.com',
	// 小红书
	'xhscdn.com',
	'xiaohongshu.com',
	'sns-video-bd.xhscdn.com',
	// 快手
	'yximgs.com',
	'kuaishou.com',
	'kwimgs.com',
	'kwaicdn.com',
	'chenzhongtech.com',
	// B站
	'bilivideo.com',
	'bilivideo.cn',
	'hdslb.com',
	'bilibili.com',
	'akamaized.net',
	'szbdyd.com',
	'mcdn.bilivideo.cn'
]

function isAllowedHost(hostname) {
	const host = (hostname || '').toLowerCase()
	return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith('.' + suffix))
}

function sendJson(res, status, data) {
	if (res.headersSent) return
	const body = JSON.stringify(data)
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength(body),
		'Access-Control-Allow-Origin': '*'
	})
	res.end(body)
}

/**
 * 发起远程流式请求（支持最多 5 次重定向与目标域名白名单校验）
 */
function fetchRemoteStream(targetUrl, clientReq, res, options, redirectCount = 0) {
	let parsedUrl
	try {
		parsedUrl = new URL(targetUrl)
	} catch (e) {
		sendJson(res, 400, { success: false, error: '无效的 url 参数' })
		return
	}

	if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
		sendJson(res, 400, { success: false, error: '仅支持 http/https 协议' })
		return
	}

	if (!isAllowedHost(parsedUrl.hostname)) {
		sendJson(res, 403, { success: false, error: `不支持代理该域名: ${parsedUrl.hostname}` })
		return
	}

	const reqHeaders = {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
	}
	if (clientReq.headers.range && !options.forceAttachment) {
		reqHeaders.Range = clientReq.headers.range
	}
	if (/bilivideo\.|hdslb\.com|akamaized\.net/i.test(parsedUrl.hostname)) {
		reqHeaders.Referer = 'https://www.bilibili.com/'
	}

	const transport = parsedUrl.protocol === 'https:' ? https : http
	const upstreamReq = transport.get(
		parsedUrl,
		{ headers: reqHeaders, timeout: 15000 },
		(upstreamRes) => {
			// 处理 3xx 重定向
			if (
				[301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
				upstreamRes.headers.location
			) {
				upstreamRes.resume()
				if (redirectCount >= MAX_REDIRECTS) {
					sendJson(res, 400, { success: false, error: '重定向次数过多' })
					return
				}
				const nextUrl = new URL(upstreamRes.headers.location, parsedUrl).toString()
				fetchRemoteStream(nextUrl, clientReq, res, options, redirectCount + 1)
				return
			}

			if (upstreamRes.statusCode >= 400) {
				upstreamRes.resume()
				sendJson(res, 400, {
					success: false,
					error: `远程资源不可访问 (HTTP ${upstreamRes.statusCode})`
				})
				return
			}

			const contentLength = upstreamRes.headers['content-length']
			if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
				upstreamRes.destroy()
				sendJson(res, 400, {
					success: false,
					error: '当前视频超过 50MB，受小程序平台规则限制，暂不支持直接下载保存。'
				})
				return
			}

			const status = upstreamRes.statusCode === 206 ? 206 : 200
			const respHeaders = {
				'Access-Control-Allow-Origin': '*',
				'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
				'Content-Type': options.forceAttachment
					? 'application/octet-stream'
					: upstreamRes.headers['content-type'] || 'application/octet-stream'
			}

			if (upstreamRes.headers['content-range']) {
				respHeaders['Content-Range'] = upstreamRes.headers['content-range']
			}
			if (contentLength) {
				respHeaders['Content-Length'] = contentLength
			}
			if (options.forceAttachment) {
				const safeTitle = encodeURIComponent(options.title || 'video')
				respHeaders['Content-Disposition'] = `attachment; filename="${safeTitle}.mp4"`
			} else if (status !== 206) {
				const fileName = path.basename(parsedUrl.pathname) || 'file'
				respHeaders['Content-Disposition'] = `attachment; filename="${fileName}"`
			}

			res.writeHead(status, respHeaders)

			let downloadedBytes = 0
			upstreamRes.on('data', (chunk) => {
				downloadedBytes += chunk.length
				if (downloadedBytes > MAX_FILE_SIZE) {
					upstreamRes.destroy()
					res.destroy()
				}
			})
			upstreamRes.pipe(res)
		}
	)

	upstreamReq.on('timeout', () => {
		upstreamReq.destroy()
		sendJson(res, 504, { success: false, error: '连接远程资源超时' })
	})

	upstreamReq.on('error', (err) => {
		sendJson(res, 400, { success: false, error: `代理下载失败: ${err.message}` })
	})

	clientReq.on('close', () => {
		if (!res.writableEnded) {
			upstreamReq.destroy()
		}
	})
}

const server = http.createServer((req, res) => {
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		})
		res.end()
		return
	}

	const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
	const pathname = reqUrl.pathname

	if (pathname === '/' || pathname === '/health') {
		sendJson(res, 200, { success: true, service: 'dou-download-proxy', status: 'ok' })
		return
	}

	if (pathname === '/api/proxyFile' || pathname === '/proxyFile') {
		const targetUrl = reqUrl.searchParams.get('url')
		if (!targetUrl) {
			sendJson(res, 400, { success: false, error: '请提供 url 参数' })
			return
		}
		fetchRemoteStream(targetUrl, req, res, { forceAttachment: false })
		return
	}

	if (pathname === '/api/download-stream' || pathname === '/download-stream') {
		const targetUrl = reqUrl.searchParams.get('url')
		const title = reqUrl.searchParams.get('title') || 'video'
		if (!targetUrl) {
			sendJson(res, 400, { success: false, error: '缺少视频 URL' })
			return
		}
		fetchRemoteStream(targetUrl, req, res, { forceAttachment: true, title })
		return
	}

	sendJson(res, 404, { success: false, error: 'Not Found' })
})

server.listen(PORT, '0.0.0.0', () => {
	console.log(`[dou-download-proxy] listening on 0.0.0.0:${PORT}`)
})
