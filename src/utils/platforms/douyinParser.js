const axios = require('axios')

// 蜘蛛 User-Agent 用于绕过抖音 Web WAF 验证
const SPIDER_UA =
	'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'

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
		console.log('[DouyinParser] 开始解析链接:', shareUrl)

		// 1. 获取重定向后的真实链接
		let realUrl = shareUrl
		try {
			const shareResp = await axios.get(shareUrl, {
				headers: { 'User-Agent': SPIDER_UA },
				maxRedirects: 5
			})
			realUrl = shareResp.request?.res?.responseUrl || shareUrl
		} catch (redirectErr) {
			console.log('[DouyinParser] 获取重定向链接失败, 使用原链接:', redirectErr.message)
		}
		console.log('[DouyinParser] 重定向后的真实链接:', realUrl)

		// 2. 提取作品 ID (videoId / aweme_id)
		let videoId = null
		const idMatch = realUrl.match(/(?:video|note|slides|share\/video)\/(\d+)/)
		if (idMatch) {
			videoId = idMatch[1]
		} else {
			const paramMatch = realUrl.match(/(?:modal_id|aweme_id)=(\d+)/)
			if (paramMatch) {
				videoId = paramMatch[1]
			} else {
				const candidate = realUrl.split('?')[0].split('/').filter(Boolean).pop()
				if (/^\d+$/.test(candidate)) {
					videoId = candidate
				}
			}
		}

		if (!videoId) {
			console.error('[DouyinParser] 无法从 URL 中提取作品 ID:', realUrl)
			throw new Error(`无法提取抖音作品 ID: ${realUrl}`)
		}
		console.log('[DouyinParser] 成功提取作品 ID:', videoId)

		let data = null

		// 3. 优先请求 aweme/detail API (使用 Spider UA)
		const detailApiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`
		console.log('[DouyinParser] 尝试请求 detail API:', detailApiUrl)

		try {
			const apiResp = await axios.get(detailApiUrl, {
				headers: {
					'User-Agent': SPIDER_UA,
					Referer: 'https://www.douyin.com/'
				},
				timeout: 8000
			})
			console.log('[DouyinParser] detail API 响应状态:', apiResp.status)
			if (apiResp.data && apiResp.data.aweme_detail) {
				console.log('[DouyinParser] detail API 解析成功，获取到 aweme_detail 对象')
				data = apiResp.data.aweme_detail
			} else {
				console.log(
					'[DouyinParser] detail API 返回空或无 aweme_detail:',
					JSON.stringify(apiResp.data || {}).slice(0, 200)
				)
			}
		} catch (apiErr) {
			console.error('[DouyinParser] detail API 请求异常:', apiErr.message)
		}

		// 4. 降级方案：获取 iesdouyin HTML 页面提取 _ROUTER_DATA
		if (!data) {
			console.log('[DouyinParser] 触发降级方案: 请求 iesdouyin HTML 页面...')
			const finalUrl = `https://www.iesdouyin.com/share/video/${videoId}`
			console.log('[DouyinParser] 请求 HTML URL:', finalUrl)

			const resp = await axios.get(finalUrl, {
				headers: { 'User-Agent': SPIDER_UA },
				timeout: 8000
			})
			const html = resp.data || ''
			console.log('[DouyinParser] HTML 长度:', html.length)

			const regex = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s
			const match = regex.exec(html)
			if (!match) {
				console.error(
					'[DouyinParser] HTML 未能找到 window._ROUTER_DATA, 前 500 字符:',
					html.slice(0, 500)
				)
				throw new Error('解析 HTML 获取视频信息失败')
			}

			console.log('[DouyinParser] 成功提取到 window._ROUTER_DATA')
			const jsonData = JSON.parse(match[1].trim())
			const loaderData = jsonData.loaderData || {}
			console.log('[DouyinParser] loaderData keys:', Object.keys(loaderData))

			let originalInfo
			if (loaderData['video_(id)/page']) {
				originalInfo = loaderData['video_(id)/page'].videoInfoRes
			} else if (loaderData['note_(id)/page']) {
				originalInfo = loaderData['note_(id)/page'].videoInfoRes
			} else {
				// 尝试其他包含 videoInfoRes 的 key
				const pageKey = Object.keys(loaderData).find(
					(k) => loaderData[k] && loaderData[k].videoInfoRes
				)
				if (pageKey) {
					console.log(`[DouyinParser] 从 ${pageKey} 中匹配到 videoInfoRes`)
					originalInfo = loaderData[pageKey].videoInfoRes
				}
			}

			if (!originalInfo) {
				console.error(
					'[DouyinParser] originalInfo 为 undefined! loaderData 内容概览:',
					JSON.stringify(loaderData, null, 2).slice(0, 1000)
				)
				throw new Error('未能找到视频或图集数据')
			}

			if (!Array.isArray(originalInfo.item_list) || originalInfo.item_list.length === 0) {
				console.error(
					'[DouyinParser] originalInfo.item_list 为空或不存在! videoInfoRes keys:',
					Object.keys(originalInfo)
				)
				throw new Error('视频信息列表中无有效项 (item_list 缺失)')
			}

			data = originalInfo.item_list[0]
			console.log('[DouyinParser] 成功从 HTML routerData 中提取 item_list[0]')
		}

		delete data.cha_list
		delete data.risk_infos
		delete data.mix_info
		delete data.music

		console.log('[DouyinParser] 提取的原始作品字段 keys:', Object.keys(data))
		const aweme_type = data.aweme_type // 0/4: 视频, 2/68: 图文
		console.log('[DouyinParser] aweme_type:', aweme_type)

		const isImage =
			aweme_type === 2 ||
			aweme_type === 68 ||
			(Array.isArray(data.images) && data.images.length > 0)

		let videoUrl = ''
		let coverImg = []
		let allImg = []

		if (isImage) {
			// 图集 / 图文
			allImg = (data.images || [])
				.map((img) => {
					const url = (img.url_list && img.url_list[0]) || ''
					return url.replace('playwm', 'play')
				})
				.filter(Boolean)

			if (
				data.video &&
				data.video.cover &&
				data.video.cover.url_list &&
				data.video.cover.url_list[0]
			) {
				coverImg = [data.video.cover.url_list[0].replace('playwm', 'play')]
			} else if (allImg.length > 0) {
				coverImg = [allImg[0]]
			}
			console.log('[DouyinParser] 解析类型为图集, 图片数量:', allImg.length)
		} else {
			// 普通视频
			if (
				data.video &&
				data.video.play_addr &&
				data.video.play_addr.url_list &&
				data.video.play_addr.url_list[0]
			) {
				videoUrl = data.video.play_addr.url_list[0].replace('playwm', 'play')
			}
			if (
				data.video &&
				data.video.cover &&
				data.video.cover.url_list &&
				data.video.cover.url_list[0]
			) {
				coverImg = [data.video.cover.url_list[0].replace('playwm', 'play')]
			}
			console.log('[DouyinParser] 解析类型为视频, videoUrl 状态:', !!videoUrl)
		}

		let desc = data.desc || `douyin_${videoId}`
		desc = desc.replace(/[\\/:*?"<>|]/g, '_')

		const authorObj = data.author || {}
		const authorId = authorObj.short_id || authorObj.unique_id || authorObj.uid || ''
		const nickname = authorObj.nickname || '未知用户'

		let avatar = ''
		if (
			authorObj.avatar_thumb &&
			authorObj.avatar_thumb.url_list &&
			authorObj.avatar_thumb.url_list[0]
		) {
			avatar = authorObj.avatar_thumb.url_list[0].replace(
				/\/aweme\/\d+x\d+\//,
				'/aweme/720x720/'
			)
		}

		const stats = data.statistics || {}

		const parsedResult = {
			// 作品信息
			project: {
				project_id: data.aweme_id || videoId,
				title: desc,
				desc: '',
				type: isImage ? 'image' : 'video',
				cover: coverImg[0] || '',
				url_list: isImage ? allImg : videoUrl ? [videoUrl] : []
			},
			// 作者信息
			author: {
				author_id: authorId,
				nickname: nickname,
				avatar: avatar
			},
			// 统计信息
			statistics: {
				digg_count: stats.digg_count || 0,
				comment_count: stats.comment_count || 0,
				share_count: stats.share_count || 0,
				collect_count: stats.collect_count || 0
			},
			platform: 'douyin'
		}

		console.log('[DouyinParser] 解析完成:', parsedResult.project.title)
		return parsedResult
	}
}

module.exports = DouyinParser
