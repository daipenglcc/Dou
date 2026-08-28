const { Pool } = require('pg')

let pool = null

async function initDB() {
	try {
		const connectionString = process.env.POSTGRES_URL
		if (!connectionString) {
			console.warn('[DB Init Warning] POSTGRES_URL not set, database disabled')
			return
		}

		pool = new Pool({
			connectionString,
			max: 5,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 15000,
			ssl: connectionString.includes('sslmode=require')
				? { rejectUnauthorized: false }
				: false
		})

		// 验证连接
		const client = await pool.connect()
		client.release()

		// 创建表（PostgreSQL 语法）
		await pool.query(`
			CREATE TABLE IF NOT EXISTS parse_records (
				id SERIAL PRIMARY KEY,
				openid VARCHAR(100) NOT NULL,
				platform VARCHAR(50) DEFAULT NULL,
				media_type VARCHAR(20) DEFAULT NULL,
				url TEXT,
				title TEXT,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)
		`)

		console.log('PostgreSQL database initialized (Neon)')
	} catch (error) {
		console.error('Failed to initialize PostgreSQL database:', error)
		throw error
	}
}

function getPool() {
	return pool
}

function getDB() {
	return pool
}

module.exports = {
	initDB,
	getPool,
	getDB
}
