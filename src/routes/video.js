const Router = require('koa-router')
const DouyinProcessor = require('../utils/douyinProcessor')
const fs = require('fs')
const path = require('path')

const router = new Router()

// 解析接口
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
	const processor = new DouyinProcessor()

	try {
		const videoInfo = await processor.parseShareUrl(inputText)

		console.log('解析分享链接:', videoInfo)

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

// 下载接口（返回 JSON + 文件路径）
router.post('/download', async (ctx) => {
	const { shareLink, shareText } = ctx.request.body
	if (!shareLink && !shareText) {
		ctx.status = 400
		ctx.body = {
			success: false,
			error: '请提供 shareLink 或 shareText 参数'
		}
		return
	}

	const processor = new DouyinProcessor()

	try {
		const videoInfo = await processor.parseShareUrl(shareLink || shareText)
		const filepath = await processor.downloadVideo(videoInfo)

		ctx.body = {
			success: true,
			message: '下载成功',
			file: filepath,
			videoInfo,
			timestamp: new Date().toISOString()
		}
	} catch (error) {
		ctx.status = 500
		ctx.body = {
			success: false,
			error: error.message,
			timestamp: new Date().toISOString()
		}
	}
})

// 新增接口：直接返回视频文件流
router.post('/download/stream', async (ctx) => {
	const { shareLink, shareText } = ctx.request.body
	if (!shareLink && !shareText) {
		ctx.status = 400
		ctx.body = {
			success: false,
			error: '请提供 shareLink 或 shareText 参数'
		}
		return
	}

	const processor = new DouyinProcessor()

	try {
		const videoInfo = await processor.parseShareUrl(shareLink || shareText)
		const filepath = await processor.downloadVideo(videoInfo)

		ctx.set('Content-Type', 'video/mp4')
		ctx.set('Content-Disposition', `attachment; filename="${videoInfo.title}.mp4"`)
		ctx.body = fs.createReadStream(filepath)
	} catch (error) {
		ctx.status = 500
		ctx.body = {
			success: false,
			error: error.message,
			timestamp: new Date().toISOString()
		}
	}
})

// 健康检查
router.get('/health', (ctx) => {
	ctx.body = {
		success: true,
		message: '抖音解析服务运行正常',
		timestamp: new Date().toISOString(),
		version: '2.1.0'
	}
})

module.exports = router
