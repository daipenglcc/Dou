const axios = require('axios')
const Router = require('koa-router')
const PlatformProcessor = require('../utils/platformProcessor')
const path = require('path')
const { getPool, getDB } = require('../utils/db')
const { backup } = require('../utils/backup')

const router = new Router()

// 微信小程序配置
const WX_APP_ID = 'wx5030420cb6d74ebf'
const WX_APP_SECRET = 'f01fd311245f8c13f1c065c95ad19528'

/**
 * 将 URL 包装为代理地址
 */
function wrapProxy(url, base) {
	if (!url) return url
	return `${base}${encodeURIComponent(url)}`
}

/**
 * 递归遍历对象中所有 url_list 和 cover 字段，包装为代理地址
 */
function wrapUrlsWithProxy(data, base) {
	if (!data || typeof data !== 'object') return

	if (Array.isArray(data)) {
		data.forEach((item) => wrapUrlsWithProxy(item, base))
		return
	}

	for (const key of Object.keys(data)) {
		if (key === 'url_list' && Array.isArray(data[key])) {
			data[key] = data[key].map((u) => wrapProxy(u, base))
		} else if (key === 'cover' && typeof data[key] === 'string') {
			data[key] = wrapProxy(data[key], base)
		} else if (typeof data[key] === 'object') {
			wrapUrlsWithProxy(data[key], base)
		}
	}
}

/**
 * POST /api/parse
 * 解析多平台分享链接接口
 * 支持抖音、小红书、快手、B站等平台的分享链接解析
 *
 * @route POST /api/parse
 * @param {Object} ctx.request.body - 请求体
 * @param {string} [ctx.request.body.shareLink] - 分享链接（与shareText二选一）
 * @param {string} [ctx.request.body.shareText] - 分享文本（与shareLink二选一）
 * @returns {Object} 解析结果
 * @returns {boolean} returns.success - 是否成功
 * @returns {Object} returns.data - 解析得到的视频/图集信息
 * @returns {string} returns.message - 成功消息
 * @returns {string} returns.timestamp - 时间戳
 */
/**
 * 通过 HEAD 请求获取文件大小
 */
async function getFileSize(url) {
	try {
		const response = await axios.head(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
			},
			timeout: 3 * 1000
		})
		const contentLength = response.headers['content-length']
		return contentLength ? parseInt(contentLength, 10) : null
	} catch (error) {
		console.error('获取文件大小失败:', url, error.message)
		return null
	}
}

router.post('/parse', async (ctx) => {
	const { shareLink, shareText, openid } = ctx.request.body

	if (!shareLink && !shareText) {
		ctx.status = 400
		ctx.body = {
			success: false,
			error: '请提供 shareLink 或 shareText 参数'
		}
		return
	}

	const inputText = shareLink || shareText
	const processor = new PlatformProcessor()

	try {
		const videoInfo = await processor.parseShareUrl(inputText)

		// 获取文件大小（仅针对视频获取大小，避免图集发送数十个 HEAD 请求导致接口超时）
		if (videoInfo.project?.url_list) {
			if (videoInfo.project.type === 'video') {
				const sizes = await Promise.all(
					videoInfo.project.url_list.map((url) => getFileSize(url))
				)
				videoInfo.project.size_list = sizes
			} else {
				videoInfo.project.size_list = new Array(videoInfo.project.url_list.length).fill(
					null
				)
			}
		}

		// 如果提供了 openid，记录到数据库
		if (openid) {
			try {
				const pool = getPool()
				if (pool) {
					// 尝试提取视频标题或者描述
					const title = videoInfo.project?.title || videoInfo.project?.desc || ''
					const platform = videoInfo.platform || 'unknown'
					const mediaType = videoInfo.project?.type || 'unknown'

					// 北京时间 (UTC+8)
					const now = new Date(Date.now() + 8 * 3600000)
						.toISOString()
						.slice(0, 19)
						.replace('T', ' ')
					await pool.query(
						'INSERT INTO parse_records (openid, platform, media_type, url, title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
						[openid, platform, mediaType, inputText, title, now]
					)
				}
			} catch (dbError) {
				console.error('Failed to insert parse record:', dbError.message)
				// 不阻断正常解析返回
			}
		}

		// 将 cover 和 url_list 中的原始链接包装为同源代理地址
		const proxyBase = `${ctx.origin}/api/proxyFile?url=`
		wrapUrlsWithProxy(videoInfo, proxyBase)

		ctx.body = {
			success: true,
			data: videoInfo,
			message: '解析成功',
			timestamp: new Date().toISOString()
		}
	} catch (error) {
		ctx.status = 400
		ctx.body = {
			success: false,
			error: error.message,
			timestamp: new Date().toISOString()
		}
	}
})

/**
 * GET /api/download-stream
 * 流式下载视频接口
 * 直接将远程视频流传客户端，实现边下载边传输
 *
 * @route GET /api/download-stream
 * @param {Object} ctx.query - 查询参数
 * @param {string} ctx.query.url - 视频下载链接（必需）
 * @param {string} [ctx.query.title] - 视频标题，用作文件名（可选，默认为'video'）
 * @returns {Stream} 视频文件流
 */
router.get('/download-stream', async (ctx) => {
	const { url, title } = ctx.query
	if (!url) {
		ctx.status = 400
		ctx.body = '缺少视频 URL'
		return
	}

	// 设置下载头
	ctx.set('Content-Type', 'application/octet-stream')
	ctx.set(
		'Content-Disposition',
		`attachment; filename="${encodeURIComponent(title || 'video')}.mp4"`
	)

	// 获取视频流并返回
	const response = await axios.get(url, { responseType: 'stream' })
	ctx.body = response.data
})

/**
 * GET /api/proxyFile
 * 代理下载远程文件接口
 * 作为中间代理，下载远程文件并转发给客户端
 * 主要用于解决跨域问题和统一下载入口
 *
 * @route GET /api/proxyFile
 * @param {Object} ctx.query - 查询参数
 * @param {string} ctx.query.url - 远程文件链接（必需）
 * @returns {Stream} 文件流或错误信息
 */
router.get('/proxyFile', async (ctx) => {
	const { url } = ctx.query

	if (!url) {
		ctx.status = 400
		ctx.body = { success: false, error: '请提供 url 参数' }
		return
	}

	try {
		// 请求远程文件流
		const response = await axios.get(url, {
			responseType: 'stream',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
			},
			timeout: 15 * 1000 // 15 秒（仅限连接建立超时，不影响文件传输）
		})

		// 获取文件名
		const fileName = path.basename(url.split('?')[0]) || 'file'

		// 设置响应头（把远程头部透传给前端）
		ctx.set('Content-Disposition', `attachment; filename="${fileName}"`)
		ctx.set('Content-Type', response.headers['content-type'] || 'application/octet-stream')

		// ⭐ 把 Content-Length 转发给前端
		if (response.headers['content-length']) {
			ctx.set('Content-Length', response.headers['content-length'])
		}

		// 直接返回文件流
		ctx.body = response.data
	} catch (error) {
		console.error('Proxy file error:', error.message)
		ctx.status = 500
		ctx.body = { success: false, error: '代理下载失败' }
	}
})

/**
 * GET /api/wechat/login
 * 微信小程序 code 转 openid
 *
 * @route GET /api/wechat/login
 * @param {Object} ctx.query - 查询参数
 * @param {string} ctx.query.code - 小程序登录时获取的 code
 */
router.get('/wechat/login', async (ctx) => {
	const { code } = ctx.query
	if (!code) {
		ctx.status = 400
		ctx.body = { success: false, error: '缺少 code 参数' }
		return
	}

	try {
		const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APP_ID}&secret=${WX_APP_SECRET}&js_code=${code}&grant_type=authorization_code`
		const https = require('https')
		const response = await axios.get(url, {
			httpsAgent: new https.Agent({
				rejectUnauthorized: false
			})
		})
		const data = response.data

		if (data.errcode) {
			ctx.status = 400
			ctx.body = { success: false, error: data.errmsg }
		} else {
			ctx.body = {
				success: true,
				data: {
					openid: data.openid,
					session_key: data.session_key
				}
			}
		}
	} catch (error) {
		console.error('WeChat login error:', error.message)
		ctx.status = 500
		ctx.body = { success: false, error: '获取 openid 失败' }
	}
})

/**
 * GET /api/records
 * 获取用户的解析记录
 *
 * @route GET /api/records
 * @param {Object} ctx.query - 查询参数
 * @param {string} ctx.query.openid - 用户的 openid
 */
router.get('/records', async (ctx) => {
	const { openid } = ctx.query
	if (!openid) {
		ctx.status = 400
		ctx.body = { success: false, error: '缺少 openid 参数' }
		return
	}

	try {
		const pool = getPool()
		if (!pool) {
			ctx.status = 500
			ctx.body = { success: false, error: '数据库未连接' }
			return
		}

		let rows
		if (openid === 'obb9c16_q4N-aZ1mHu26hfvEp3Pk') {
			const [result] = await pool.query(
				'SELECT * FROM parse_records ORDER BY created_at DESC'
			)
			rows = result
		} else {
			const [result] = await pool.query(
				'SELECT * FROM parse_records WHERE openid = ? ORDER BY created_at DESC',
				[openid]
			)
			rows = result
		}

		ctx.body = {
			success: true,
			data: rows,
			message: '获取成功'
		}
	} catch (error) {
		console.error('Failed to get records:', error.message)
		ctx.status = 500
		ctx.body = { success: false, error: '获取记录失败' }
	}
})

// 数据库查询页面
router.get('/db', async (ctx) => {
	ctx.type = 'html'
	ctx.body = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DB Query</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font: 14px/1.5 system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
h2 { color: #e94560; margin-bottom: 12px; }
textarea { width: 100%; height: 80px; background: #16213e; color: #eee; border: 1px solid #0f3460; border-radius: 6px; padding: 10px; font: 14px monospace; resize: vertical; }
.btns { margin: 8px 0 16px; display: flex; gap: 10px; }
button { padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.btn-run { background: #e94560; color: #fff; }
.btn-clear { background: #0f3460; color: #ccc; }
.btn-backup { background: #16213e; color: #e94560; }
.error { background: #522; color: #f99; padding: 10px; border-radius: 6px; margin-bottom: 12px; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: #0f3460; padding: 8px 10px; text-align: left; position: sticky; top: 0; }
td { padding: 6px 10px; border-bottom: 1px solid #16213e; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
tr:hover td { background: #16213e; }
.result-wrap { max-height: 70vh; overflow: auto; border: 1px solid #0f3460; border-radius: 6px; }
.info { color: #888; margin-bottom: 8px; }
a { color: #e94560; }
</style>
</head>
<body>
<h2>📊 douyin_app</h2>
<textarea id="sql" placeholder="SELECT * FROM parse_records ORDER BY id DESC LIMIT 20">SELECT * FROM parse_records ORDER BY id DESC LIMIT 20</textarea>
<div class="btns">
<button class="btn-run" onclick="run()">Run (Cmd/Ctrl+Enter)</button>
<button class="btn-clear" onclick="clearAll()">Clear</button>
<button class="btn-backup" onclick="sendBackup()">📧 备份</button>
</div>
<div id="info" class="info"></div>
<div id="error"></div>
<div class="result-wrap"><table id="result"></table></div>
<script>
const sqlEl = document.getElementById('sql')
const resultEl = document.getElementById('result')
const errorEl = document.getElementById('error')
const infoEl = document.getElementById('info')

sqlEl.addEventListener('keydown', e => { if ((e.metaKey||e.ctrlKey) && e.key==='Enter') run() })

async function run() {
  errorEl.textContent = ''
  infoEl.textContent = ''
  resultEl.innerHTML = ''
  const sql = sqlEl.value.trim()
  if (!sql) return
  try {
    const res = await fetch('/api/db/query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({sql}) })
    const data = await res.json()
    if (data.error) { errorEl.textContent = data.error; return }
    if (!data.rows.length) { infoEl.textContent = '0 rows'; return }
    infoEl.textContent = data.rows.length + ' row(s)'
    let html = '<thead><tr>'
    data.columns.forEach(c => html += '<th>'+esc(c)+'</th>')
    html += '</tr></thead><tbody>'
    data.rows.forEach(row => {
      html += '<tr>'
      data.columns.forEach(c => { const v = row[c]; html += '<td title="'+esc(String(v??''))+'">'+esc(v===null?'NULL':String(v))+'</td>' })
      html += '</tr>'
    })
    html += '</tbody>'
    resultEl.innerHTML = html
  } catch(e) { errorEl.textContent = e.message }
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function clearAll() { errorEl.textContent=''; infoEl.textContent=''; resultEl.innerHTML='' }
async function sendBackup() {
  infoEl.textContent='发送中...'
  try {
    const res = await fetch('/api/db/backup', { method:'POST' })
    const data = await res.json()
    if (data.error) { errorEl.textContent = data.error }
    else { infoEl.textContent = data.message }
  } catch(e) { errorEl.textContent = e.message }
}
</script>
</body>
</html>`
})

// 执行 SQL 查询
router.post('/db/query', async (ctx) => {
	const { sql } = ctx.request.body
	if (!sql) {
		ctx.body = { error: '缺少 sql 参数' }
		return
	}

	const db = getDB()
	if (!db) {
		ctx.body = { error: '数据库未连接' }
		return
	}

	try {
		// 只允许读操作
		const trimmed = sql.trim().toUpperCase()
		if (
			!trimmed.startsWith('SELECT') &&
			!trimmed.startsWith('PRAGMA') &&
			!trimmed.startsWith('EXPLAIN')
		) {
			ctx.body = { error: '仅允许 SELECT / PRAGMA / EXPLAIN 查询' }
			return
		}

		const stmt = db.prepare(sql)
		const rows = stmt.all()
		const columns = rows.length > 0 ? Object.keys(rows[0]) : []
		ctx.body = { columns, rows }
	} catch (e) {
		ctx.body = { error: e.message }
	}
})

// 手动触发数据库备份
router.post('/db/backup', async (ctx) => {
	try {
		await backup()
		ctx.body = { success: true, message: '备份已发送' }
	} catch (e) {
		ctx.body = { error: e.message }
	}
})

module.exports = router
