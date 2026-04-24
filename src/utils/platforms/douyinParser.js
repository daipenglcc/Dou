const axios = require('axios')
const { getRandomUA } = require('../userAgents')

/**
 * 抖音平台解析器
 */
class DouyinParser {
	/**
	 * 解析抖音分享链接
	 * @param {string} shareUrl - 抖音分享链接
	 * @returns {Object} 抖音视频/图集信息
	 */
	async parseUrl(shareUrl) {
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
			project: {
				project_id: data.aweme_id, // 作品唯一ID
				title: desc, // 作品标题（抖音无独立title，使用desc）
				desc: '', // 作品描述（抖音无独立desc字段）
				type: aweme_type === 4 ? 'video' : 'image', // 内容类型
				cover: coverImg ? coverImg[0] : '', // 封面图
				url_list: aweme_type === 4 ? [videoUrl] : allImg, // 视频/图集地址列表
			},
			// 作者信息
			author: {
				author_id: data.author.short_id, // 用户抖音号
				nickname: data.author.nickname, // 用户昵称
				avatar: data.author.avatar_thumb.url_list[0], // 用户头像
			},
			// 统计信息
			statistics: {
				digg_count: data.statistics.digg_count, // 点赞数
				comment_count: data.statistics.comment_count, // 评论数
				share_count: data.statistics.share_count, // 分享数
				collect_count: data.statistics.collect_count, // 收藏数
			},
			platform: 'douyin', // 平台标识
		}
	}
}

module.exports = DouyinParser