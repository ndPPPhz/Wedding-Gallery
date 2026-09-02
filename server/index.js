require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const db = require('./db');
const { processUpload } = require('./imageProcessing');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads'));
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 25);
const MAX_FILES_PER_UPLOAD = Number(process.env.MAX_FILES_PER_UPLOAD || 20);
const GALLERY_TITLE = process.env.GALLERY_TITLE || 'La Nostra Galleria';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_MB * 1024 * 1024,
    files: MAX_FILES_PER_UPLOAD,
  },
});

const insertPhoto = db.prepare(`
  INSERT INTO photos (id, author, original_name, thumb_file, full_file, width, height, size_bytes, created_at, guest_id)
  VALUES (@id, @author, @originalName, @thumbFile, @fullFile, @width, @height, @sizeBytes, @createdAt, @guestId)
`);

function toPhotoJSON(row, requesterGuestId) {
  return {
    id: row.id,
    author: row.author,
    thumbUrl: `/uploads/${row.thumb_file}`,
    fullUrl: `/uploads/${row.full_file}`,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    // L'id del dispositivo che ha caricato la foto non viene mai esposto:
    // solo questo booleano, calcolato confrontandolo con quello del
    // richiedente, così un altro invitato non può "rubarlo" dalla risposta
    // pubblica e usarlo per eliminare foto altrui.
    mine: Boolean(requesterGuestId && row.guest_id && row.guest_id === requesterGuestId),
    likeCount: row.like_count || 0,
    likedByMe: Boolean(row.liked_by_me),
  };
}

function sanitizeAuthor(raw) {
  return String(raw || '').trim().slice(0, 60);
}

function sanitizeGuestId(raw) {
  return String(raw || '').trim().slice(0, 100);
}

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
);
const deleteSettingStmt = db.prepare('DELETE FROM settings WHERE key = ?');

function getCoverPhoto() {
  const row = getSettingStmt.get('cover_photo_id');
  if (!row) return null;
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(row.value);
  return photo ? toPhotoJSON(photo) : null;
}

function isValidAdminPassword(provided) {
  if (!ADMIN_PASSWORD || !provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(ADMIN_PASSWORD);
  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Zona admin non configurata: imposta ADMIN_PASSWORD nel .env.' });
  }
  if (!isValidAdminPassword(req.get('x-admin-password'))) {
    return res.status(401).json({ error: 'Password non valida.' });
  }
  next();
}

app.get('/api/config', (req, res) => {
  res.json({ title: GALLERY_TITLE, coverPhoto: getCoverPhoto() });
});

app.get('/api/authors', (req, res) => {
  const rows = db
    .prepare('SELECT author, COUNT(*) as count FROM photos GROUP BY author ORDER BY author COLLATE NOCASE')
    .all();
  res.json({ authors: rows });
});

app.get('/api/photos', (req, res) => {
  const author = sanitizeAuthor(req.query.author);
  const guestId = sanitizeGuestId(req.query.guestId);

  const orderBy =
    req.query.sort === 'likes'
      ? 'like_count DESC, p.created_at DESC, p.rowid DESC'
      : req.query.sort === 'asc'
        ? 'p.created_at ASC, p.rowid ASC'
        : 'p.created_at DESC, p.rowid DESC';

  const params = [guestId];
  let where = '';
  if (author) {
    where = 'WHERE p.author = ?';
    params.push(author);
  }

  const rows = db
    .prepare(
      `SELECT p.*, COUNT(l.guest_id) AS like_count,
              MAX(CASE WHEN l.guest_id = ? THEN 1 ELSE 0 END) AS liked_by_me
       FROM photos p
       LEFT JOIN likes l ON l.photo_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY ${orderBy}`,
    )
    .all(...params);

  res.json({ photos: rows.map((row) => toPhotoJSON(row, guestId)) });
});

app.post('/api/photos', upload.array('photos', MAX_FILES_PER_UPLOAD), async (req, res) => {
  const author = sanitizeAuthor(req.body.author);
  const guestId = sanitizeGuestId(req.body.guestId);
  if (!author) {
    return res.status(400).json({ error: 'Il nome è obbligatorio.' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nessuna foto ricevuta.' });
  }

  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const id = crypto.randomUUID();
      const { thumbFile, fullFile, width, height, sizeBytes } = await processUpload(
        file.buffer,
        file.originalname,
        UPLOAD_DIR,
        id,
      );
      const createdAt = new Date().toISOString();

      insertPhoto.run({
        id,
        author,
        originalName: file.originalname,
        thumbFile,
        fullFile,
        width,
        height,
        sizeBytes,
        createdAt,
        guestId: guestId || null,
      });

      results.push(
        toPhotoJSON(
          {
            id,
            author,
            thumb_file: thumbFile,
            full_file: fullFile,
            width,
            height,
            size_bytes: sizeBytes,
            created_at: createdAt,
            guest_id: guestId || null,
          },
          guestId,
        ),
      );
    } catch (err) {
      console.error(`Impossibile elaborare "${file.originalname}":`, err.message);
      errors.push(file.originalname);
    }
  }

  res.status(results.length > 0 ? 201 : 422).json({ photos: results, failed: errors });
});

app.get('/api/admin/check', requireAdmin, (req, res) => {
  res.status(204).end();
});

app.delete('/api/photos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Foto non trovata.' });
  }

  const isAdmin = isValidAdminPassword(req.get('x-admin-password'));
  const requestGuestId = sanitizeGuestId(req.get('x-guest-id'));
  const isOwner = Boolean(row.guest_id) && requestGuestId === row.guest_id;

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'Non puoi eliminare questa foto.' });
  }

  for (const file of [row.thumb_file, row.full_file]) {
    fs.rmSync(path.join(UPLOAD_DIR, file), { force: true });
  }
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM likes WHERE photo_id = ?').run(req.params.id);

  const coverRow = getSettingStmt.get('cover_photo_id');
  if (coverRow && coverRow.value === req.params.id) {
    deleteSettingStmt.run('cover_photo_id');
  }

  res.status(204).end();
});

function likeCountFor(photoId) {
  return db.prepare('SELECT COUNT(*) AS c FROM likes WHERE photo_id = ?').get(photoId).c;
}

app.post('/api/photos/:id/like', (req, res) => {
  const guestId = sanitizeGuestId(req.get('x-guest-id'));
  if (!guestId) {
    return res.status(400).json({ error: 'guestId mancante.' });
  }
  const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) {
    return res.status(404).json({ error: 'Foto non trovata.' });
  }

  db.prepare('INSERT OR IGNORE INTO likes (photo_id, guest_id, created_at) VALUES (?, ?, ?)').run(
    req.params.id,
    guestId,
    new Date().toISOString(),
  );

  res.json({ likeCount: likeCountFor(req.params.id), likedByMe: true });
});

app.delete('/api/photos/:id/like', (req, res) => {
  const guestId = sanitizeGuestId(req.get('x-guest-id'));
  if (!guestId) {
    return res.status(400).json({ error: 'guestId mancante.' });
  }

  db.prepare('DELETE FROM likes WHERE photo_id = ? AND guest_id = ?').run(req.params.id, guestId);

  res.json({ likeCount: likeCountFor(req.params.id), likedByMe: false });
});

app.post('/api/admin/cover', requireAdmin, (req, res) => {
  const photoId = req.body && req.body.photoId;
  if (!photoId) {
    deleteSettingStmt.run('cover_photo_id');
    return res.status(204).end();
  }

  const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(photoId);
  if (!photo) {
    return res.status(404).json({ error: 'Foto non trovata.' });
  }

  setSettingStmt.run('cover_photo_id', photoId);
  res.status(204).end();
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');

app.get('/', (req, res) => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const cover = getCoverPhoto();

  const ogTitle = GALLERY_TITLE;
  const ogDescription = `${GALLERY_TITLE} — carica e guarda le foto del matrimonio`;
  const ogImage = `${baseUrl}${cover ? cover.fullUrl : '/og-image.png'}`;

  const rendered = html
    .replaceAll('__OG_TITLE__', escapeHtml(ogTitle))
    .replaceAll('__OG_DESCRIPTION__', escapeHtml(ogDescription))
    .replaceAll('__OG_IMAGE__', ogImage)
    .replaceAll('__OG_URL__', `${baseUrl}/`);

  res.type('html').send(rendered);
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `Foto troppo grande (limite ${MAX_FILE_MB}MB).` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: `Troppe foto in un colpo solo (limite ${MAX_FILES_PER_UPLOAD}).` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server.' });
});

app.listen(PORT, () => {
  console.log(`Wedding Gallery in ascolto su http://localhost:${PORT}`);
});
