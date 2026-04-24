const axios = require('axios')
const { getRandomUA } = require('../userAgents')

/**
 * 小红书平台解析器
 */
class XiaohongshuParser {
	/**
	 * 解析小红书分享链接
	 * @param {string} shareUrl - 小红书分享链接
	 * @returns {Object} 小红书内容信息
	 */
	async parseUrl(shareUrl) {
		console.log("开始解析小红书链接:", shareUrl)
		
		// 第一步：获取重定向后的真实链接
		const shareResp = await axios.get(shareUrl, { 
			headers: getRandomUA(),
			maxRedirects: 5,
			timeout: 10000
		})
		const realUrl = shareResp.request.res.responseUrl
		console.log("重定向后的真实链接:", realUrl)

		// 从真实链接中提取笔记ID
		let noteIdMatch = realUrl.match(/\/explore\/([a-zA-Z0-9]+)/) || 
						  realUrl.match(/\/discovery\/item\/([a-zA-Z0-9]+)/) ||
						  realUrl.match(/\/note\/([a-zA-Z0-9]+)/)
		
		if (!noteIdMatch) {
			throw new Error('无法从链接中提取笔记ID')
		}
		const noteId = noteIdMatch[1]
		console.log("提取到的笔记ID:", noteId)

		// 第二步：获取页面内容并解析数据
		const pageResp = await axios.get(realUrl, { 
			headers: {
				...getRandomUA(),
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2'
			}
		})

		const html = pageResp.data
		
		// 提取window.__INITIAL_STATE__数据
		const scriptMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?})\s*<\/script>/s)
		if (!scriptMatch) {
			throw new Error('无法从页面中提取数据')
		}

		// 解析JSON数据
		let jsonData
		try {
			let jsonStr = scriptMatch[1]
			jsonStr = jsonStr.replace(/undefined/g, 'null')
			jsonData = JSON.parse(jsonStr)
		} catch (parseError) {
			console.error('JSON解析失败:', parseError.message)
			throw new Error('页面数据解析失败')
		}

		// 获取笔记详情数据
		const noteDetailMap = jsonData.note?.noteDetailMap
		if (!noteDetailMap || !noteDetailMap[noteId]) {
			throw new Error('未找到笔记数据')
		}

		const noteData = noteDetailMap[noteId].note
		console.log("获取到笔记数据:", noteData.title)

		// 解析笔记信息
		return this.parseNoteData(noteData, noteId)
	}

	/**
	 * 解析小红书笔记数据
	 * @param {Object} noteData - 笔记数据
	 * @param {string} noteId - 笔记ID
	 * @returns {Object} 格式化的笔记信息
	 */
	parseNoteData(noteData, noteId) {
		const title = noteData.title || noteData.desc || `xiaohongshu_${noteId}`
		const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '_')
		
		// 判断内容类型（小红书主要是图文，视频较少）
		const isVideo = noteData.type === 'video' || (noteData.video && noteData.video.media)
		
		let videoUrl = null
		let coverImg = []
		let allImg = []

		if (isVideo && noteData.video) {
			// 从 media.stream.h264 中取视频地址，优先取第一条
			const h264List = noteData.video.media?.stream?.h264
			if (h264List && h264List.length > 0) {
				videoUrl = h264List[0].masterUrl
			}
			// 封面图：视频封面取 imageList[0].urlDefault
			const firstImg = noteData.imageList?.[0]
			if (firstImg) {
				coverImg = [firstImg.urlDefault || firstImg.urlPre || '']
			}
		} else {
			// 图文类型
			if (noteData.imageList && noteData.imageList.length > 0) {
				allImg = noteData.imageList.map(img => {
					// 优先使用默认尺寸图片
					return img.urlDefault || img.urlPre || img.url
				}).filter(Boolean)
			}
		}

		return {
			// 作品信息
			project: {
				project_id: noteId, // 作品唯一ID
				title: cleanTitle, // 作品标题
				desc: noteData.desc || '', // 作品描述
				type: isVideo ? 'video' : 'image', // 内容类型
				cover: coverImg.length > 0 ? coverImg[0] : '', // 封面图
				url_list: isVideo ? (videoUrl ? [videoUrl] : []) : allImg, // 视频/图集地址列表
			},
			// 作者信息
			author: {
				author_id: noteData.user ? noteData.user.userId : '', // 用户ID
				nickname: noteData.user ? noteData.user.nickname : '未知用户', // 用户昵称
				avatar: noteData.user ? noteData.user.avatar : '', // 用户头像
			},
			// 统计信息
			statistics: {
				digg_count: noteData.interactInfo ? parseInt(noteData.interactInfo.likedCount) || 0 : 0, // 点赞数
				comment_count: noteData.interactInfo ? parseInt(noteData.interactInfo.commentCount) || 0 : 0, // 评论数
				share_count: noteData.interactInfo ? parseInt(noteData.interactInfo.shareCount) || 0 : 0, // 分享数
				collect_count: noteData.interactInfo ? parseInt(noteData.interactInfo.collectedCount) || 0 : 0, // 收藏数
			},
			platform: 'xiaohongshu', // 平台标识
		}
	}
}

module.exports = XiaohongshuParser