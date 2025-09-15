const axios = require('axios')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { getRandomUA } = require('./userAgents')

// const HEADERS = {
// 	'User-Agent':
// 		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1'
// }

class DouyinProcessor {
	constructor() {
		// 设置固定的 downloads 目录
		this.baseDir = path.resolve(__dirname, '../downloads')
	}

	// 提取链接
	async parseShareUrl(shareText) {
		const urls = shareText.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+)/g)
		if (!urls || urls.length === 0) {
			throw new Error('未找到有效的抖音分享链接')
		}

		const shareUrl = urls[0]
		const shareResp = await axios.get(shareUrl, { headers: getRandomUA() })
		const realUrl = shareResp.request.res.responseUrl

		const videoId = realUrl.split('?')[0].split('/').filter(Boolean).pop()
		const finalUrl = `https://www.iesdouyin.com/share/video/${videoId}`

		// 获取页面
		const resp = await axios.get(finalUrl, { headers: getRandomUA() })
		const html = resp.data

		const regex = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s
		const match = regex.exec(html)
		if (!match) throw new Error('解析 HTML 获取视频信息失败')

		const jsonData = JSON.parse(match[1].trim())
		const loaderData = jsonData.loaderData

		let originalInfo
		if (loaderData['video_(id)/page']) {
			originalInfo = loaderData['video_(id)/page'].videoInfoRes
		} else if (loaderData['note_(id)/page']) {
			originalInfo = loaderData['note_(id)/page'].videoInfoRes
		} else {
			throw new Error('未能找到视频或图集数据')
		}

		const data = originalInfo.item_list[0]
		const aweme_type = data.aweme_type // 2:图文 4:视频
		let videoUrl, coverImg, allImg, desc

		if (aweme_type == 4) {
			// 普通视频
			videoUrl = data.video.play_addr.url_list[0].replace('playwm', 'play')
			coverImg = [data.video.cover.url_list[0].replace('playwm', 'play')]
		} else if (aweme_type == 2) {
			// 图文/图集
			allImg = data.images.map((img) => img.url_list[0].replace('playwm', 'play'))
		} else {
			throw new Error('既不是视频也不是图集，无法解析下载地址')
		}

		desc = data.desc || `douyin_${videoId}`
		desc = desc.replace(/[\\/:*?"<>|]/g, '_')

		return {
			aweme_type: aweme_type,
			video_id: videoId,
			title: desc,
			url: videoUrl,
			cover: coverImg,
			allImg: allImg,
			type: data.video ? 'video' : 'image',
			short_id: data.author.short_id,
			nickname: data.author.nickname
		}
	}

	// 下载视频
	async downloadVideo(videoInfo) {
		// 获取当天日期，例如 "2025-08-19"
		const today = new Date().toISOString().split('T')[0]

		// 拼接当天的目录路径
		const targetDir = path.join(this.baseDir, today)

		// 如果目录不存在，就创建
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true })
		}

		// 文件名，例如 123456789.mp4
		const filename = `${videoInfo.video_id}.mp4`
		let filepath = path.join(targetDir, filename)

		// 如果文件已存在，加上编号避免覆盖
		let counter = 1
		while (fs.existsSync(filepath)) {
			const newFilename = `${videoInfo.video_id}_${counter}.mp4`
			filepath = path.join(targetDir, newFilename)
			counter++
		}

		// 发起请求并保存
		const response = await axios.get(videoInfo.url, {
			headers: getRandomUA(),
			responseType: 'stream'
		})

		const writer = fs.createWriteStream(filepath)
		response.data.pipe(writer)

		await new Promise((resolve, reject) => {
			writer.on('finish', resolve)
			writer.on('error', reject)
		})

		return filepath
	}
}

module.exports = DouyinProcessor
