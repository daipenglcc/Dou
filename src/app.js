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

// 使用中间件
app.use(bodyParser())

// 路由
router.get('/', async (ctx) => {
	await ctx.render('index/index', {
		title: '抖音视频下载器'
	})
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
