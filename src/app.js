const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const views = require('koa-views')
const path = require('path')
const videoRouter = require('./routes/video')

const app = new Koa()
const router = new Router()

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

const PORT = 7777
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
