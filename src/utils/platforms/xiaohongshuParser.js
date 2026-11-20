const axios = require('axios')

const DESKTOP_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
	'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
	'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
	'Sec-Ch-Ua-Mobile': '?0',
	'Sec-Ch-Ua-Platform': '"macOS"',
	'Sec-Fetch-Dest': 'document',
	'Sec-Fetch-Mode': 'navigate',
	'Sec-Fetch-Site': 'none',
	'Upgrade-Insecure-Requests': '1'
}

const MOBILE_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
	'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
}

/**
 * 解析小红书计数字符串（支持 "3,607"、"32.1K"、"1.2万" 等格式）
 */
function parseCount(val) {
	if (typeof val === 'number') return Number.isFinite(val) ? val : 0
	if (!val) return 0
	const str = String(val).replace(/,/g, '').trim()
	if (/万$/.test(str)) {
		return Math.round(parseFloat(str) * 10000) || 0
	}
	if (/[kK]$/.test(str)) {
		return Math.round(parseFloat(str) * 1000) || 0
	}
	return parseInt(str, 10) || 0
}

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

		// 2. 双策略抓取：优先桌面端，失败自动降级到移动端 H5（提升云端 IP 穿透成功率）
		const strategies = [
			{ name: 'Desktop', headers: DESKTOP_HEADERS },
			{ name: 'Mobile', headers: MOBILE_HEADERS }
		]

		let lastError = null
		for (const strategy of strategies) {
			try {
				const result = await this.fetchAndParse(targetUrl, strategy.headers, strategy.name)
				if (result) return result
			} catch (err) {
				if (err.isUserFacing) throw err
				lastError = err
				console.warn(`[XiaohongshuParser] ${strategy.name} 策略失败:`, err.message)
			}
		}

		throw lastError || new Error('无法从小红书页面中提取有效数据')
	}

	/**
	 * 使用指定请求头抓取并解析小红书页面
	 */
	async fetchAndParse(targetUrl, headers, strategyName) {
		const pageResp = await axios.get(targetUrl, {
			headers,
			maxRedirects: 5,
			timeout: 10000,
			validateStatus: () => true
		})

		const html = typeof pageResp.data === 'string' ? pageResp.data : ''
		const realUrl = pageResp.request?.res?.responseUrl || targetUrl
		console.log(
			`[XiaohongshuParser] (${strategyName}) status=${pageResp.status} realUrl=${realUrl}`
		)

		if (pageResp.status >= 400) {
			throw new Error(`小红书请求被拦截 (HTTP ${pageResp.status})`)
		}

		if (realUrl.includes('website-login/captcha') || html.includes('安全限制')) {
			throw new Error('小红书触发滑块/安全验证风控')
		}

		// 提取笔记 ID
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

		// 从 HTML 中提取 window.__INITIAL_STATE__ 或 window.__INITIAL_SSR_STATE__
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
			throw new Error(`无法从小红书页面提取初始数据 (${strategyName}, len=${html.length})`)
		}

		// 解析 JSON 数据
		let jsonData
		try {
			const jsonStr = scriptMatch[1].replace(/undefined/g, 'null')
			jsonData = JSON.parse(jsonStr)
		} catch (parseError) {
			console.error('JSON解析失败:', parseError.message)
			throw new Error('小红书页面数据 JSON 解析失败')
		}

		// 兼容桌面端 (note.noteDetailMap) 与移动端 H5 (noteData.data.noteData)
		let noteData = null
		const noteDetailMap = jsonData.note?.noteDetailMap
		if (noteDetailMap) {
			if (!noteId) noteId = Object.keys(noteDetailMap)[0]
			if (!noteId && jsonData.note?.firstNoteId) noteId = jsonData.note.firstNoteId
			noteData = noteId ? noteDetailMap[noteId]?.note : null
			if (!noteData) {
				const firstKey = Object.keys(noteDetailMap)[0]
				noteData = noteDetailMap[firstKey]?.note
			}
		}
		if (!noteData && jsonData.noteData?.data?.noteData) {
			noteData = jsonData.noteData.data.noteData
			if (!noteId && noteData.noteId) noteId = noteData.noteId
		}

		if (!noteData) {
			if (isNotFound) {
				const err = new Error('抱歉，该小红书笔记不存在、已被作者下架删除或设为私密不可见~')
				err.isUserFacing = true
				throw err
			}
			throw new Error(`未找到该小红书笔记数据 (${strategyName})`)
		}

		console.log('获取到笔记数据标题:', noteData.title || noteData.desc)
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
			const rawCover =
				firstImg?.urlDefault ||
				firstImg?.urlPre ||
				firstImg?.url ||
				firstImg?.infoList?.[0]?.url ||
				noteData.cover?.url ||
				''
			if (rawCover) {
				coverImg = [rawCover.replace(/^http:/, 'https:')]
			}
		} else {
			// 图文类型
			if (noteData.imageList && noteData.imageList.length > 0) {
				allImg = noteData.imageList
					.map((img) => {
						const url =
							img.urlDefault || img.urlPre || img.url || img.infoList?.[0]?.url || ''
						return url.replace(/^http:/, 'https:')
					})
					.filter(Boolean)
			}
			if (allImg.length > 0) {
				coverImg = [allImg[0]]
			}
		}

		const urlList = isVideo ? (videoUrl ? [videoUrl] : []) : allImg
		if (urlList.length === 0) {
			throw new Error(`未能提取到小红书媒体资源地址 (noteId: ${noteId})`)
		}

		const userObj = noteData.user || {}
		const interact = noteData.interactInfo || {}

		return {
			// 作品信息
			project: {
				project_id: noteId,
				title: cleanTitle,
				desc: noteData.desc || '',
				type: isVideo ? 'video' : 'image',
				cover: coverImg.length > 0 ? coverImg[0] : '',
				url_list: urlList
			},
			// 作者信息
			author: {
				author_id: userObj.userId || userObj.redId || '',
				nickname: userObj.nickname || userObj.nickName || '未知用户',
				avatar: (userObj.avatar || '')
					.replace(/^http:/, 'https:')
					.replace(/w\/\d+/, 'w/720')
			},
			// 统计信息
			statistics: {
				digg_count: parseCount(interact.likedCount),
				comment_count: parseCount(interact.commentCount),
				share_count: parseCount(interact.shareCount),
				collect_count: parseCount(interact.collectedCount)
			},
			platform: 'xiaohongshu'
		}
	}
}

module.exports = XiaohongshuParser
