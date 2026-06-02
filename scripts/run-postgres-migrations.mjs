import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING

if (!connectionString) {
  console.error('DATABASE_URL or POSTGRES_URL is required to run migrations.')
  process.exit(1)
}

const ssl =
  process.env.IOTBRIDGE_POSTGRES_SSL === 'true'
    ? { rejectUnauthorized: false }
    : process.env.IOTBRIDGE_POSTGRES_SSL === 'false'
      ? false
      : undefined

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const migrationsDir = path.join(rootDir, 'database', 'migrations')
const pool = new Pool({ connectionString, ssl })

function checksum(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function getMigrationFiles() {
  const files = await readdir(migrationsDir)
  return files.filter((file) => file.endsWith('.sql')).sort()
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

async function loadAppliedMigrations(client) {
  const result = await client.query('SELECT filename, checksum FROM schema_migrations')
  return new Map(result.rows.map((row) => [row.filename, row.checksum]))
}

async function applyMigration(client, filename, sql, hash) {
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [filename, hash])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function main() {
  const client = await pool.connect()
  try {
    await ensureMigrationTable(client)
    const applied = await loadAppliedMigrations(client)
    const files = await getMigrationFiles()

    if (files.length === 0) {
      console.log('No migration files found.')
      return
    }

    let appliedCount = 0
    for (const filename of files) {
      const filePath = path.join(migrationsDir, filename)
      const sql = await readFile(filePath, 'utf8')
      const hash = checksum(sql)
      const previousHash = applied.get(filename)

      if (previousHash === hash) {
        console.log(`Skipping ${filename}; already applied.`)
        continue
      }

      if (previousHash && previousHash !== hash) {
        throw new Error(
          `Migration ${filename} was already applied with a different checksum. Create a new migration instead of editing it.`
        )
      }

      console.log(`Applying ${filename}...`)
      await applyMigration(client, filename, sql, hash)
      appliedCount += 1
    }

    console.log(appliedCount === 0 ? 'Database is already up to date.' : `Applied ${appliedCount} migration(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
