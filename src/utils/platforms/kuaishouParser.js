const axios = require('axios')
const { getRandomUA } = require('../userAgents')

/**
 * 快手平台解析器
 */
class KuaishouParser {
	/**
	 * 解析快手分享链接
	 * @param {string} shareUrl - 快手分享链接
	 * @returns {Object} 快手视频/图集信息
	 */
	async parseUrl(shareUrl) {
		console.log('开始解析快手链接:', shareUrl)

		// 第一步：跟随重定向，获取真实页面链接
		const shareResp = await axios.get(shareUrl, {
			headers: getRandomUA(),
			maxRedirects: 5,
			timeout: 10000
		})
		const realUrl = shareResp.request.res.responseUrl
		console.log('重定向后的真实链接:', realUrl)

		// 第二步：从重定向 URL 的查询参数中提取 photoId
		const photoIdMatch = realUrl.match(/\/fw\/photo\/([a-zA-Z0-9]+)/)
		if (!photoIdMatch) {
			throw new Error('无法从链接中提取作品ID')
		}
		const shortPhotoId = photoIdMatch[1]
		console.log('提取到的作品ID:', shortPhotoId)

		// 第三步：获取页面内容
		const pageResp = await axios.get(realUrl, {
			headers: {
				'User-Agent': getRandomUA(),
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2'
			},
			timeout: 15000
		})

		const html = pageResp.data

		// 第四步：提取 window.INIT_STATE 数据
		const stateStart = html.indexOf('window.INIT_STATE')
		if (stateStart === -1) {
			throw new Error('无法从页面中提取数据')
		}

		const jsonStart = html.indexOf('{', stateStart)
		const scriptEnd = html.indexOf('</script>', stateStart)
		if (jsonStart === -1 || scriptEnd === -1) {
			throw new Error('无法定位页面数据边界')
		}

		let jsonStr = html.slice(jsonStart, scriptEnd).trim()
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

		// 第六步：递归搜索包含 mainMvUrls 的 photo 对象
		const photoData = this.findPhotoData(jsonData)
		if (!photoData) {
			throw new Error('未找到作品数据')
		}

		console.log('获取到作品数据, caption:', photoData.caption)

		// 第七步：解析为统一格式
		return this.parsePhotoData(photoData, shortPhotoId)
	}

	/**
	 * 递归搜索包含 mainMvUrls 的 photo 数据对象
	 */
	findPhotoData(obj, depth = 0) {
		if (depth > 20 || typeof obj !== 'object' || obj === null) return null

		if (!Array.isArray(obj) && obj.mainMvUrls && obj.caption !== undefined) {
			return obj
		}

		if (Array.isArray(obj)) {
			for (const item of obj) {
				const result = this.findPhotoData(item, depth + 1)
				if (result) return result
			}
		} else {
			for (const key of Object.keys(obj)) {
				const result = this.findPhotoData(obj[key], depth + 1)
				if (result) return result
			}
		}

		return null
	}

	/**
	 * 解析快手作品数据为统一格式
	 */
	parsePhotoData(photoData, shortPhotoId) {
		const caption = photoData.caption || ''
		const cleanTitle = caption.replace(/[\\/:*?"<>|]/g, '_') || `kuaishou_${shortPhotoId}`

		// 内容类型判断：singlePicture=false 且 type=1 为视频，否则是图集/单图
		const isVideo = !photoData.singlePicture && photoData.type === 1

		// 取第一条视频地址
		let videoUrl = null
		if (isVideo && photoData.mainMvUrls && photoData.mainMvUrls.length > 0) {
			videoUrl = photoData.mainMvUrls[0].url
		}

		// 封面图
		let coverImg = ''
		if (photoData.coverUrls && photoData.coverUrls.length > 0) {
			coverImg = photoData.coverUrls[0].url
		}

		// 图片列表（图集/单图）
		let imageUrls = []
		if (!isVideo) {
			const atlas = photoData.ext_params?.atlas
			if (atlas?.list?.length && atlas?.cdn?.length) {
				const cdns = atlas.cdn
				imageUrls = atlas.list.map((path, i) => {
					const cdn = cdns[i % cdns.length]
					return `https://${cdn}${path}`
				})
			} else if (coverImg) {
				imageUrls = [coverImg]
			}
		}

		// 作者信息
		const author = {
			author_id: photoData.userId ? String(photoData.userId) : '',
			nickname: photoData.userName || '未知用户',
			avatar: photoData.headUrls && photoData.headUrls.length > 0
				? photoData.headUrls[0].url
				: (photoData.headUrl || '')
		}

		// 统计信息
		const statistics = {
			digg_count: photoData.likeCount || 0,
			comment_count: photoData.commentCount || 0,
			share_count: photoData.forwardCount || 0,
			collect_count: 0
		}

		return {
			project: {
				project_id: photoData.photoId ? String(photoData.photoId) : shortPhotoId,
				title: cleanTitle,
				desc: caption,
				type: isVideo ? 'video' : 'image',
				cover: coverImg,
				url_list: isVideo ? (videoUrl ? [videoUrl] : []) : imageUrls
			},
			author,
			statistics,
			platform: 'kuaishou'
		}
	}
}

module.exports = KuaishouParser
