/**
 * Cloudflare Worker — 多平台高速解析 + 零缓冲流式下载统一服务（方案 A）
 *
 * 路由：
 *   GET  /health               健康检查
 *   GET  /api/examples         获取各平台示例链接
 *   POST /api/parse            解析分享链接（抖音/快手/头条/B站直解，风控自动回源主站）
 *   GET  /api/proxyFile        流式代理下载（支持 Range 分片、白名单防刷、无 6MB 限制）
 *   GET  /api/download-stream  流式下载视频（带自定义文件名）
 */

const FALLBACK_ORIGIN = 'https://douyin.vues.cn'

const MOBILE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
const DESKTOP_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const BAIDUSPIDER_UA =
	'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
const BINGBOT_UA = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'

// 允许代理的官方媒体 CDN 域名白名单（防滥用刷流量）
const ALLOWED_HOST_SUFFIXES = [
	'douyinpic.com',
	'douyinvod.com',
	'douyin.com',
	'iesdouyin.com',
	'365yg.com',
	'bytedance.com',
	'bytecdn.com',
	'bytetos.com',
	'snssdk.com',
	'amemv.com',
	'zjcdn.com',
	'toutiaoimg.com',
	'toutiaovod.com',
	'toutiaostatic.com',
	'toutiao.com',
	'ixigua.com',
	'xhscdn.com',
	'xiaohongshu.com',
	'yximgs.com',
	'kuaishou.com',
	'kwimgs.com',
	'kwaicdn.com',
	'chenzhongtech.com',
	'bilivideo.com',
	'bilivideo.cn',
	'hdslb.com',
	'bilibili.com',
	'akamaized.net',
	'szbdyd.com'
]

const EXAMPLE_LINKS = [
	{
		platform: 'douyin',
		platformName: '抖音',
		type: 'video',
		label: '抖音视频示例',
		text: '0.05 复制打开抖音，看看【逐花归海.的作品】“我对流星许愿,希望你永远快乐·” ᴵ ʷⁱˢʰ ... https://v.douyin.com/ab9ZPlJQMuo/ e@O.xs :8pm uSL:/ 11/07 '
	},
	{
		platform: 'douyin',
		platformName: '抖音',
		type: 'image',
		label: '抖音图片示例',
		text: '6.15 复制打开抖音，看看【雪加鸭嘴兽大板砖积木的图文作品】值得长期不换的壁纸# 蓝猫图库 # 手机墙纸 # ... https://v.douyin.com/g5-Y27aXErc/ 01/15 kca:/ B@G.iP :8pm '
	},
	{
		platform: 'xiaohongshu',
		platformName: '小红书',
		type: 'video',
		label: '小红书视频示例',
		text: '不结婚以后老了谁照顾你？ https://xhslink.cn/o/3kg7wxaSFW7 先复制一下，打开【小红书】看看这篇好文！'
	},
	{
		platform: 'xiaohongshu',
		platformName: '小红书',
		type: 'image',
		label: '小红书图片示例',
		text: '“ios27 https://xhslink.cn/o/1biSEj1qpIB 复制后直接打开【小红书】，笔记就在那里等你。'
	},
	{
		platform: 'kuaishou',
		platformName: '快手',
		type: 'video',
		label: '快手视频示例',
		text: 'https://v.kuaishou.com/KpIapZUP 《叮咚》前奏一响全场沸腾，哪怕突发小意外也挡不住这姐的千禧年活力！"徐怀钰1128绍兴诸暨演唱会 "徐怀钰绍兴演唱会 "叮咚 该作品在快手被播放过379万次，点击链接，打开【快手】直接观看！'
	},
	{
		platform: 'kuaishou',
		platformName: '快手',
		type: 'image',
		label: '快手图片示例',
		text: 'https://v.kuaishou.com/J9dNWUsH 人与人之间的缘，像一盏忽明忽暗的灯 "氛围感女头 "遗憾头像女 "好景不常在 "久久爱意PK赛 该作品在快手被播放过15万次，点击链接，打开【快手】直接观看！'
	},
	{
		platform: 'bilibili',
		platformName: '哔哩哔哩',
		type: 'video',
		label: '哔哩哔哩视频示例',
		text: '【宅女在家大肆燃烧卡路里🔥-哔哩哔哩】 https://b23.tv/uXDA7WY'
	},
	{
		platform: 'toutiao',
		platformName: '今日头条',
		type: 'video',
		label: '今日头条视频示例',
		text: '【我感觉他说得好像没问题，但又总觉得哪里不太对……】点击链接打开👉 https://m.toutiao.com/is/NcSYy5s7pEI/'
	}
]

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
	'Access-Control-Allow-Headers': 'Range, Content-Type'
}

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			...CORS_HEADERS
		}
	})
}

function isAllowedHost(hostname) {
	const h = (hostname || '').toLowerCase()
	return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s))
}

async function resolveRedirect(url, ua = MOBILE_UA, maxHops = 3) {
	let cur = url
	for (let i = 0; i < maxHops; i++) {
		const r = await fetch(cur, { headers: { 'User-Agent': ua }, redirect: 'manual' })
		const loc = r.headers.get('location')
		if (r.status >= 300 && r.status < 400 && loc) {
			cur = new URL(loc, cur).toString()
		} else {
			break
		}
	}
	return cur
}

function detectPlatform(url) {
	const d = url.toLowerCase()
	if (d.includes('douyin.com') || d.includes('v.douyin.com')) return 'douyin'
	if (d.includes('kuaishou.com') || d.includes('v.kuaishou.com')) return 'kuaishou'
	if (d.includes('xiaohongshu.com') || d.includes('xhslink.')) return 'xiaohongshu'
	if (d.includes('bilibili.com') || d.includes('b23.tv')) return 'bilibili'
	if (d.includes('toutiao.com') || d.includes('toutiao')) return 'toutiao'
	return 'unknown'
}

function wrapUrlsWithProxy(data, base) {
	if (!data || typeof data !== 'object') return
	if (Array.isArray(data)) {
		data.forEach((item) => wrapUrlsWithProxy(item, base))
		return
	}
	for (const key of Object.keys(data)) {
		if (key === 'url_list' && Array.isArray(data[key])) {
			data[key] = data[key].map((u) => (u ? `${base}${encodeURIComponent(u)}` : u))
		} else if (key === 'cover' && typeof data[key] === 'string' && data[key]) {
			data[key] = `${base}${encodeURIComponent(data[key])}`
		} else if (typeof data[key] === 'object') {
			wrapUrlsWithProxy(data[key], base)
		}
	}
}

// ── 抖音解析 ─────────────────────────────────────────────
async function tryDouyinJsonLd(videoId, paths = ['note']) {
	const uas = [GOOGLEBOT_UA, BAIDUSPIDER_UA, BINGBOT_UA]
	for (const pathType of paths) {
		const webUrl = `https://www.douyin.com/${pathType}/${videoId}`
		for (const ua of uas) {
			try {
				const resp = await fetch(webUrl, {
					headers: { 'User-Agent': ua, Referer: 'https://www.douyin.com/' }
				})
				const html = await resp.text()
				const matches = html.match(
					/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
				)
				if (!matches) continue
				for (const m of matches) {
					const content = m
						.replace(/<script[^>]*>/, '')
						.replace(/<\/script>/, '')
						.trim()
					try {
						const ldObj = JSON.parse(content)
						if (ldObj['@type'] === 'article' || ldObj.image || ldObj.headline) {
							const images = (
								Array.isArray(ldObj.image) ? ldObj.image : [ldObj.image]
							).filter(Boolean)
							if (images.length === 0) continue

							const authorObj = ldObj.author || {}
							let diggCount = 0
							let shareCount = 0
							if (Array.isArray(ldObj.interactionStatistic)) {
								ldObj.interactionStatistic.forEach((item) => {
									const type = item.interactionType?.['@type'] || ''
									const count = item.userInteractionCount || 0
									if (type.includes('Like')) diggCount = count
									else if (type.includes('Share') || type.includes('Repost'))
										shareCount = count
								})
							}
							const title = (
								ldObj.headline ||
								ldObj.description ||
								`douyin_${videoId}`
							).replace(/[\\/:*?"<>|]/g, '_')
							return {
								project: {
									project_id: videoId,
									title,
									desc: '',
									type: 'image',
									cover: images[0] || '',
									url_list: images,
									size_list: new Array(images.length).fill(null)
								},
								author: {
									author_id: authorObj.url ? authorObj.url.split('/').pop() : '',
									nickname: authorObj.name || '未知用户',
									avatar: authorObj.image || ''
								},
								statistics: {
									digg_count: diggCount,
									comment_count: ldObj.commentCount || 0,
									share_count: shareCount,
									collect_count: ldObj.collectCount || 0
								},
								platform: 'douyin'
							}
						}
					} catch {
						// 忽略单条无效 JSON-LD
					}
				}
			} catch {
				// 当前 UA 失败，切换下一个蜘蛛 UA
			}
		}
	}
	return null
}

async function parseDouyin(shareUrl) {
	let realUrl = shareUrl
	if (
		!/(?:video|note|slides|share\/video|share\/note)\/\d+/.test(shareUrl) &&
		!/(?:modal_id|aweme_id)=\d+/.test(shareUrl)
	) {
		realUrl = await resolveRedirect(shareUrl, MOBILE_UA)
	}
	const isNoteUrl = realUrl.includes('/note/')
	const videoId =
		realUrl.match(/(?:video|note|slides|share\/video|share\/note)\/(\d+)/)?.[1] ||
		realUrl.match(/(?:modal_id|aweme_id)=(\d+)/)?.[1]
	if (!videoId) throw new Error('无法提取抖音作品 ID')

	if (isNoteUrl) {
		const noteRes = await tryDouyinJsonLd(videoId, ['note'])
		if (noteRes) return noteRes
	}

	const slidesResp = await fetch(
		`https://www.iesdouyin.com/web/api/v2/aweme/slidesinfo/?aweme_ids=%5B${videoId}%5D&request_source=1`,
		{
			headers: {
				'User-Agent': MOBILE_UA,
				Referer: `https://www.iesdouyin.com/share/video/${videoId}/`
			}
		}
	)
	const slidesJson = await slidesResp.json()
	const data = slidesJson?.aweme_details?.[0]
	if (!data) {
		if (!isNoteUrl) {
			const fallbackNote = await tryDouyinJsonLd(videoId, ['note', 'video'])
			if (fallbackNote) return fallbackNote
		}
		throw new Error(`未能找到抖音作品数据 (videoId: ${videoId})`)
	}

	const isImage =
		isNoteUrl ||
		data.aweme_type === 2 ||
		data.aweme_type === 68 ||
		(Array.isArray(data.images) && data.images.length > 0)

	let urlList = []
	let cover = ''
	let sizeList = []

	if (isImage) {
		urlList = (data.images || [])
			.map((img) => ((img.url_list && img.url_list[0]) || '').replace('playwm', 'play'))
			.filter(Boolean)
		cover = (data.video?.cover?.url_list?.[0] || urlList[0] || '').replace('playwm', 'play')
		sizeList = new Array(urlList.length).fill(null)
	} else {
		const rawVideo = data.video?.play_addr?.url_list?.[0]
		if (rawVideo) urlList = [rawVideo.replace('playwm', 'play')]
		cover = (data.video?.cover?.url_list?.[0] || '').replace('playwm', 'play')
		const sz = data.video?.play_addr?.data_size
			? parseInt(data.video.play_addr.data_size, 10)
			: null
		sizeList = [sz]
	}

	if (urlList.length === 0) throw new Error(`未能提取到抖音媒体资源地址 (videoId: ${videoId})`)

	const authorObj = data.author || {}
	const stats = data.statistics || {}
	const rawAvatar = authorObj.avatar_thumb?.url_list?.[0] || ''

	return {
		project: {
			project_id: data.aweme_id || videoId,
			title: (data.desc || `douyin_${videoId}`).replace(/[\\/:*?"<>|]/g, '_'),
			desc: '',
			type: isImage ? 'image' : 'video',
			cover,
			url_list: urlList,
			size_list: sizeList
		},
		author: {
			author_id: authorObj.short_id || authorObj.unique_id || authorObj.uid || '',
			nickname: authorObj.nickname || '未知用户',
			avatar: rawAvatar.replace(/\/aweme\/\d+x\d+\//, '/aweme/720x720/')
		},
		statistics: {
			digg_count: stats.digg_count || 0,
			comment_count: stats.comment_count || 0,
			share_count: stats.share_count || 0,
			collect_count: stats.collect_count || 0
		},
		platform: 'douyin'
	}
}

// ── 快手解析 ─────────────────────────────────────────────
function findKuaishouPhoto(obj, depth = 0) {
	if (depth > 20 || typeof obj !== 'object' || obj === null) return null
	if (!Array.isArray(obj) && obj.mainMvUrls && obj.caption !== undefined) return obj
	const values = Array.isArray(obj) ? obj : Object.values(obj)
	for (const v of values) {
		const res = findKuaishouPhoto(v, depth + 1)
		if (res) return res
	}
	return null
}

async function parseKuaishou(shareUrl) {
	const realUrl = shareUrl.includes('/fw/photo/')
		? shareUrl
		: await resolveRedirect(shareUrl, MOBILE_UA)
	const shortPhotoId = realUrl.match(/\/fw\/photo\/([a-zA-Z0-9]+)/)?.[1]
	if (!shortPhotoId) throw new Error('无法从链接中提取快手作品 ID')

	const resp = await fetch(realUrl, {
		headers: {
			'User-Agent': MOBILE_UA,
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'zh-CN,zh;q=0.9'
		}
	})
	const html = await resp.text()
	const stateStart = html.indexOf('window.INIT_STATE')
	if (stateStart === -1) throw new Error('无法从快手页面提取数据')
	const jsonStart = html.indexOf('{', stateStart)
	const scriptEnd = html.indexOf('</script>', stateStart)
	let jsonStr = html.slice(jsonStart, scriptEnd).trim()
	if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1)

	const photoData = findKuaishouPhoto(JSON.parse(jsonStr))
	if (!photoData) throw new Error('未找到快手作品数据')

	const caption = photoData.caption || ''
	const isVideo = !photoData.singlePicture && photoData.type === 1
	const cover = photoData.coverUrls?.[0]?.url || ''
	let urlList = []

	if (isVideo) {
		const vUrl = photoData.mainMvUrls?.[0]?.url
		if (vUrl) urlList = [vUrl]
	} else {
		const atlas = photoData.ext_params?.atlas
		if (atlas?.list?.length && atlas?.cdn?.length) {
			urlList = atlas.list.map((p, i) => `https://${atlas.cdn[i % atlas.cdn.length]}${p}`)
		} else if (cover) {
			urlList = [cover]
		}
	}

	return {
		project: {
			project_id: photoData.photoId ? String(photoData.photoId) : shortPhotoId,
			title: caption.replace(/[\\/:*?"<>|]/g, '_') || `kuaishou_${shortPhotoId}`,
			desc: caption,
			type: isVideo ? 'video' : 'image',
			cover,
			url_list: urlList,
			size_list: new Array(urlList.length).fill(null)
		},
		author: {
			author_id: photoData.userId ? String(photoData.userId) : '',
			nickname: photoData.userName || '未知用户',
			avatar: photoData.headUrls?.[0]?.url || photoData.headUrl || ''
		},
		statistics: {
			digg_count: photoData.likeCount || 0,
			comment_count: photoData.commentCount || 0,
			share_count: photoData.forwardCount || 0,
			collect_count: 0
		},
		platform: 'kuaishou'
	}
}

// ── 今日头条解析 ─────────────────────────────────────────
async function parseToutiao(shareUrl) {
	let finalUrl = shareUrl
	if (
		!/\/video\/\d+/.test(shareUrl) &&
		!/\/a\d+\//.test(shareUrl) &&
		!/\/i\d+\//.test(shareUrl) &&
		!/[?&](?:group_id|item_id)=\d+/.test(shareUrl)
	) {
		finalUrl = await resolveRedirect(shareUrl, MOBILE_UA)
	}
	const itemId =
		finalUrl.match(/\/video\/(\d+)/)?.[1] ||
		finalUrl.match(/\/a(\d+)\//)?.[1] ||
		finalUrl.match(/\/i(\d+)\//)?.[1] ||
		finalUrl.match(/[?&](?:group_id|item_id)=(\d+)/)?.[1]
	if (!itemId) throw new Error('无法从链接中提取今日头条视频 ID')

	const infoResp = await fetch(`https://m.toutiao.com/i${itemId}/info/v2/`, {
		headers: {
			'User-Agent': MOBILE_UA,
			Referer: `https://m.toutiao.com/video/${itemId}/`
		}
	})
	const info = (await infoResp.json())?.data
	if (!info) throw new Error('无法获取今日头条内容数据')
	if (!info.video_id && !info.play_auth_token_v2 && !info.play_url_list?.length) {
		const err = new Error('暂不支持解析文章类型内容，仅支持视频')
		err.isUserFacing = true
		throw err
	}

	let videoUrl = ''
	let videoSize = null
	if (info.play_auth_token_v2) {
		const tokenObj = JSON.parse(atob(info.play_auth_token_v2))
		if (tokenObj.GetPlayInfoToken) {
			const vodResp = await fetch(
				`https://vod.bytedanceapi.com/?${tokenObj.GetPlayInfoToken}`,
				{
					headers: { 'User-Agent': MOBILE_UA }
				}
			)
			const list = (await vodResp.json())?.Result?.Data?.PlayInfoList || []
			const mp4List = list.filter((i) => i.Format === 'mp4' && i.MainPlayUrl)
			const h264List = mp4List.filter((i) => (i.Codec || '').toLowerCase() === 'h264')
			const candidates = h264List.length ? h264List : mp4List.length ? mp4List : list
			candidates.sort((a, b) => (b.Bitrate || 0) - (a.Bitrate || 0))
			videoUrl = candidates[0]?.MainPlayUrl || candidates[0]?.BackupPlayUrl || ''
			videoSize = candidates[0]?.Size ? parseInt(candidates[0].Size, 10) : null
		}
	}
	if (!videoUrl && info.play_url_list?.length) {
		videoUrl = info.play_url_list[0].main_url || info.play_url_list[0].backup_url || ''
	}
	if (!videoUrl) throw new Error('未能提取到今日头条视频播放地址')

	const mediaUser = info.media_user || {}
	return {
		project: {
			project_id: itemId,
			title: (info.title || `toutiao_${itemId}`)
				.replace(/ - 今日头条$/, '')
				.replace(/[\\/:*?"<>|]/g, '_')
				.trim(),
			desc: info.title || '',
			type: 'video',
			cover: info.poster_url || '',
			url_list: [videoUrl],
			size_list: [videoSize],
			page_url: info.url || `https://www.toutiao.com/video/${itemId}/`,
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

// ── B站解析（优先走公开 JSON API 绕开 412） ──────────────
async function parseBilibili(shareUrl) {
	let finalUrl = shareUrl
	if (!/(?:\/video\/|[?&]bvid=|b23\.tv\/)(BV[a-zA-Z0-9]+)/.test(shareUrl)) {
		finalUrl = await resolveRedirect(shareUrl, DESKTOP_UA)
	}
	const bvid =
		finalUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] ||
		finalUrl.match(/b23\.tv\/(BV[a-zA-Z0-9]+)/)?.[1] ||
		finalUrl.match(/[?&]bvid=(BV[a-zA-Z0-9]+)/)?.[1]
	if (!bvid) throw new Error('无法提取 B 站 BV 号')

	const viewResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
		headers: { 'User-Agent': DESKTOP_UA, Referer: 'https://www.bilibili.com/' }
	})
	const viewJson = await viewResp.json()
	const viewInfo = viewJson?.data
	if (viewJson?.code !== 0 || !viewInfo) throw new Error(`B站 view 接口异常 (${viewResp.status})`)

	const aid = viewInfo.aid
	const cid = viewInfo.pages?.[0]?.cid || viewInfo.cid
	let videoUrls = []
	let videoSize = null

	for (const qn of [80, 64, 32, 16]) {
		const playResp = await fetch(
			`https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&qn=${qn}&fnval=0&fnver=0&platform=html5`,
			{ headers: { 'User-Agent': DESKTOP_UA, Referer: 'https://www.bilibili.com/' } }
		)
		const playJson = await playResp.json()
		if (playJson?.code === 0 && playJson?.data?.durl?.length) {
			videoUrls = playJson.data.durl.map((d) => d.url)
			videoSize = playJson.data.durl[0]?.size || null
			break
		}
	}
	if (videoUrls.length === 0) throw new Error('未获取到 B 站播放地址')

	const owner = viewInfo.owner || {}
	const stat = viewInfo.stat || {}
	return {
		project: {
			project_id: viewInfo.bvid,
			title: (viewInfo.title || `bilibili_${bvid}`).replace(/[\\/:*?"<>|]/g, '_'),
			desc: viewInfo.desc || '',
			type: 'video',
			cover: viewInfo.pic || '',
			url_list: videoUrls,
			size_list: [videoSize],
			aid,
			cid,
			duration: viewInfo.duration,
			page_count: viewInfo.videos || 1
		},
		author: {
			author_id: owner.mid ? String(owner.mid) : '',
			nickname: owner.name || '未知用户',
			avatar: owner.face || ''
		},
		statistics: {
			digg_count: stat.like || 0,
			comment_count: stat.reply || 0,
			share_count: stat.share || 0,
			collect_count: stat.favorite || 0
		},
		platform: 'bilibili'
	}
}

// ── 统一入口 ─────────────────────────────────────────────
export default {
	async fetch(request, env, ctx) {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS })
		}

		const reqUrl = new URL(request.url)
		const pathname = reqUrl.pathname

		// 1. 健康检查
		if (pathname === '/' || pathname === '/health') {
			return jsonResponse({
				success: true,
				service: 'dou-cf-worker',
				colo: request.cf?.colo || 'unknown',
				status: 'ok'
			})
		}

		// 2. 示例列表
		if (pathname === '/api/examples') {
			const platform = reqUrl.searchParams.get('platform')?.toLowerCase()
			const type = reqUrl.searchParams.get('type')?.toLowerCase()
			let list = EXAMPLE_LINKS
			if (platform) list = list.filter((i) => i.platform === platform)
			if (type) list = list.filter((i) => i.type === type)
			return jsonResponse({ success: true, data: list })
		}

		// 3. 解析接口
		if (pathname === '/api/parse' && request.method === 'POST') {
			let body = {}
			const ct = request.headers.get('content-type') || ''
			try {
				if (ct.includes('application/json')) {
					body = await request.json()
				} else if (ct.includes('application/x-www-form-urlencoded')) {
					const params = new URLSearchParams(await request.text())
					body = Object.fromEntries(params.entries())
				} else {
					body = await request.json()
				}
			} catch {
				// 请求体为空或非合法 JSON 时按空对象处理
			}

			const inputText = body.shareLink || body.shareText
			if (!inputText) {
				return jsonResponse(
					{ success: false, error: '请提供 shareLink 或 shareText 参数' },
					400
				)
			}

			const urls = String(inputText).match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+)/g)
			if (!urls || urls.length === 0) {
				return jsonResponse({ success: false, error: '未找到有效的分享链接' }, 400)
			}

			const shareUrl = urls[0]
			const platform = detectPlatform(shareUrl)
			const isDirect =
				String(body.direct) === '1' || String(reqUrl.searchParams.get('direct')) === '1'

			try {
				let videoInfo
				if (platform === 'douyin') videoInfo = await parseDouyin(shareUrl)
				else if (platform === 'kuaishou') videoInfo = await parseKuaishou(shareUrl)
				else if (platform === 'toutiao') videoInfo = await parseToutiao(shareUrl)
				else if (platform === 'bilibili') {
					try {
						videoInfo = await parseBilibili(shareUrl)
					} catch {
						// B 站遇风控自动回源主站兜底
						const fb = await fetch(`${FALLBACK_ORIGIN}/api/parse`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								shareText: inputText,
								openid: body.openid,
								direct: isDirect ? 1 : 0
							})
						})
						return new Response(fb.body, {
							status: fb.status,
							headers: {
								'Content-Type': 'application/json; charset=utf-8',
								...CORS_HEADERS
							}
						})
					}
				} else if (platform === 'xiaohongshu') {
					// 小红书自动回源主站兜底
					const fb = await fetch(`${FALLBACK_ORIGIN}/api/parse`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							shareText: inputText,
							openid: body.openid,
							direct: isDirect ? 1 : 0
						})
					})
					return new Response(fb.body, {
						status: fb.status,
						headers: {
							'Content-Type': 'application/json; charset=utf-8',
							...CORS_HEADERS
						}
					})
				} else {
					return jsonResponse(
						{ success: false, error: `暂不支持该平台: ${platform}` },
						400
					)
				}

				if (!isDirect) {
					wrapUrlsWithProxy(videoInfo, `${reqUrl.origin}/api/proxyFile?url=`)
				}

				// 异步上报解析记录到主站数据库（0ms 额外延迟，不阻塞返回）
				if (body.openid && ctx && typeof ctx.waitUntil === 'function') {
					ctx.waitUntil(
						fetch(`${FALLBACK_ORIGIN}/api/records`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								openid: body.openid,
								platform: videoInfo.platform || platform || 'unknown',
								media_type: videoInfo.project?.type || 'unknown',
								url: inputText,
								title: videoInfo.project?.title || videoInfo.project?.desc || ''
							})
						}).catch(() => {
							// 忽略记录上报失败，不影响主解析流程
						})
					)
				}

				return jsonResponse({
					success: true,
					data: videoInfo,
					message: '解析成功',
					timestamp: new Date().toISOString()
				})
			} catch (error) {
				const msg = error.isUserFacing
					? error.message
					: `抱歉，该平台近期风控比较严，暂时没法解析啦，建议先试试其他平台~`
				return jsonResponse(
					{
						success: false,
						error: msg,
						timestamp: new Date().toISOString()
					},
					400
				)
			}
		}

		// 4. 高速流式下载代理
		if (pathname === '/api/proxyFile' || pathname === '/api/download-stream') {
			const target = reqUrl.searchParams.get('url')
			if (!target) return jsonResponse({ success: false, error: '请提供 url 参数' }, 400)

			let targetUrl
			try {
				targetUrl = new URL(target)
			} catch {
				return jsonResponse({ success: false, error: '无效的 url 参数' }, 400)
			}

			if (!isAllowedHost(targetUrl.hostname)) {
				return jsonResponse(
					{ success: false, error: `不支持代理该域名: ${targetUrl.hostname}` },
					403
				)
			}

			const headers = new Headers({ 'User-Agent': DESKTOP_UA })
			const range = request.headers.get('Range')
			if (range && pathname === '/api/proxyFile') headers.set('Range', range)
			if (/bilivideo\.|hdslb\.com|akamaized\.net/i.test(targetUrl.hostname)) {
				headers.set('Referer', 'https://www.bilibili.com/')
			}

			const upstream = await fetch(targetUrl.toString(), { headers, redirect: 'follow' })
			if (!upstream.ok && upstream.status !== 206) {
				return jsonResponse(
					{ success: false, error: `远程资源不可访问 (HTTP ${upstream.status})` },
					400
				)
			}

			const respHeaders = new Headers(upstream.headers)
			respHeaders.set('Access-Control-Allow-Origin', '*')
			respHeaders.set('Accept-Ranges', 'bytes')

			if (pathname === '/api/download-stream') {
				const title = reqUrl.searchParams.get('title') || 'video'
				respHeaders.set('Content-Type', 'application/octet-stream')
				respHeaders.set(
					'Content-Disposition',
					`attachment; filename="${encodeURIComponent(title)}.mp4"`
				)
			}

			return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
		}

		return jsonResponse({ success: false, error: 'Not Found' }, 404)
	}
}
