const axios = require('axios')
const Router = require('koa-router')
const PlatformProcessor = require('../utils/platformProcessor')
const path = require('path')

const router = new Router()

/**
 * 将 URL 包装为代理地址
 */
function wrapProxy(url, base) {
	if (!url) return url
	return `${base}${encodeURIComponent(url)}`
}

/**
 * 递归遍历对象中所有 url_list 和 cover 字段，包装为代理地址
 */
function wrapUrlsWithProxy(data, base) {
	if (!data || typeof data !== 'object') return

	if (Array.isArray(data)) {
		data.forEach(item => wrapUrlsWithProxy(item, base))
		return
	}

	for (const key of Object.keys(data)) {
		if (key === 'url_list' && Array.isArray(data[key])) {
			data[key] = data[key].map(u => wrapProxy(u, base))
		} else if (key === 'cover' && typeof data[key] === 'string') {
			data[key] = wrapProxy(data[key], base)
		} else if (typeof data[key] === 'object') {
			wrapUrlsWithProxy(data[key], base)
		}
	}
}

/**
 * POST /api/parse
 * 解析多平台分享链接接口
 * 支持抖音、小红书、快手、B站等平台的分享链接解析
 *
 * @route POST /api/parse
 * @param {Object} ctx.request.body - 请求体
 * @param {string} [ctx.request.body.shareLink] - 分享链接（与shareText二选一）
 * @param {string} [ctx.request.body.shareText] - 分享文本（与shareLink二选一）
 * @returns {Object} 解析结果
 * @returns {boolean} returns.success - 是否成功
 * @returns {Object} returns.data - 解析得到的视频/图集信息
 * @returns {string} returns.message - 成功消息
 * @returns {string} returns.timestamp - 时间戳
 */
router.post('/parse', async (ctx) => {
	const { shareLink, shareText } = ctx.request.body

	if (!shareLink && !shareText) {
		ctx.status = 400
		ctx.body = {
			success: false,
			error: '请提供 shareLink 或 shareText 参数'
		}
		return
	}

	const inputText = shareLink || shareText
	const processor = new PlatformProcessor()

	try {
		const videoInfo = await processor.parseShareUrl(inputText)

		// 将 cover 和 url_list 中的原始链接包装为同源代理地址
		const proxyBase = `${ctx.origin}/api/proxyFile?url=`
		wrapUrlsWithProxy(videoInfo, proxyBase)

		ctx.body = {
			success: true,
			data: videoInfo,
			message: '解析成功',
			timestamp: new Date().toISOString()
		}
	} catch (error) {
		ctx.status = 400
		ctx.body = {
			success: false,
			error: error.message,
			timestamp: new Date().toISOString()
		}
	}
})

/**
 * GET /api/download-stream
 * 流式下载视频接口
 * 直接将远程视频流转发给客户端，实现边下载边传输
 *
 * @route GET /api/download-stream
 * @param {Object} ctx.query - 查询参数
 * @param {string} ctx.query.url - 视频下载链接（必需）
 * @param {string} [ctx.query.title] - 视频标题，用作文件名（可选，默认为'video'）
 * @returns {Stream} 视频文件流
 */
router.get('/download-stream', async (ctx) => {
	const { url, title } = ctx.query
	if (!url) {
		ctx.status = 400
		ctx.body = '缺少视频 URL'
		return
	}

	// 设置下载头
	ctx.set('Content-Type', 'application/octet-stream')
	ctx.set(
		'Content-Disposition',
		`attachment; filename="${encodeURIComponent(title || 'video')}.mp4"`
	)

	// 获取视频流并返回
	const response = await axios.get(url, { responseType: 'stream' })
	ctx.body = response.data
})

/**
 * GET /api/proxyFile
 * 代理下载远程文件接口
 * 作为中间代理，下载远程文件并转发给客户端
 * 主要用于解决跨域问题和统一下载入口
 *
 * @route GET /api/proxyFile
 * @param {Object} ctx.query - 查询参数
 * @param {string} ctx.query.url - 远程文件链接（必需）
 * @returns {Stream} 文件流或错误信息
 */
router.get('/proxyFile', async (ctx) => {
	const { url } = ctx.query

	if (!url) {
		ctx.status = 400
		ctx.body = { success: false, error: '请提供 url 参数' }
		return
	}

	try {
		// 请求远程文件流
		const response = await axios.get(url, {
			responseType: 'stream',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
			},
			timeout: 10 * 60 * 1000 // 10 分钟
		})

		// 获取文件名
		const fileName = path.basename(url.split('?')[0]) || 'file'

		// 设置响应头（把远程头部透传给前端）
		ctx.set('Content-Disposition', `attachment; filename="${fileName}"`)
		ctx.set('Content-Type', response.headers['content-type'] || 'application/octet-stream')

		// ⭐ 把 Content-Length 转发给前端
		if (response.headers['content-length']) {
			ctx.set('Content-Length', response.headers['content-length'])
		}

		// 直接返回文件流
		ctx.body = response.data
	} catch (error) {
		console.error('Proxy file error:', error.message)
		ctx.status = 500
		ctx.body = { success: false, error: '代理下载失败' }
	}
})

module.exports = router
