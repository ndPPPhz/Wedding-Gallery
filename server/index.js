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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_MB * 1024 * 1024,
    files: MAX_FILES_PER_UPLOAD,
  },
});

const insertPhoto = db.prepare(`
  INSERT INTO photos (id, author, original_name, thumb_file, full_file, width, height, size_bytes, created_at)
  VALUES (@id, @author, @originalName, @thumbFile, @fullFile, @width, @height, @sizeBytes, @createdAt)
`);

function toPhotoJSON(row) {
  return {
    id: row.id,
    author: row.author,
    thumbUrl: `/uploads/${row.thumb_file}`,
    fullUrl: `/uploads/${row.full_file}`,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

function sanitizeAuthor(raw) {
  return String(raw || '').trim().slice(0, 60);
}

app.get('/api/config', (req, res) => {
  res.json({ title: GALLERY_TITLE });
});

app.get('/api/authors', (req, res) => {
  const rows = db
    .prepare('SELECT author, COUNT(*) as count FROM photos GROUP BY author ORDER BY author COLLATE NOCASE')
    .all();
  res.json({ authors: rows });
});

app.get('/api/photos', (req, res) => {
  const author = sanitizeAuthor(req.query.author);
  const order = req.query.sort === 'asc' ? 'ASC' : 'DESC';

  const rows = author
    ? db.prepare(`SELECT * FROM photos WHERE author = ? ORDER BY created_at ${order}, rowid ${order}`).all(author)
    : db.prepare(`SELECT * FROM photos ORDER BY created_at ${order}, rowid ${order}`).all();

  res.json({ photos: rows.map(toPhotoJSON) });
});

app.post('/api/photos', upload.array('photos', MAX_FILES_PER_UPLOAD), async (req, res) => {
  const author = sanitizeAuthor(req.body.author);
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
      });

      results.push(
        toPhotoJSON({
          id,
          author,
          thumb_file: thumbFile,
          full_file: fullFile,
          width,
          height,
          created_at: createdAt,
        }),
      );
    } catch (err) {
      console.error(`Impossibile elaborare "${file.originalname}":`, err.message);
      errors.push(file.originalname);
    }
  }

  res.status(results.length > 0 ? 201 : 422).json({ photos: results, failed: errors });
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
