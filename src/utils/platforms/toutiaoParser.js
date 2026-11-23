const axios = require('axios')
const { resolveRedirectUrl } = require('../resolveRedirect')
const DouyinParser = require('./douyinParser')

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
		if (
			!/\/video\/\d+/.test(shareUrl) &&
			!/\/a\d+\//.test(shareUrl) &&
			!/\/i\d+\//.test(shareUrl) &&
			!/[?&](?:group_id|item_id)=\d+/.test(shareUrl)
		) {
			finalUrl = await resolveRedirectUrl(shareUrl, { 'User-Agent': MOBILE_UA })
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

		const isFromAweme = /from_aweme=1|aweme_sdk_share/i.test(finalUrl)

		// 1. 若非抖音同步小视频，优先请求 m.toutiao.com/i{itemId}/info/v2/ 获取完整视频元数据
		let info = null
		if (!isFromAweme) {
			const infoUrl = `https://m.toutiao.com/i${itemId}/info/v2/`
			const infoResp = await axios.get(infoUrl, {
				headers: {
					'User-Agent': MOBILE_UA,
					Referer: `https://m.toutiao.com/video/${itemId}/`
				},
				timeout: 10000
			})
			info = infoResp.data?.data || null
		}

		// 2. 兜底：抖音同步到今日头条的小视频（from_aweme=1 或 info/v2 返回空）自动走抖音 slidesinfo 接口
		if (!info) {
			try {
				const douyinParser = new DouyinParser()
				const awemeRes = await douyinParser.parseUrl(
					`https://www.iesdouyin.com/share/video/${itemId}/`
				)
				if (awemeRes && awemeRes.project?.url_list?.length > 0) {
					return { ...awemeRes, platform: 'toutiao' }
				}
			} catch (awemeErr) {
				console.warn('[ToutiaoParser] 抖音同步源兜底失败:', awemeErr.message)
			}
			throw new Error('无法获取今日头条内容数据')
		}

		if (!info.video_id && !info.play_auth_token_v2 && !info.play_url_list?.length) {
			const err = new Error('暂不支持解析文章类型内容，仅支持视频')
			err.isUserFacing = true
			throw err
		}

		// 2. 提取真实视频流地址及文件大小
		let videoUrl = ''
		let videoSize = null
		if (info.play_auth_token_v2) {
			const vodInfo = await this.fetchVodPlayUrl(info.play_auth_token_v2)
			videoUrl = vodInfo.url
			videoSize = vodInfo.size
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
				...(videoSize ? { size_list: [videoSize] } : {}),
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
	 * 通过 play_auth_token_v2 请求火山引擎点播接口获取真实 MP4 播放直链与文件大小
	 * @param {string} playAuthTokenV2 - Base64 编码的播放凭证
	 * @returns {Promise<{url: string, size: number|null}>} 视频播放地址与大小
	 */
	async fetchVodPlayUrl(playAuthTokenV2) {
		try {
			const decoded = Buffer.from(playAuthTokenV2, 'base64').toString('utf8')
			const tokenObj = JSON.parse(decoded)
			const queryStr = tokenObj.GetPlayInfoToken
			if (!queryStr) return { url: '', size: null }

			const vodResp = await axios.get(`https://vod.bytedanceapi.com/?${queryStr}`, {
				headers: {
					'User-Agent': MOBILE_UA
				},
				timeout: 10000
			})

			const playList = vodResp.data?.Result?.Data?.PlayInfoList || []
			if (!Array.isArray(playList) || playList.length === 0) return { url: '', size: null }

			// 优先筛选 mp4 且 h264 编码，按清晰度/码率降序取最高清流
			const mp4List = playList.filter((item) => item.Format === 'mp4' && item.MainPlayUrl)
			const h264List = mp4List.filter((item) => (item.Codec || '').toLowerCase() === 'h264')
			const candidates =
				h264List.length > 0 ? h264List : mp4List.length > 0 ? mp4List : playList

			candidates.sort((a, b) => (b.Bitrate || 0) - (a.Bitrate || 0))
			const best = candidates[0]
			return {
				url: best?.MainPlayUrl || best?.BackupPlayUrl || '',
				size: best?.Size ? parseInt(best.Size, 10) : null
			}
		} catch (e) {
			console.error('[ToutiaoParser] 获取 VOD 播放地址失败:', e.message)
			return { url: '', size: null }
		}
	}
}

module.exports = ToutiaoParser
