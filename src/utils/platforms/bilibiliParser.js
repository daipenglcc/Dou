const axios = require('axios')
const { getRandomUA } = require('../userAgents')

/**
 * 哔哩哔哩平台解析器
 */
class BilibiliParser {
	/**
	 * 解析B站分享链接
	 * @param {string} shareUrl - B站分享链接
	 * @returns {Object} B站视频信息
	 */
	async parseUrl(shareUrl) {
		console.log('开始解析B站链接:', shareUrl)

		// 第一步：跟随重定向（处理 b23.tv 短链）
		let finalUrl = shareUrl
		try {
			const shareResp = await axios.get(shareUrl, {
				headers: getRandomUA(),
				maxRedirects: 5,
				timeout: 10000
			})
			finalUrl = shareResp.request.res.responseUrl
		} catch (e) {
			// 如果已有标准 URL 格式，不需要跟随重定向
		}
		console.log('最终链接:', finalUrl)

		// 第二步：提取 BV id
		// 支持格式：/video/BVxxx 或 /BVxxx 或 bvid=BVxxx
		const bvMatch = finalUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/) ||
			finalUrl.match(/[?&]bvid=(BV[a-zA-Z0-9]+)/)
		if (!bvMatch) {
			throw new Error('无法从链接中提取视频ID')
		}
		const bvid = bvMatch[1]
		console.log('提取到的BV ID:', bvid)

		// 第三步：获取移动端页面（桌面端返回压缩HTML，移动端更易解析）
		const mobileUrl = `https://m.bilibili.com/video/${bvid}`
		const pageResp = await axios.get(mobileUrl, {
			headers: {
				'User-Agent': getRandomUA(),
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2'
			},
			timeout: 15000
		})

		const html = pageResp.data

		// 第四步：提取 window.__INITIAL_STATE__
		const stateStart = html.indexOf('__INITIAL_STATE__')
		if (stateStart === -1) {
			throw new Error('无法从页面中提取数据')
		}

		const jsonStart = html.indexOf('{', stateStart)
		// 使用花括号计数找到正确的闭合位置（避免 JSON 中的特殊字符干扰）
		let depth = 0
		let jsonEnd = jsonStart
		for (let i = jsonStart; i < html.length; i++) {
			if (html[i] === '{') depth++
			else if (html[i] === '}') {
				depth--
				if (depth === 0) {
					jsonEnd = i + 1
					break
				}
			}
		}

		if (jsonEnd <= jsonStart) {
			throw new Error('无法定位页面数据边界')
		}

		let jsonStr = html.slice(jsonStart, jsonEnd).trim()
		if (jsonStr.endsWith(';')) {
			jsonStr = jsonStr.slice(0, -1)
		}

		// 第五步：解析 JSON
		let jsonData
		try {
			jsonData = JSON.parse(jsonStr)
		} catch (parseError) {
			console.error('JSON解析失败:', parseError.message)
			throw new Error('页面数据解析失败')
		}

		// 第六步：提取视频信息
		const viewInfo = jsonData.video?.viewInfo
		if (!viewInfo) {
			throw new Error('未找到视频数据')
		}

		console.log('获取到视频数据:', viewInfo.title)

		// 第七步：获取视频播放地址
		const firstPage = viewInfo.pages?.[0] || {}
		const aid = viewInfo.aid
		const cid = firstPage.cid || viewInfo.cid
		const videoUrls = await this.fetchVideoUrls(aid, cid)
		console.log('获取到视频地址数:', videoUrls.length)

		return this.parseVideoData(viewInfo, jsonData.video?.upInfo, videoUrls)
	}

	/**
	 * 通过B站视频流API获取实际播放地址
	 * @param {number} aid - 视频aid
	 * @param {number} cid - 视频cid
	 * @returns {Promise<string[]>} 视频直链数组
	 */
	async fetchVideoUrls(aid, cid) {
		const qualities = [80, 64, 32, 16]
		const baseUrl = 'https://api.bilibili.com/x/player/playurl'

		for (const qn of qualities) {
			try {
				const resp = await axios.get(baseUrl, {
					params: {
						avid: aid,
						cid,
						qn,
						fnval: 0,
						fnver: 0,
						platform: 'html5'
					},
					headers: {
						'User-Agent': getRandomUA(),
						'Referer': 'https://www.bilibili.com'
					},
					timeout: 10000
				})

				const data = resp.data
				if (data.code !== 0 || !data.data) continue

				// durl 模式：直接包含视频 URL
				if (data.data.durl?.length) {
					return data.data.durl.map(d => d.url)
				}

				// dash 模式：合并视频+音频最高码率流
				if (data.data.dash?.video?.length) {
					const video = data.data.dash.video[0]
					const audio = data.data.dash.audio?.[0]
					const urls = [video.base_url || video.backup_url?.[0]]
					if (audio?.base_url) urls.push(audio.base_url)
					return urls.filter(Boolean)
				}
			} catch (e) {
				continue
			}
		}

		return []
	}

	/**
	 * 解析B站视频数据为统一格式
	 */
	parseVideoData(viewInfo, upInfo, videoUrls = []) {
		const title = viewInfo.title || `bilibili_${viewInfo.bvid}`
		const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '_')

		// 封面图
		const cover = viewInfo.pic || ''

		// 作者信息（owner 和 upInfo 两个来源）
		const owner = viewInfo.owner || {}
		const upCard = upInfo?.card || {}
		const author = {
			author_id: owner.mid ? String(owner.mid) : String(upCard.mid || ''),
			nickname: owner.name || upCard.name || '未知用户',
			avatar: owner.face || upCard.face || ''
		}

		// 统计信息
		const stat = viewInfo.stat || {}
		const statistics = {
			digg_count: stat.like || 0,
			comment_count: stat.reply || 0,
			share_count: stat.share || 0,
			collect_count: stat.favorite || 0
		}

		const pageCount = viewInfo.videos || 1
		const firstPage = viewInfo.pages?.[0] || {}

		return {
			project: {
				project_id: viewInfo.bvid,
				title: cleanTitle,
				desc: viewInfo.desc || '',
				type: 'video',
				cover: cover,
				url_list: videoUrls,
				aid: viewInfo.aid,
				cid: firstPage.cid || viewInfo.cid,
				duration: viewInfo.duration,
				page_count: pageCount
			},
			author,
			statistics,
			platform: 'bilibili'
		}
	}
}

module.exports = BilibiliParser
