const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const videoRouter = require('./routes/video')

const app = new Koa()
const router = new Router()

// 使用中间件
app.use(bodyParser())

// 路由
router.use('/api', videoRouter.routes())

app.use(router.routes())
app.use(router.allowedMethods())

const PORT = 7777
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
