import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import logger from '../logger'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database
  }
}

function isDbInited(db: Database.Database): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations';`)
  return row.get() !== undefined
}

function applyMigrationIfNeeded(db: Database.Database, name: string, sql: string) {
  const row = db.prepare(`SELECT COUNT(*) as count FROM migrations WHERE name = ?;`).get(name) as {
    count: number
  }
  if (row.count === 0) {
    const transaction = db.transaction(() => {
      db.exec(sql)
      const stmt = db.prepare(
        `INSERT INTO migrations (name, applied_at) VALUES (?, datetime('now'));`,
      )
      stmt.run(name)
    })
    transaction()
    logger.info(`Applied migration: ${name}`)
  } else {
    logger.debug(`Migration already applied: ${name}`)
  }
}

const databasePlugin: FastifyPluginAsync<{ filePath: string }> = async (fastify, options) => {
  const folder = path.dirname(options.filePath)

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }

  const db = new Database(options.filePath)

  db.pragma('foreign_keys = ON')

  if (!isDbInited(db)) {
    logger.info(`Initializing new database at ${options.filePath}`)
    const initSql = `
CREATE TABLE migrations (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	applied_at DATETIME NOT NULL
);
`
    db.exec(initSql)
  }

  const migrationsDir = path.join(__dirname, '../migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'))

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file)
    const sql = fs.readFileSync(filePath, 'utf-8')
    applyMigrationIfNeeded(db, file.replace('.sql', ''), sql)
  }

  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    db.close()
  })
}

export default fp(databasePlugin)
