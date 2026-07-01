const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'douyin.db')

const transporter = nodemailer.createTransport({
	host: 'smtp.qq.com',
	port: 587,
	secure: false,
	auth: {
		user: '2808707765@qq.com',
		pass: 'hqmyyprqauygddfg'
	}
})

async function backup() {
	const to = 'youhuabujianye@gmail.com'

	if (!fs.existsSync(DB_PATH)) {
		throw new Error('数据库文件不存在')
	}

	const stat = fs.statSync(DB_PATH)
	const date = new Date().toISOString().slice(0, 10)
	const sizeKB = Math.round(stat.size / 1024)

	await transporter.sendMail({
		from: '2808707765@qq.com',
		to,
		subject: `[Dou] 数据库备份 ${date}`,
		text: `数据库文件: douyin.db\n大小: ${sizeKB} KB\n备份时间: ${new Date().toLocaleString('zh-CN')}\n\n=== 还原方式 ===\n1. 下载附件，重命名为 douyin.db\n2. 上传到服务器的 /app/data/douyin.db\n3. 重启服务: docker restart douyin-app\n\n（如用 docker，scp 上传: scp douyin.db your-server:/app/data/douyin.db）`,
		attachments: [{
			filename: `douyin-${date}.db`,
			path: DB_PATH
		}]
	})

	console.log(`[backup] 已发送至 ${to} (${sizeKB} KB)`)
}

module.exports = { backup }
