const axios = require('axios')
const fs = require('fs')
const path = require('path')

async function downloadVideo(url, filename) {
	try {
		const response = await axios({
			method: 'GET',
			url: url,
			responseType: 'stream',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
				Referer: 'https://www.douyin.com/'
			}
		})

		// 确保下载目录存在
		const downloadDir = path.join(process.cwd(), 'downloads')
		if (!fs.existsSync(downloadDir)) {
			fs.mkdirSync(downloadDir, { recursive: true })
		}

		const filePath = path.join(downloadDir, `${filename}.mp4`)
		const writer = fs.createWriteStream(filePath)

		response.data.pipe(writer)

		return new Promise((resolve, reject) => {
			writer.on('finish', () => resolve(filePath))
			writer.on('error', reject)
		})
	} catch (error) {
		throw new Error(`下载视频失败: ${error.message}`)
	}
}

module.exports = {
	downloadVideo
}
