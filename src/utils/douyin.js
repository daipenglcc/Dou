const axios = require('axios')
const cheerio = require('cheerio')

async function parseDouyinUrl(shareUrl, logs = []) {
	try {
		const response = await axios.get(shareUrl, {
			maxRedirects: 0,
			validateStatus: (status) => status === 302
		})

		const redirectedUrl = response.headers.location

		const videoId = extractVideoId(redirectedUrl)

		const videoInfo = await getVideoInfoFromApi(videoId)
		return { ...videoInfo, redirectedUrl, videoId }
	} catch (error) {
		console.error('Error parsing Douyin URL:', error)
		throw new Error('Failed to parse Douyin URL')
	}
}

// 获取视频ID
function extractVideoId(url) {
	console.log('extractVideoIdX1', url)
	// 从URL中提取视频ID的逻辑
	const match = url.match(/(?:video|note)\/(\d+)/)
	return match ? match[1] : null
}

// 获取真实视频地址
async function getVideoInfoFromApi(videoId) {
	console.log('getVideoInfoFromApi222', videoId)
	// 拼接抖音链接，https://www.douyin.com/video/7326764458792045833
	const videoUrl2 = `https://www.douyin.com/video/${videoId}`
	console.log('videoUrl2', videoUrl2)

	return

	try {
		const response = await axios.get(videoUrl2)
		const $ = cheerio.load(response.data)

		console.log('videoUrl4444', $)

		// Find video element and get its source URL
		const videoElement = $('video source')
		const videoUrl = videoElement.attr('src')

		console.log('videoUrl5555', videoUrl)

		if (!videoUrl) {
			throw new Error('Video URL not found')
		}

		return {
			videoUrl
			// You can extract more video information here if needed
		}
	} catch (error) {
		console.error('Error fetching video info:', error)
		throw new Error('Failed to get video information')
	}
}

// 获取网页的 HTML 内容
async function getInfoHtml(url) {
	try {
		const response = await axios.get(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' // 设置自定义请求头
			},
			timeout: 10000 // 设置请求超时为 10 秒
			// 可根据需要添加代理设置
			// proxy: {
			//   host: 'proxy_host',
			//   port: 8080
			// },
		})

		if (response.status === 200) {
			// 返回网页的 HTML 内容
			console.log('HTML Content Retrieved:', response.data.substring(0, 200)) // 打印前200个字符，避免输出过多
			return response.data
		} else {
			console.error('Failed to retrieve HTML. Status code:', response.status)
			throw new Error(`Request failed with status ${response.status}`)
		}
	} catch (error) {
		console.error('Error fetching HTML:', error.message)
		throw new Error('Failed to fetch the HTML content')
	}
}

module.exports = {
	parseDouyinUrl,
	getInfoHtml
}
