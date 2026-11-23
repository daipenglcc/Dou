const axios = require('axios')

/**
 * 轻量短链重定向解析：仅读取 3xx Location 响应头，不下载落地页 HTML
 * @param {string} startUrl - 初始分享链接
 * @param {Object} [headers] - 自定义请求头
 * @param {number} [maxHops=3] - 最大跳转次数
 * @returns {Promise<string>} 最终跳转后的 URL
 */
async function resolveRedirectUrl(startUrl, headers = {}, maxHops = 3) {
	let currentUrl = startUrl
	for (let i = 0; i < maxHops; i++) {
		try {
			const resp = await axios.get(currentUrl, {
				headers,
				maxRedirects: 0,
				timeout: 6000,
				validateStatus: () => true
			})
			if ([301, 302, 303, 307, 308].includes(resp.status) && resp.headers?.location) {
				currentUrl = new URL(resp.headers.location, currentUrl).toString()
			} else {
				break
			}
		} catch (e) {
			break
		}
	}
	return currentUrl
}

module.exports = { resolveRedirectUrl }
