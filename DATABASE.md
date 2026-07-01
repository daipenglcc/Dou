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

## 自动备份

每天中午 12:00 通过邮件发送 `.db` 文件到 `youhuabujianye@gmail.com`。

### 部署时保留数据

由于使用 SQLite（文件数据库），每次 Docker 重新部署容器内的数据会丢失。部署前先拉取最新数据：

1. 访问服务器 `/api/db` 页面，点「📧 备份」
2. 从邮箱下载附件，放到本地项目 `data/douyin.db`
3. 重新 build & 部署

这样服务器数据不会丢。

### 邮箱配置

SMTP 凭证已内置（QQ 邮箱），无需额外配置。

- 发件：2808707765@qq.com
- 收件：youhuabujianye@gmail.com
- 时间：每天中午 12:00，页面也有手动备份按钮

## 从备份还原

收到备份邮件后，下载附件恢复：

### 服务器直接部署

```bash
# 把附件 douyin-YYYY-MM-DD.db 重命名放到服务器
mv douyin-2026-07-01.db douyin.db
mv douyin.db /app/data/douyin.db
# 重启服务
pm2 restart douyin
```

### Docker 部署

```bash
# scp 上传到服务器
scp douyin-2026-07-01.db your-server:/tmp/douyin.db
# 覆盖容器内的数据库文件
docker cp /tmp/douyin.db douyin-app:/app/data/douyin.db
# 重启
docker restart douyin-app
```

### 本地开发

```bash
# 直接放到项目 data/ 目录
mv douyin-2026-07-01.db data/douyin.db
```
- 收件：youhuabujianye@gmail.com
- 时间：每天中午 12:00，页面也有手动备份按钮

## 模块

- `src/utils/db.js` — 导出 `initDB()`、`getPool()` 和 `getDB()`，接口兼容原 MySQL
- `src/utils/backup.js` — 数据库邮件备份，通过 `node-cron` 定时调度

## 备选方案

### Prisma

Node.js 数据库 ORM，用代码定义模型、自动生成迁移、类型安全的查询 API。

```js
// 定义模型 (schema.prisma)
model ParseRecord {
  id         Int      @id @default(autoincrement())
  openid     String
  platform   String?
  // ...
}

// 查询
const records = await prisma.parseRecord.findMany()
```

**当前项目不用**，只有一张表，`better-sqlite3` 直接写 SQL 更轻量。如果以后表多、字段变更频繁、多人协作，再迁移到 Prisma。
