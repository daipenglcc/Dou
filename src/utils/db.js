const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'douyin.db')

let db = null

async function initDB() {
	try {
		const fs = require('fs')
		const dir = path.dirname(DB_PATH)
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}

		db = new Database(DB_PATH)
		// WAL mode for better concurrent read performance
		db.pragma('journal_mode = WAL')

		db.exec(`
			CREATE TABLE IF NOT EXISTS parse_records (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				openid VARCHAR(100) NOT NULL,
				platform VARCHAR(50) DEFAULT NULL,
				media_type VARCHAR(20) DEFAULT NULL,
				url TEXT,
				title TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)

		console.log('SQLite database initialized:', DB_PATH)
	} catch (error) {
		console.error('Failed to initialize SQLite database:', error)
		throw error
	}
}

// pony: return async wrapper so existing callers (pool.query with await) work unchanged
function getPool() {
	if (!db) return null
	return {
		query(sql, params = []) {
			const isSelect = sql.trim().toUpperCase().startsWith('SELECT')
			if (isSelect) {
				const stmt = db.prepare(sql)
				return [stmt.all(...(Array.isArray(params) ? params : [params]))]
			} else {
				const stmt = db.prepare(sql)
				return [stmt.run(...(Array.isArray(params) ? params : [params]))]
			}
		}
	}
}

function getDB() {
	return db
}

module.exports = {
	initDB,
	getPool,
	getDB
}
