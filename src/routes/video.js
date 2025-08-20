const axios = require('axios')
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
		// console.log('解析分享链接:', videoInfo)
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

// 下载接口
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
		// 直接保存到服务端-创建日期格式的目录
		// const filepath = await processor.downloadVideo(videoInfo)

		ctx.body = {
			success: true,
			message: '下载成功',
			// file: filepath,
			videoInfo,
			timestamp: new Date().toISOString()
		}

		// 流式下载到客户端
		// await streamVideoToClient(ctx, videoInfo.url, videoInfo.title)
	} catch (error) {
		ctx.status = 500
		ctx.body = {
			success: false,
			error: error.message,
			timestamp: new Date().toISOString()
		}
	}
})

/**
 * 将视频流直接传给客户端
 * @param {Object} ctx Koa ctx
 * @param {String} videoUrl 视频下载地址
 * @param {String} title 视频标题
 */
async function streamVideoToClient(ctx, videoUrl, title) {
	// 处理文件名：去掉非法字符
	const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_')

	// 获取视频流
	const response = await axios.get(videoUrl, { responseType: 'stream' })

	// 设置下载头，支持中文
	ctx.set(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.mp4`
	)
	ctx.set('Content-Type', 'video/mp4')

	// 流式传输到客户端
	ctx.body = response.data
}

module.exports = router
