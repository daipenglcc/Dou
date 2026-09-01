require('dotenv').config({ path: '.env.local' })
const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const views = require('koa-views')
const path = require('path')
const videoRouter = require('./routes/video')

const cron = require('node-cron')
const { initDB } = require('./utils/db')
const { backup } = require('./utils/backup')

const app = new Koa()
app.proxy = true
const router = new Router()

// 初始化数据库（容错处理，防止 Vercel 无文件写入权限时报错挂掉）
initDB().catch((e) => console.error('[DB Init Warning]', e.message))

// 每天中午 12:00 备份数据库（仅限长服务环境）
if (!process.env.VERCEL) {
	cron.schedule('0 12 * * *', () => backup().catch((e) => console.error('[backup]', e.message)), {
		timezone: 'Asia/Shanghai'
	})
}

// 配置模板引擎
app.use(
	views(path.join(__dirname, 'views'), {
		extension: 'ejs' // 使用 EJS 作为模板引擎
	})
)

const serve = require('koa-static')

// 配置静态资源目录 (例如 favicon.ico / 图标等)
app.use(serve(path.join(__dirname, '../public')))

// 使用中间件
app.use(bodyParser())

// 路由
router.get('/', async (ctx) => {
	await ctx.render('index/index', {
		title: '抖音视频下载器'
	})
})

// SEO 爬虫协议与站点地图
router.get('/robots.txt', (ctx) => {
	ctx.type = 'text/plain'
	ctx.body = `User-agent: *
Allow: /
Sitemap: ${ctx.origin}/sitemap.xml`
})

router.get('/sitemap.xml', (ctx) => {
	ctx.type = 'application/xml'
	ctx.body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${ctx.origin}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`
})

router.use('/api', videoRouter.routes())

app.use(router.routes())
app.use(router.allowedMethods())

if (process.env.VERCEL) {
	module.exports = app.callback()
} else {
	const PORT = process.env.PORT || 7777
	const server = app.listen(PORT, '0.0.0.0', () => {
		console.log(`Server is running on port ${PORT}`)
	})
	server.setTimeout(10 * 60 * 1000)
	module.exports = app
}
