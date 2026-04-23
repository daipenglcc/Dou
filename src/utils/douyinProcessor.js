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

	/**
	 * 多平台分享链接解析入口
	 * 支持平台：抖音、快手、小红书、B站等
	 * @param {string} shareText - 分享文本（包含链接）
	 * @returns {Object} 解析结果
	 */
	async parseShareUrl(shareText) {
		// 提取所有链接
		const urls = shareText.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+)/g)
		if (!urls || urls.length === 0) {
			throw new Error('未找到有效的分享链接')
		}

		console.log("提取到的链接:", urls)
		const shareUrl = urls[0]
		console.log("分享链接:", shareUrl)

		// 识别平台类型
		const platform = this.detectPlatform(shareUrl)
		console.log("识别到的平台:", platform)

		// 根据平台调用对应的解析方法
		switch (platform) {
			case 'douyin':
				return await this.parseDouyinUrlOriginal(shareUrl)
			case 'kuaishou':
				return await this.parseKuaishouUrl(shareUrl)
			case 'xiaohongshu':
				return await this.parseXiaohongshuUrl(shareUrl)
			case 'bilibili':
				return await this.parseBilibiliUrl(shareUrl)
			default:
				throw new Error(`暂不支持该平台: ${platform}`)
		}
	}

	/**
	 * 检测分享链接的平台类型
	 * @param {string} url - 分享链接
	 * @returns {string} 平台标识
	 */
	detectPlatform(url) {
		const domain = url.toLowerCase()
		
		if (domain.includes('douyin.com') || domain.includes('v.douyin.com')) {
			return 'douyin'
		} else if (domain.includes('kuaishou.com') || domain.includes('v.kuaishou.com')) {
			return 'kuaishou'
		} else if (domain.includes('xiaohongshu.com') || domain.includes('xhslink.com')) {
			return 'xiaohongshu'
		} else if (domain.includes('bilibili.com') || domain.includes('b23.tv')) {
			return 'bilibili'
		} else {
			return 'unknown'
		}
	}

	/**
	 * 抖音原有解析逻辑（保持不变）
	 * @param {string} shareUrl - 抖音分享链接
	 * @returns {Object} 抖音视频/图集信息
	 */
	async parseDouyinUrlOriginal(shareUrl) {
		const shareResp = await axios.get(shareUrl, { headers: getRandomUA() })
		const realUrl = shareResp.request.res.responseUrl
		console.log("重定向后的真实链接:", realUrl)

		const videoId = realUrl.split('?')[0].split('/').filter(Boolean).pop()
		const finalUrl = `https://www.iesdouyin.com/share/video/${videoId}`
		console.log("构造的标准链接:", finalUrl, "视频ID:", videoId)

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

		delete data.cha_list
		delete data.risk_infos
		delete data.mix_info
		delete data.music
		console.log("data",data) // 打印视频信息
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
			// 作品信息
			aweme_id: data.aweme_id, // 作品唯一ID
			aweme_type: aweme_type, // 内容类型 2:图文 4:视频
			type: data.video ? 'video' : 'image',
			title: desc, // 作品描述
			cover: coverImg, // 视频封面图
			allImg: allImg, // 图集图片列表
			url: videoUrl, // 视频播放地址
			// 作者信息
			author: {
				nickname: data.author.nickname, // 用户昵称
				short_id: data.author.short_id, // 用户抖音号
				avatar: data.author.avatar_thumb.url_list[0], // 用户头像
			},
			// 统计信息
			statistics: {
				digg_count: data.statistics.digg_count, // 点赞数
				comment_count: data.statistics.comment_count, // 评论数
				share_count: data.statistics.share_count, // 分享数
				collect_count: data.statistics.collect_count, // 收藏数
			},
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

	/**
	 * 解析快手分享链接
	 * @param {string} shareUrl - 快手分享链接
	 * @returns {Object} 快手视频信息
	 */
	async parseKuaishouUrl(shareUrl) {
		// TODO: 实现快手解析逻辑
		throw new Error('快手解析功能开发中...')
	}

	/**
	 * 解析小红书分享链接
	 * @param {string} shareUrl - 小红书分享链接
	 * @returns {Object} 小红书内容信息
	 */
	async parseXiaohongshuUrl(shareUrl) {
		// TODO: 实现小红书解析逻辑
		throw new Error('小红书解析功能开发中...')
	}

	/**
	 * 解析B站分享链接
	 * @param {string} shareUrl - B站分享链接
	 * @returns {Object} B站视频信息
	 */
	async parseBilibiliUrl(shareUrl) {
		// TODO: 实现B站解析逻辑
		throw new Error('B站解析功能开发中...')
	}
}

module.exports = DouyinProcessor
