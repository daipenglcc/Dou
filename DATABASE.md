# 数据库

本地 SQLite，文件 `data/douyin.db`，零外部依赖。

## 表结构

**parse_records** — 解析记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| openid | VARCHAR(100) | 微信用户标识 |
| platform | VARCHAR(50) | 解析平台 |
| media_type | VARCHAR(20) | video / image |
| url | TEXT | 原始分享链接 |
| title | TEXT | 解析标题 |
| created_at | DATETIME | 创建时间 |

## 本地查看

### sqlite3 CLI（系统自带，推荐）

```bash
sqlite3 data/douyin.db

.headers on
.mode column
.tables
.schema parse_records
SELECT * FROM parse_records ORDER BY id DESC LIMIT 10;
.quit
```

单条命令：

```bash
sqlite3 data/douyin.db "SELECT * FROM parse_records ORDER BY id DESC"
```

### Node 一行（依赖已安装）

```bash
node -e "const D=require('better-sqlite3');const d=new D('data/douyin.db');console.table(d.prepare('SELECT * FROM parse_records ORDER BY id DESC LIMIT 10').all())"
```

### DB Browser（GUI）

```bash
brew install --cask db-browser-for-sqlite
```

安装后用 DB Browser 打开 `data/douyin.db` 即可。

## 远程查看

SQLite 是文件数据库，不像 MySQL 自带网络协议。需要通过服务器间接访问：

### 浏览器（推荐）

服务内置了查询页面，直接浏览器打开：

```
http://<服务器IP>:7777/api/db
```

支持 SQL 查询，只读模式（仅允许 SELECT/PRAGMA/EXPLAIN），Cmd/Ctrl+Enter 快捷执行。

### SSH 上去看

```bash
ssh your-server
cd /app && sqlite3 data/douyin.db
```

### SCP 拉到本地

```bash
scp your-server:/app/data/douyin.db /tmp/ && sqlite3 /tmp/douyin.db
```

### sshfs 挂载远程目录

```bash
sshfs your-server:/app/data ./remote-data
sqlite3 remote-data/douyin.db
```

## 模块

`src/utils/db.js` — 导出 `initDB()`、`getPool()` 和 `getDB()`，接口兼容原 MySQL（`pool.query()` 返回 `[rows]`），上层调用代码无需改动。
