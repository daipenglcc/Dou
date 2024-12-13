const axios = require('axios')
const cheerio = require('cheerio')

async function parseDouyinUrl(shareUrl) {
	try {
		// 清理分享文本中的链接
		const urlMatch = shareUrl.match(/https:\/\/v\.douyin\.com\/[a-zA-Z0-9]+/)
		if (!urlMatch) {
			throw new Error('无效的抖音分享链接')
		}
		const cleanUrl = urlMatch[0]

		// 1. 处理分享链接，获取重定向后的真实链接
		const response = await axios.get(cleanUrl, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
				'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
				'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
				'sec-ch-ua-mobile': '?0',
				'sec-ch-ua-platform': '"Windows"',
				'sec-fetch-dest': 'document',
				'sec-fetch-mode': 'navigate',
				'sec-fetch-site': 'none',
				'sec-fetch-user': '?1',
				'upgrade-insecure-requests': '1'
			},
			maxRedirects: 5,
			validateStatus: (status) => status < 400
		})

		// 2. 从页面中提取视频信息
		const $ = cheerio.load(response.data)

		// 提取视频标题（可能需要根据实际DOM结构调整选择器）
		const title = $('title').text().trim()

		// 尝试多个可能的视频选择器
		const videoUrl =
			$('video source').attr('src') ||
			$('video').attr('src') ||
			$('[data-e2e="user-post-video"]').attr('src')

		if (!videoUrl) {
			throw new Error('无法提取视频地址')
		}

		return {
			title,
			videoUrl,
			originalUrl: cleanUrl
		}
	} catch (error) {
		throw new Error(`解析抖音链接失败: ${error.message}`)
	}
}

module.exports = {
	parseDouyinUrl
}
