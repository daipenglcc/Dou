// 导入各平台解析器
const DouyinParser = require('./platforms/douyinParser')
const XiaohongshuParser = require('./platforms/xiaohongshuParser')
const KuaishouParser = require('./platforms/kuaishouParser')
const BilibiliParser = require('./platforms/bilibiliParser')
const ToutiaoParser = require('./platforms/toutiaoParser')

/**
 * 多平台内容解析处理器
 * 统一管理各平台的解析逻辑
 */
class PlatformProcessor {
	constructor() {
		// 初始化各平台解析器
		this.parsers = {
			douyin: new DouyinParser(),
			xiaohongshu: new XiaohongshuParser(),
			kuaishou: new KuaishouParser(),
			bilibili: new BilibiliParser(),
			toutiao: new ToutiaoParser()
		}
	}

	/**
	 * 多平台分享链接解析入口
	 * 支持平台：抖音、快手、小红书、B站等
	 * @param {string} shareText - 分享文本（包含链接）
	 * @returns {Object} 解析结果
	 */
	async parseShareUrl(shareText) {
		// 提取所有链接
		const urls = shareText.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+)/g)
		if (!urls || urls.length === 0) {
			throw new Error('未找到有效的分享链接')
		}

		console.log("提取到的链接:", urls)
		const shareUrl = urls[0]
		console.log("分享链接:", shareUrl)

		// 识别平台类型
		const platform = this.detectPlatform(shareUrl)
		console.log("识别到的平台:", platform)

		// 获取对应平台的解析器
		const parser = this.parsers[platform]
		if (!parser) {
			throw new Error(`暂不支持该平台: ${platform}`)
		}

		// 调用平台解析器
		return await parser.parseUrl(shareUrl)
	}

	/**
	 * 检测分享链接的平台类型
	 * @param {string} url - 分享链接
	 * @returns {string} 平台标识
	 */
	detectPlatform(url) {
		const domain = url.toLowerCase()
		
		if (domain.includes('douyin.com') || domain.includes('v.douyin.com')) {
			return 'douyin'
		} else if (domain.includes('kuaishou.com') || domain.includes('v.kuaishou.com')) {
			return 'kuaishou'
		} else if (domain.includes('xiaohongshu.com') || domain.includes('xhslink.com')) {
			return 'xiaohongshu'
		} else if (domain.includes('bilibili.com') || domain.includes('b23.tv')) {
			return 'bilibili'
		} else if (domain.includes('toutiao.com') || domain.includes('toutiao')) {
			return 'toutiao'
		} else {
			return 'unknown'
		}
	}

}

module.exports = PlatformProcessor