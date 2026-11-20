const axios = require('axios')
const { getRandomUA } = require('../userAgents')

const MOBILE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'

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
				headers: {
					...getRandomUA(),
					'User-Agent': MOBILE_UA
				},
				maxRedirects: 5,
				timeout: 10000
			})
			finalUrl =
				shareResp.request.res.responseUrl ||
				shareResp.request.protocol + '//' + shareResp.request.host + shareResp.request.path
		} catch (e) {
			console.error('[ToutiaoParser] 重定向解析失败:', e.message)
		}
		console.log('[ToutiaoParser] 最终链接:', finalUrl)

		const idMatch =
			finalUrl.match(/\/video\/(\d+)/) ||
			finalUrl.match(/\/a(\d+)\//) ||
			finalUrl.match(/\/i(\d+)\//) ||
			finalUrl.match(/[?&](?:group_id|item_id)=(\d+)/)
		if (!idMatch) {
			throw new Error('无法从链接中提取视频ID')
		}
		const itemId = idMatch[1]
		console.log('[ToutiaoParser] 提取到的 Item ID:', itemId)

		// 1. 请求 m.toutiao.com/i{itemId}/info/v2/ 获取完整视频元数据及点播播放凭证
		const infoUrl = `https://m.toutiao.com/i${itemId}/info/v2/`
		const infoResp = await axios.get(infoUrl, {
			headers: {
				'User-Agent': MOBILE_UA,
				Referer: `https://m.toutiao.com/video/${itemId}/`
			},
			timeout: 10000
		})

		const info = infoResp.data?.data
		if (!info) {
			throw new Error('无法获取今日头条内容数据')
		}

		if (!info.video_id && !info.play_auth_token_v2 && !info.play_url_list?.length) {
			const err = new Error('暂不支持解析文章类型内容，仅支持视频')
			err.isUserFacing = true
			throw err
		}

		// 2. 提取真实视频流地址
		let videoUrl = ''
		if (info.play_auth_token_v2) {
			videoUrl = await this.fetchVodPlayUrl(info.play_auth_token_v2)
		}
		if (!videoUrl && Array.isArray(info.play_url_list) && info.play_url_list.length > 0) {
			videoUrl = info.play_url_list[0].main_url || info.play_url_list[0].backup_url || ''
		}

		if (!videoUrl) {
			throw new Error('未能提取到今日头条视频播放地址')
		}

		const title = (info.title || `toutiao_${itemId}`)
			.replace(/ - 今日头条$/, '')
			.replace(/[\\/:*?"<>|]/g, '_')
			.trim()

		const mediaUser = info.media_user || {}
		const pageUrl = info.url || `https://www.toutiao.com/video/${itemId}/`

		return {
			project: {
				project_id: itemId,
				title,
				desc: info.title || '',
				type: 'video',
				cover: info.poster_url || '',
				url_list: [videoUrl],
				page_url: pageUrl,
				duration: info.video_duration || 0
			},
			author: {
				author_id: mediaUser.id ? String(mediaUser.id) : String(info.creator_uid || ''),
				nickname: mediaUser.screen_name || info.source || '未知用户',
				avatar: mediaUser.avatar_url || ''
			},
			statistics: {
				digg_count: parseInt(info.digg_count, 10) || 0,
				comment_count: parseInt(info.comment_count, 10) || 0,
				share_count: parseInt(info.repost_count, 10) || 0,
				collect_count: parseInt(info.repin_count, 10) || 0,
				view_count: parseInt(info.video_play_count || info.impression_count, 10) || 0
			},
			platform: 'toutiao'
		}
	}

	/**
	 * 通过 play_auth_token_v2 请求火山引擎点播接口获取真实 MP4 播放直链
	 * @param {string} playAuthTokenV2 - Base64 编码的播放凭证
	 * @returns {Promise<string>} 视频播放地址
	 */
	async fetchVodPlayUrl(playAuthTokenV2) {
		try {
			const decoded = Buffer.from(playAuthTokenV2, 'base64').toString('utf8')
			const tokenObj = JSON.parse(decoded)
			const queryStr = tokenObj.GetPlayInfoToken
			if (!queryStr) return ''

			const vodResp = await axios.get(`https://vod.bytedanceapi.com/?${queryStr}`, {
				headers: {
					'User-Agent': MOBILE_UA
				},
				timeout: 10000
			})

			const playList = vodResp.data?.Result?.Data?.PlayInfoList || []
			if (!Array.isArray(playList) || playList.length === 0) return ''

			// 优先筛选 mp4 且 h264 编码，按清晰度/码率降序取最高清流
			const mp4List = playList.filter((item) => item.Format === 'mp4' && item.MainPlayUrl)
			const h264List = mp4List.filter((item) => (item.Codec || '').toLowerCase() === 'h264')
			const candidates =
				h264List.length > 0 ? h264List : mp4List.length > 0 ? mp4List : playList

			candidates.sort((a, b) => (b.Bitrate || 0) - (a.Bitrate || 0))
			const best = candidates[0]
			return best?.MainPlayUrl || best?.BackupPlayUrl || ''
		} catch (e) {
			console.error('[ToutiaoParser] 获取 VOD 播放地址失败:', e.message)
			return ''
		}
	}
}

module.exports = ToutiaoParser
