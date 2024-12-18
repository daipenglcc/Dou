const Router = require('koa-router')
const { parseDouyinUrl, getVideoSrc } = require('../utils/douyin')
const { downloadVideo } = require('../utils/downloader')
const path = require('path')
const fs = require('fs')

const router = new Router()

router.post('/parse', async (ctx) => {
	try {
		const { url, download = false } = ctx.request.body

		if (!url) {
			ctx.status = 400
			ctx.body = { error: '请提供抖音分享链接' }
			return
		}

		const videoInfo = await parseDouyinUrl(url)

		if (download) {
			// 生成文件名（使用时间戳避免重复）
			const filename = `douyin_${Date.now()}`
			const filePath = await downloadVideo(videoInfo.videoUrl, filename)

			videoInfo.localPath = filePath
			videoInfo.downloadSuccess = true
		}

		ctx.body = {
			success: true,
			data: videoInfo
		}
	} catch (error) {
		ctx.status = 500
		ctx.body = {
			success: false,
			error: error.message
		}
	}
})

router.post('/getHtml', async (ctx) => {
	try {
		const { url } = ctx.request.body

		if (!url) {
			ctx.status = 400
			ctx.body = { error: '请提供URL地址' }
			return
		}

		const data = await getVideoSrc(url)

		ctx.body = {
			success: true,
			data: data
		}
	} catch (error) {
		ctx.status = 500
		ctx.body = {
			success: false,
			error: error.message
		}
	}
})

// 添加一个获取已下载视频的路由
router.get('/downloads', async (ctx) => {
	try {
		const downloadDir = path.join(process.cwd(), 'downloads')
		if (!fs.existsSync(downloadDir)) {
			ctx.body = {
				success: true,
				data: [],
				message: '下载目录不存在'
			}
			return
		}

		const files = fs.readdirSync(downloadDir)
		if (files.length === 0) {
			ctx.body = {
				success: true,
				data: [],
				message: '暂无已下载的视频'
			}
			return
		}

		ctx.body = {
			success: true,
			data: files.map((file) => ({
				filename: file,
				path: path.join(downloadDir, file)
			}))
		}
	} catch (error) {
		ctx.status = 500
		ctx.body = {
			success: false,
			error: error.message,
			message: '获取下载列表失败'
		}
	}
})

// 添加一个测试路由
router.get('/test', (ctx) => {
	ctx.body = 'Test route is working!'
})

module.exports = router
