const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')

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
	// 从URL中提取视频ID的逻辑
	const match = url.match(/(?:video|note)\/(\d+)/)
	return match ? match[1] : null
}

// 构建真实视频地址=>https://www.douyin.com/video/7326764458792045833
async function getVideoInfoFromApi(videoId) {
	const videoUrl2 = `https://www.douyin.com/video/${videoId}`
	console.log('videoUrl2', videoUrl2)
	return
}

// 定义异步函数获取页面内容并提取 video 标签的 src
async function getVideoSrc(url) {
	try {
		// 使用 puppeteer 获取页面的 HTML
		const html = await getHtmlWithPuppeteer(url)
		// console.log('获取的内容', html)

		// 使用 cheerio 解析 HTML
		const $ = cheerio.load(html)

		// 存储所有 video 标签的 src 属性
		const tags = []

		// 查找所有 video 标签并获取 src 属性
		$('div').each((index, element) => {
			const src = $(element).text()
			if (src) {
				tags.push(src)
			}
		})

		console.log('tags', tags)
		return tags // 返回 videoSrcs 数组
	} catch (err) {
		console.error('Error:', err)
	}
}

// 获取网页的 HTML 内容（适用于动态加载的网页）
async function getHtmlWithPuppeteer(url) {
	// 启动一个新的 Puppeteer 浏览器实例
	const browser = await puppeteer.launch({
		headless: false, // 设置为 false 以便看到浏览器过程
		args: ['--no-sandbox', '--disable-setuid-sandbox'] // 在某些环境下可能需要这些参数
	})

	// 打开一个新页面
	const page = await browser.newPage()

	// 设置一些浏览器标头（防止被识别为爬虫）
	await page.setUserAgent(
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
	)

	// 模拟屏幕分辨率
	await page.setViewport({ width: 1280, height: 800 })

	await page.goto(url, { waitUntil: 'networkidle2' })

	const html = await page.content()

	// 关闭浏览器实例
	await browser.close()
	return html
}

module.exports = {
	parseDouyinUrl,
	getVideoSrc
}
