const axios = require('axios')
const PlatformProcessor = require('./platformProcessor')
const { transporter } = require('./backup')

const REPORT_EMAIL = 'youhuabujianye@gmail.com'
const MAIL_FROM = '2808707765@qq.com'

// 各平台自检测试用例（覆盖全部支持平台的视频与图集）
const TEST_CASES = [
	{
		name: '抖音 · 视频',
		platform: 'douyin',
		expectedType: 'video',
		url: 'https://v.douyin.com/F_MnkKBlxaE/'
	},
	{
		name: '抖音 · 图集',
		platform: 'douyin',
		expectedType: 'image',
		url: 'https://v.douyin.com/TpT3OXPGd4w/'
	},
	{
		name: '小红书 · 图集',
		platform: 'xiaohongshu',
		expectedType: 'image',
		url: 'https://xhslink.cn/o/4twzQsvcpLk'
	},
	{
		name: '小红书 · 视频',
		platform: 'xiaohongshu',
		expectedType: 'video',
		url: 'https://xhslink.cn/o/3OL9bl6jCKY'
	},
	{
		name: '快手 · 视频',
		platform: 'kuaishou',
		expectedType: 'video',
		url: 'https://v.kuaishou.com/nLHP9uAF'
	},
	{
		name: '快手 · 图集',
		platform: 'kuaishou',
		expectedType: 'image',
		url: 'https://v.kuaishou.com/JZKPUPxy'
	},
	{
		name: 'B站 · 视频',
		platform: 'bilibili',
		expectedType: 'video',
		url: 'https://b23.tv/BV1NUnR6DEBT'
	},
	{
		name: '今日头条 · 视频',
		platform: 'toutiao',
		expectedType: 'video',
		url: 'https://m.toutiao.com/is/NcSYy5s7pEI/'
	}
]

/**
 * 校验解析出的媒体直链是否可正常访问且非 HTML 页面
 */
async function checkMediaUrl(url) {
	if (!url) return { ok: false, reason: '地址为空' }
	try {
		const resp = await axios.head(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
			},
			maxRedirects: 5,
			timeout: 6000,
			validateStatus: () => true
		})
		const contentType = resp.headers['content-type'] || ''
		const contentLength = resp.headers['content-length']
		if (resp.status >= 200 && resp.status < 300) {
			if (contentType.includes('text/html')) {
				return {
					ok: false,
					status: resp.status,
					contentType,
					reason: '返回的是 HTML 网页而非媒体流'
				}
			}
			return {
				ok: true,
				status: resp.status,
				contentType: contentType.split(';')[0],
				size: contentLength ? parseInt(contentLength, 10) : null
			}
		}
		return { ok: false, status: resp.status, contentType, reason: `HTTP ${resp.status}` }
	} catch (e) {
		return { ok: false, reason: e.message }
	}
}

/**
 * 格式化字节大小
 */
function formatSize(bytes) {
	if (!bytes || Number.isNaN(bytes)) return '-'
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
	return `${Math.round(bytes / 1024)} KB`
}

/**
 * 格式化北京时间 YYYY-MM-DD HH:mm:ss
 */
function getBeijingTime() {
	const d = new Date(Date.now() + 8 * 3600000)
	const iso = d.toISOString()
	return {
		date: iso.slice(0, 10),
		dateTime: `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
	}
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

/**
 * 执行全部平台的解析自检（并发执行，缩短整体耗时以兼容 Serverless 超时限制）
 */
async function runHealthCheck() {
	const processor = new PlatformProcessor()
	const startedAt = Date.now()

	const results = await Promise.all(
		TEST_CASES.map(async (item) => {
			const t0 = Date.now()
			try {
				const data = await processor.parseShareUrl(item.url)
				const durationMs = Date.now() - t0
				const project = data?.project || {}
				const urlList = Array.isArray(project.url_list) ? project.url_list : []

				if (urlList.length === 0) {
					return {
						...item,
						ok: false,
						durationMs,
						title: project.title || '',
						author: data?.author?.nickname || '',
						mediaCount: 0,
						error: '解析结果 url_list 为空'
					}
				}

				const mediaCheck = await checkMediaUrl(urlList[0])
				const typeMatch = project.type === item.expectedType
				const ok = mediaCheck.ok && typeMatch

				let error = ''
				if (!typeMatch) {
					error = `类型不匹配: 期望 ${item.expectedType}, 实际 ${project.type}`
				} else if (!mediaCheck.ok) {
					error = `媒体直链异常: ${mediaCheck.reason}`
				}

				return {
					...item,
					ok,
					durationMs,
					type: project.type,
					title: (project.title || '').slice(0, 40),
					author: data?.author?.nickname || '未知用户',
					mediaCount: urlList.length,
					hasCover: Boolean(project.cover),
					mediaType: mediaCheck.contentType || '-',
					mediaSize: formatSize(mediaCheck.size),
					error
				}
			} catch (e) {
				return {
					...item,
					ok: false,
					durationMs: Date.now() - t0,
					title: '',
					author: '',
					mediaCount: 0,
					hasCover: false,
					mediaType: '-',
					mediaSize: '-',
					error: e.message
				}
			}
		})
	)

	const passed = results.filter((r) => r.ok).length
	const failed = results.length - passed
	const totalMs = Date.now() - startedAt
	const { date, dateTime } = getBeijingTime()

	return {
		date,
		dateTime,
		total: results.length,
		passed,
		failed,
		totalMs,
		results
	}
}

/**
 * 构造邮件 HTML 与纯文本内容
 */
function buildReportEmail(report) {
	const statusIcon = report.failed === 0 ? '✅ 全部正常' : `❌ 异常 ${report.failed} 项`
	const subject = `[Dou] 每日解析自检 ${statusIcon} (${report.passed}/${report.total}) - ${report.date}`

	const textLines = [
		`Dou 多平台解析每日自检日志`,
		`检测时间: ${report.dateTime} (北京时间)`,
		`总计: ${report.total} 项 | 正常: ${report.passed} | 异常: ${report.failed} | 总耗时: ${(report.totalMs / 1000).toFixed(2)}s`,
		'',
		...report.results.map((r) => {
			const mark = r.ok ? '[OK]' : '[FAIL]'
			const detail = r.ok
				? `${r.title} (${r.author}) | ${r.mediaCount}项 ${r.mediaType} ${r.mediaSize}`
				: `错误: ${r.error}`
			return `${mark} ${r.name} (${r.durationMs}ms) - ${detail}`
		})
	]

	const rowsHtml = report.results
		.map((r) => {
			const badge = r.ok
				? '<span style="color:#16a34a;font-weight:600;">✅ 正常</span>'
				: '<span style="color:#dc2626;font-weight:600;">❌ 异常</span>'
			const detail = r.ok
				? `${escapeHtml(r.title)}<br><span style="color:#666;font-size:12px;">作者: ${escapeHtml(r.author)} · ${r.mediaCount} 个资源 · ${escapeHtml(r.mediaType)} · ${escapeHtml(r.mediaSize)}</span>`
				: `<span style="color:#dc2626;">${escapeHtml(r.error)}</span>`
			return `<tr>
				<td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${escapeHtml(r.name)}</td>
				<td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${badge}</td>
				<td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${r.durationMs}ms</td>
				<td style="padding:8px 10px;border-bottom:1px solid #eee;">${detail}</td>
			</tr>`
		})
		.join('')

	const html = `
		<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:760px;margin:0 auto;color:#222;">
			<h2 style="margin-bottom:8px;">Dou 多平台解析每日自检报告</h2>
			<p style="color:#555;margin-top:0;">
				检测时间：<strong>${escapeHtml(report.dateTime)}</strong>（北京时间）<br>
				汇总：共 <strong>${report.total}</strong> 项，正常 <strong style="color:#16a34a;">${report.passed}</strong> 项，异常 <strong style="color:${report.failed > 0 ? '#dc2626' : '#16a34a'};">${report.failed}</strong> 项，总耗时 ${(report.totalMs / 1000).toFixed(2)}s
			</p>
			<table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee;">
				<thead>
					<tr style="background:#f8fafc;text-align:left;">
						<th style="padding:8px 10px;border-bottom:1px solid #ddd;">平台 / 类型</th>
						<th style="padding:8px 10px;border-bottom:1px solid #ddd;">状态</th>
						<th style="padding:8px 10px;border-bottom:1px solid #ddd;">耗时</th>
						<th style="padding:8px 10px;border-bottom:1px solid #ddd;">解析详情</th>
					</tr>
				</thead>
				<tbody>${rowsHtml}</tbody>
			</table>
		</div>
	`

	return {
		subject,
		text: textLines.join('\n'),
		html
	}
}

/**
 * 执行每日自检并将日志发送到指定邮箱
 */
async function runHealthCheckAndNotify(to = REPORT_EMAIL) {
	console.log('[healthCheck] 开始执行每日各平台解析自检...')
	const report = await runHealthCheck()
	const { subject, text, html } = buildReportEmail(report)

	await transporter.sendMail({
		from: MAIL_FROM,
		to,
		subject,
		text,
		html
	})

	console.log(`[healthCheck] 自检完成 (${report.passed}/${report.total})，日志已发送至 ${to}`)
	return report
}

module.exports = {
	runHealthCheck,
	runHealthCheckAndNotify
}
