const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'gallery.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    original_name TEXT,
    thumb_file TEXT NOT NULL,
    full_file TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    size_bytes INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at);
  CREATE INDEX IF NOT EXISTS idx_photos_author ON photos(author);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS likes (
    photo_id TEXT NOT NULL,
    guest_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (photo_id, guest_id)
  );
  CREATE INDEX IF NOT EXISTS idx_likes_photo ON likes(photo_id);
`);

function ensureColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(photos)').all().map((c) => c.name);
  if (!columns.includes(name)) {
    db.exec(`ALTER TABLE photos ADD COLUMN ${definition}`);
  }
}

ensureColumn('guest_id', 'guest_id TEXT');
// Foto caricate da /admin apposta come copertina, non collegate a nessun
// invitato: non devono comparire nella galleria né nel filtro autori.
ensureColumn('hidden', 'hidden INTEGER NOT NULL DEFAULT 0');

module.exports = db;
