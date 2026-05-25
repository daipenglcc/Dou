const mysql = require('mysql2/promise')

const isProd = process.env.NODE_ENV === 'production'

const dbConfig = {
	host: isProd ? '10.34.112.115' : 'sh-cynosdbmysql-grp-h10adil8.sql.tencentcdb.com',
	port: isProd ? 3306 : 29922,
	user: 'root',
	password: 'QhLcnFGrpFjfzL5'
}

const DATABASE_NAME = 'douyin_app'

let pool = null

async function initDB() {
	try {
		// 1. 创建没有指定数据库的连接，用于创建数据库（如果不存在）
		const connection = await mysql.createConnection(dbConfig)
		await connection.query(
			`CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
		)
		await connection.end()

		// 2. 创建连接池，连接到特定数据库
		pool = mysql.createPool({
			...dbConfig,
			database: DATABASE_NAME,
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0
		})

		// 3. 自动建表 parse_records
		const createTableSql = `
			CREATE TABLE IF NOT EXISTS \`parse_records\` (
				\`id\` INT AUTO_INCREMENT PRIMARY KEY,
				\`openid\` VARCHAR(100) NOT NULL COMMENT '微信用户唯一标识',
				\`platform\` VARCHAR(50) DEFAULT NULL COMMENT '解析平台',
				\`media_type\` VARCHAR(20) DEFAULT NULL COMMENT '媒体类型: video/image',
				\`url\` TEXT COMMENT '原始分享链接或文本',
				\`title\` TEXT COMMENT '解析得到的标题/描述',
				\`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='解析记录表'
		`
		await pool.query(createTableSql)

		// 安全地尝试添加新字段（为了兼容已经存在且没有 media_type 字段的老表）
		try {
			await pool.query(
				"ALTER TABLE `parse_records` ADD COLUMN `media_type` VARCHAR(20) DEFAULT NULL COMMENT '媒体类型: video/image' AFTER `platform`"
			)
		} catch (e) {
			// 列如果已经存在会报 Duplicate column name，忽略该错误
		}

		console.log('Database initialized and parse_records table is ready.')
	} catch (error) {
		console.error('Failed to initialize database:', error)
	}
}

module.exports = {
	initDB,
	getPool: () => pool
}
