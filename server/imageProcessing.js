const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises');

const THUMB_WIDTH = 500;
const FULL_MAX_EDGE = 2000;
const THUMB_QUALITY = 70;
const FULL_QUALITY = 82;

const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);

async function toDecodable(buffer, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (HEIC_EXTENSIONS.has(ext)) {
    // sharp/libvips often lacks HEIC support depending on how it was built,
    // so iPhone photos are converted to JPEG first with a dedicated decoder.
    const convert = require('heic-convert');
    return convert({ buffer, format: 'JPEG', quality: 0.92 });
  }
  return buffer;
}

async function processUpload(buffer, originalName, destDir, baseId) {
  const decodableBuffer = await toDecodable(buffer, originalName);

  // .rotate() applies the EXIF orientation once, then sharp drops metadata
  // (including GPS) on output by default since .withMetadata() isn't called.
  const base = sharp(decodableBuffer).rotate();
  const metadata = await base.metadata();

  const thumbFile = `${baseId}_thumb.webp`;
  const fullFile = `${baseId}_full.webp`;
  const thumbPath = path.join(destDir, thumbFile);
  const fullPath = path.join(destDir, fullFile);

  await base
    .clone()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toFile(thumbPath);

  await base
    .clone()
    .resize({ width: FULL_MAX_EDGE, height: FULL_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: FULL_QUALITY })
    .toFile(fullPath);

  const fullStat = await fs.stat(fullPath);

  return {
    thumbFile,
    fullFile,
    width: metadata.width,
    height: metadata.height,
    sizeBytes: fullStat.size,
  };
}

module.exports = { processUpload };
