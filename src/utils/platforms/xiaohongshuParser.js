const axios = require('axios')
const { getRandomUA } = require('../userAgents')

/**
 * 小红书平台解析器
 */
class XiaohongshuParser {
	/**
	 * 解析小红书分享链接
	 * @param {string} shareUrl - 小红书分享链接或包含链接的文本
	 * @returns {Object} 小红书内容信息
	 */
	async parseUrl(shareUrl) {
		console.log('开始解析小红书链接:', shareUrl)

		// 1. 从输入文本中提取链接
		const urls = shareUrl.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+)/g)
		const targetUrl = urls && urls.length > 0 ? urls[0] : shareUrl

		// 2. 请求页面，允许重定向以拿到完整页面及最终 URL
		const pageResp = await axios.get(targetUrl, {
			headers: {
				...getRandomUA(),
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
			},
			maxRedirects: 5,
			timeout: 10000
		})

		const html = pageResp.data || ''
		const realUrl = pageResp.request?.res?.responseUrl || targetUrl
		console.log('重定向后的真实链接:', realUrl)

		// 3. 提取笔记 ID
		let noteId = null
		const noteIdMatch = realUrl.match(/\/(?:explore|discovery\/item|note)\/([a-zA-Z0-9_-]+)/)
		if (noteIdMatch) {
			noteId = noteIdMatch[1]
		} else if (realUrl.includes('redirectPath=')) {
			try {
				const redirectPath = decodeURIComponent(
					realUrl.split('redirectPath=')[1].split('&')[0]
				)
				const subMatch = redirectPath.match(
					/\/(?:explore|discovery\/item|note)\/([a-zA-Z0-9_-]+)/
				)
				if (subMatch) noteId = subMatch[1]
			} catch (e) {
				// ignore
			}
		}

		// 4. 从 HTML 中提取 window.__INITIAL_STATE__ 或 window.__INITIAL_SSR_STATE__
		const scriptMatch =
			html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?})\s*<\/script>/s) ||
			html.match(/window\.__INITIAL_SSR_STATE__\s*=\s*({.*?})\s*<\/script>/s)

		const isNotFound =
			realUrl.includes('/404') ||
			realUrl.includes('error_code=300031') ||
			html.includes('当前笔记暂时无法浏览')

		if (!scriptMatch) {
			if (isNotFound) {
				const err = new Error('抱歉，该小红书笔记不存在、已被作者下架删除或设为私密不可见~')
				err.isUserFacing = true
				throw err
			}
			throw new Error('无法从小红书页面中提取有效数据')
		}

		// 5. 解析 JSON 数据
		let jsonData
		try {
			const jsonStr = scriptMatch[1].replace(/undefined/g, 'null')
			jsonData = JSON.parse(jsonStr)
		} catch (parseError) {
			console.error('JSON解析失败:', parseError.message)
			throw new Error('小红书页面数据 JSON 解析失败')
		}

		// 6. 获取笔记详情数据
		const noteDetailMap = jsonData.note?.noteDetailMap
		if (!noteId && noteDetailMap) {
			noteId = Object.keys(noteDetailMap)[0]
		}
		if (!noteId && jsonData.note?.firstNoteId) {
			noteId = jsonData.note.firstNoteId
		}

		let noteData = noteDetailMap && noteId ? noteDetailMap[noteId]?.note : null
		if (!noteData && noteDetailMap) {
			const firstKey = Object.keys(noteDetailMap)[0]
			noteData = noteDetailMap[firstKey]?.note
		}

		if (!noteData) {
			if (isNotFound) {
				const err = new Error('抱歉，该小红书笔记不存在、已被作者下架删除或设为私密不可见~')
				err.isUserFacing = true
				throw err
			}
			throw new Error('未找到该小红书笔记数据')
		}

		console.log('获取到笔记数据标题:', noteData.title || noteData.desc)

		// 7. 解析并返回格式化结果
		return this.parseNoteData(noteData, noteId || 'unknown')
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

		// 判断内容类型
		const isVideo = noteData.type === 'video' || (noteData.video && noteData.video.media)

		let videoUrl = null
		let coverImg = []
		let allImg = []

		if (isVideo && noteData.video) {
			const mediaStream = noteData.video.media?.stream
			const streamList = mediaStream?.h264 || mediaStream?.h265 || mediaStream?.av1
			if (streamList && streamList.length > 0) {
				videoUrl = streamList[0].masterUrl || streamList[0].backupUrl?.[0]
			} else if (noteData.video.url) {
				videoUrl = noteData.video.url
			}
			if (videoUrl) {
				videoUrl = videoUrl.replace(/^http:/, 'https:')
			}
			const firstImg = noteData.imageList?.[0]
			if (firstImg) {
				const imgUrl = firstImg.urlDefault || firstImg.urlPre || ''
				if (imgUrl) coverImg = [imgUrl.replace(/^http:/, 'https:')]
			}
		} else {
			// 图文类型
			if (noteData.imageList && noteData.imageList.length > 0) {
				allImg = noteData.imageList
					.map((img) => {
						const url = img.urlDefault || img.urlPre || img.url || ''
						return url.replace(/^http:/, 'https:')
					})
					.filter(Boolean)
			}
			if (allImg.length > 0) {
				coverImg = [allImg[0]]
			}
		}

		const userObj = noteData.user || {}

		return {
			// 作品信息
			project: {
				project_id: noteId,
				title: cleanTitle,
				desc: noteData.desc || '',
				type: isVideo ? 'video' : 'image',
				cover: coverImg.length > 0 ? coverImg[0] : '',
				url_list: isVideo ? (videoUrl ? [videoUrl] : []) : allImg
			},
			// 作者信息
			author: {
				author_id: userObj.userId || userObj.redId || '',
				nickname: userObj.nickname || '未知用户',
				avatar: (userObj.avatar || '')
					.replace(/^http:/, 'https:')
					.replace(/w\/\d+/, 'w/720')
			},
			// 统计信息
			statistics: {
				digg_count: noteData.interactInfo
					? parseInt(noteData.interactInfo.likedCount) || 0
					: 0,
				comment_count: noteData.interactInfo
					? parseInt(noteData.interactInfo.commentCount) || 0
					: 0,
				share_count: noteData.interactInfo
					? parseInt(noteData.interactInfo.shareCount) || 0
					: 0,
				collect_count: noteData.interactInfo
					? parseInt(noteData.interactInfo.collectedCount) || 0
					: 0
			},
			platform: 'xiaohongshu'
		}
	}
}

module.exports = XiaohongshuParser
