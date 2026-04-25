const axios = require('axios')
const { getRandomUA } = require('../userAgents')

/**
 * 今日头条平台解析器
 */
class ToutiaoParser {
	/**
	 * 解析今日头条分享链接
	 * @param {string} shareUrl - 头条分享链接
	 * @returns {Object} 视频信息
	 */
	async parseUrl(shareUrl) {
		let finalUrl = shareUrl
		try {
			const shareResp = await axios.get(shareUrl, {
				headers: getRandomUA(),
				maxRedirects: 5,
				timeout: 10000
			})
			finalUrl = shareResp.request.res.responseUrl || (
				shareResp.request.protocol + '//' +
				shareResp.request.host +
				shareResp.request.path
			)
		} catch (e) {
		}
		console.log('最终链接:', finalUrl)

		const idMatch =
			finalUrl.match(/\/video\/(\d+)/) ||
			finalUrl.match(/\/a(\d+)\//)
		if (!idMatch) {
			throw new Error('无法从链接中提取视频ID')
		}
		const itemId = idMatch[1]
		console.log('提取到的 Item ID:', itemId)

		const pageResp = await axios.get(finalUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
				'Accept': 'text/html,application/xhtml+xml'
			},
			timeout: 15000
		})
		const html = pageResp.data

		const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
		if (!ldMatch) {
			throw new Error('无法解析视频结构化数据')
		}
		const ldData = JSON.parse(ldMatch[1])

		if (ldData['@type'] !== 'VideoObject') {
			throw new Error('暂不支持解析文章类型内容，仅支持视频')
		}

		const title = (ldData.name || `toutiao_${itemId}`).replace(/ - 今日头条$/, '').replace(/[\\/:*?"<>|]/g, '_')
		const cover = (ldData.thumbnailUrl?.[0] || '')
		const desc = (ldData.description || '')
		const durationStr = ldData.duration || 'PT0S'
		const duration = this.parseDuration(durationStr)
		const viewCount = ldData.interactionStatistic?.userInteractionCount || 0

		const authorMatch = desc.match(/-([^-]+?)于\d{4}/)
		const nickname = authorMatch ? authorMatch[1].trim() : '未知用户'

		const avatarMatch = html.match(/<img[^>]*src="(https?:\/\/[^"]+user-avatar[^"]+)"/)
		const avatar = avatarMatch ? avatarMatch[1].replace(/&amp;/g, '&') : ''

		const authorIdMatch = html.match(/\/c\/user\/token\/([^"']+)/)
		const authorId = authorIdMatch ? authorIdMatch[1] : ''

		const likeMatch = desc.match(/收获了(\d+)个喜欢/)
		const diggCount = likeMatch ? parseInt(likeMatch[1], 10) : 0

		const pageUrl = ldData.url || finalUrl.split('?')[0]

		return {
			project: {
				project_id: itemId,
				title,
				desc: desc.replace(/-[\s\S]*$/, '').trim(),
				type: 'video',
				cover,
				url_list: [pageUrl],
				page_url: pageUrl,
				duration
			},
			author: {
				author_id: authorId,
				nickname,
				avatar
			},
			statistics: {
				digg_count: diggCount,
				comment_count: 0,
				share_count: 0,
				collect_count: 0,
				view_count: viewCount
			},
			platform: 'toutiao'
		}
	}

	parseDuration(durationStr) {
		const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
		if (!match) return 0
		const hours = parseInt(match[1] || 0, 10)
		const minutes = parseInt(match[2] || 0, 10)
		const seconds = parseInt(match[3] || 0, 10)
		return hours * 3600 + minutes * 60 + seconds
	}
}

module.exports = ToutiaoParser
