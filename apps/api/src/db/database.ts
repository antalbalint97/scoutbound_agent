import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRootDir = path.resolve(__dirname, "../..");
const repoRootDir = path.resolve(apiRootDir, "../..");

function resolvePathFromKnownRoots(relativePath: string): string {
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(apiRootDir, relativePath),
    path.resolve(repoRootDir, relativePath),
  ];

  const preferred = candidates.find(
    (candidate) => fs.existsSync(candidate) || fs.existsSync(path.dirname(candidate)),
  );

  return preferred ?? path.resolve(apiRootDir, relativePath);
}

function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) {
    return path.resolve(apiRootDir, "data/revon-tinyfish-demo.sqlite");
  }

  if (configured.startsWith("file:")) {
    const rawPath = configured.slice("file:".length);
    return path.isAbsolute(rawPath) ? rawPath : resolvePathFromKnownRoots(rawPath);
  }

  return path.isAbsolute(configured) ? configured : resolvePathFromKnownRoots(configured);
}

function resolveMigrationsDir(): string {
  return path.resolve(apiRootDir, "db/migrations");
}

let database: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (database) {
    return database;
  }

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

export function runMigrations(): void {
  const db = getDatabase();
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);",
  );

  const migrationsDir = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  const applied = new Set(
    db
      .prepare("SELECT id FROM schema_migrations ORDER BY applied_at ASC")
      .all()
      .map((row) => String((row as { id: string }).id)),
  );

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function closeDatabase(): void {
  database?.close();
  database = null;
}
