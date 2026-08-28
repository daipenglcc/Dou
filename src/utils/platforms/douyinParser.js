const axios = require('axios')

// 蜘蛛 User-Agent 用于绕过抖音 Web WAF 验证
const SPIDER_UA =
	'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
const MOBILE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'

// 默认请求 Cookie 提升在线服务器云 IP 穿透成功率
const DEFAULT_COOKIE = 's_v_web_id=verify_la123; msToken=123456'

/**
 * 抖音平台解析器
 */
class DouyinParser {
	/**
	 * 解析抖音分享链接 (支持视频与图文/图集作品)
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

		// 2. 提取作品 ID 并初始化作品类型标识
		let isNoteUrl = realUrl.includes('/note/')
		let videoId = null
		const idMatch = realUrl.match(/(?:video|note|slides|share\/video|share\/note)\/(\d+)/)
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
		console.log(
			`[DouyinParser] 成功提取作品 ID: ${videoId}, 初始类型标识: ${
				isNoteUrl ? 'note(图文)' : 'video(视频)'
			}`
		)

		let data = null

		// 3. 策略 A: 请求 aweme/detail API (带 aid=6383 & device_platform=webapp)
		const detailApiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=6383&device_platform=webapp`
		console.log('[DouyinParser] 尝试策略 A: 请求 detail API:', detailApiUrl)

		try {
			const apiResp = await axios.get(detailApiUrl, {
				headers: {
					'User-Agent': SPIDER_UA,
					Referer: 'https://www.douyin.com/',
					Cookie: `${DEFAULT_COOKIE}; tt_webid=${videoId}`
				},
				timeout: 8000
			})
			if (apiResp.data && apiResp.data.aweme_detail) {
				console.log('[DouyinParser] 策略 A 成功获取到 aweme_detail 对象')
				data = apiResp.data.aweme_detail
			} else {
				const filterReason = apiResp.data?.filter_detail?.filter_reason || ''
				console.log(
					`[DouyinParser] 策略 A API 未直接返回 aweme_detail, filter_reason: "${filterReason}"`
				)
				if (filterReason === 'images_base') {
					console.log(
						'[DouyinParser] 识别到 filter_reason="images_base"，确认该作品为图文作品!'
					)
					isNoteUrl = true
				}
			}
		} catch (apiErr) {
			console.error('[DouyinParser] 策略 A 请求异常:', apiErr.message)
		}

		// 4. 策略 B: 尝试请求 iesdouyin 的 H5 Share 页面 (Mobile UA) 提取 _ROUTER_DATA
		if (!data) {
			const pathsToTry = isNoteUrl ? ['note', 'video'] : ['video', 'note']
			for (const pathType of pathsToTry) {
				const shareHtmlUrl = `https://www.iesdouyin.com/share/${pathType}/${videoId}`
				console.log(`[DouyinParser] 尝试策略 B (${pathType} 路径: ${shareHtmlUrl})...`)

				try {
					const resp = await axios.get(shareHtmlUrl, {
						headers: {
							'User-Agent': MOBILE_UA,
							Cookie: `${DEFAULT_COOKIE}; tt_webid=${videoId}`
						},
						timeout: 8000
					})
					const html = resp.data || ''
					const regex = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s
					const match = regex.exec(html)

					if (match) {
						const jsonData = JSON.parse(match[1].trim())
						const loaderData = jsonData.loaderData || {}
						console.log(
							`[DouyinParser] 策略 B (${pathType}) loaderData keys:`,
							Object.keys(loaderData)
						)

						let originalInfo
						if (loaderData['note_(id)/page']) {
							originalInfo = loaderData['note_(id)/page'].videoInfoRes
						} else if (loaderData['video_(id)/page']) {
							originalInfo = loaderData['video_(id)/page'].videoInfoRes
						} else {
							const pageKey = Object.keys(loaderData).find(
								(k) => loaderData[k] && loaderData[k].videoInfoRes
							)
							if (pageKey) originalInfo = loaderData[pageKey].videoInfoRes
						}

						if (
							originalInfo &&
							Array.isArray(originalInfo.item_list) &&
							originalInfo.item_list.length > 0
						) {
							data = originalInfo.item_list[0]
							console.log(
								`[DouyinParser] 策略 B (${pathType}) 成功提取到 item_list[0]`
							)
							break
						}
					}
				} catch (bErr) {
					console.log(`[DouyinParser] 策略 B (${pathType}) 提取失败:`, bErr.message)
				}
			}
		}

		// 5. 策略 C: 尝试请求 douyin.com Web 页面 (Spider UA) 提取 application/ld+json (Schema.org 结构数据)
		if (!data) {
			const pathsToTry = isNoteUrl ? ['note', 'video'] : ['note', 'video']
			for (const pathType of pathsToTry) {
				const webUrl = `https://www.douyin.com/${pathType}/${videoId}`
				console.log(`[DouyinParser] 尝试策略 C (${pathType} 路径: ${webUrl})...`)

				try {
					const resp = await axios.get(webUrl, {
						headers: {
							'User-Agent': SPIDER_UA,
							Referer: 'https://www.douyin.com/',
							Cookie: `${DEFAULT_COOKIE}; tt_webid=${videoId}`
						},
						timeout: 8000
					})
					const html = resp.data || ''
					const jsonLdMatch = html.match(
						/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
					)

					if (jsonLdMatch) {
						for (const m of jsonLdMatch) {
							const content = m
								.replace(/<script[^>]*>/, '')
								.replace(/<\/script>/, '')
								.trim()
							try {
								const ldObj = JSON.parse(content)
								if (ldObj['@type'] === 'article' || ldObj.image || ldObj.headline) {
									console.log(
										`[DouyinParser] 策略 C (${pathType}) 成功匹配到 schema.org JSON-LD 数据`
									)

									const images = (
										Array.isArray(ldObj.image) ? ldObj.image : [ldObj.image]
									).filter(Boolean)
									const authorObj = ldObj.author || {}

									let diggCount = 0
									let collectCount = 0
									let shareCount = 0
									let commentCount = 0

									if (Array.isArray(ldObj.interactionStatistic)) {
										ldObj.interactionStatistic.forEach((item) => {
											const type = item.interactionType?.['@type'] || ''
											const count = item.userInteractionCount || 0
											if (type.includes('Like')) diggCount = count
											else if (
												type.includes('Share') ||
												type.includes('Repost')
											)
												shareCount = count
										})
									}
									if (ldObj.collectCount) collectCount = ldObj.collectCount
									if (ldObj.commentCount) commentCount = ldObj.commentCount

									let authorId = ''
									if (authorObj.url) {
										authorId = authorObj.url.split('/').pop()
									}

									let title =
										ldObj.headline || ldObj.description || `douyin_${videoId}`
									title = title.replace(/[\\/:*?"<>|]/g, '_')

									const resultObj = {
										project: {
											project_id: videoId,
											title: title,
											desc: '',
											type:
												isNoteUrl || images.length > 0 ? 'image' : 'video',
											cover: images[0] || '',
											url_list: images
										},
										author: {
											author_id: authorId,
											nickname: authorObj.name || '未知用户',
											avatar: authorObj.image || ''
										},
										statistics: {
											digg_count: diggCount,
											comment_count: commentCount,
											share_count: shareCount,
											collect_count: collectCount
										},
										platform: 'douyin'
									}

									console.log(
										`[DouyinParser] 策略 C (${pathType}) 解析完成:`,
										resultObj.project.title
									)
									return resultObj
								}
							} catch (e) {
								// 忽略单个 JSON 解析异常
							}
						}
					}
				} catch (cErr) {
					console.log(`[DouyinParser] 策略 C (${pathType}) 提取失败:`, cErr.message)
				}
			}
		}

		if (!data) {
			console.error(`[DouyinParser] 所有策略均未获取到有效数据 (videoId: ${videoId})`)
			throw new Error(`未能找到抖音作品数据 (videoId: ${videoId})`)
		}

		// 格式化处理策略 A/B 得到的标准原始对象
		delete data.cha_list
		delete data.risk_infos
		delete data.mix_info
		delete data.music

		console.log('[DouyinParser] 提取的原始作品字段 keys:', Object.keys(data))
		const aweme_type = data.aweme_type
		console.log('[DouyinParser] aweme_type:', aweme_type)

		const isImage =
			isNoteUrl ||
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
