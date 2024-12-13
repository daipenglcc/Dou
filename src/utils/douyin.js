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

function extractVideoId(url) {
	console.log('extractVideoIdX1', url)
	// 从URL中提取视频ID的逻辑
	const match = url.match(/(?:video|note)\/(\d+)/)
	return match ? match[1] : null
}

async function getVideoInfoFromApi(videoId) {
	console.log('getVideoInfoFromApi222', videoId)
	// 拼接抖音链接，https://www.douyin.com/video/7326764458792045833
	const videoUrl2 = `https://www.douyin.com/video/${videoId}`
	console.log('videoUrl2', videoUrl2)

	return

	const videoData = response.data
	console.log('视频详情数据:', videoData)

	const videoUrl = response.data.video.playAddr

	return {
		videoUrl
		// 其他视频信息
	}
}

module.exports = {
	parseDouyinUrl
}
