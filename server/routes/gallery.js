const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { stmts } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Gallery upload directory (persistent disk)
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const galleryDir = path.join(dataDir, 'gallery');
if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });

// Multer config — only allow images, max 5MB
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(12).toString('hex') + ext;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (allowedExt.includes(ext) && allowedMime.includes(mime)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// --- PUBLIC: Get all gallery images ---
router.get('/', (req, res) => {
  try {
    const images = stmts.getGalleryImages.all();
    res.json({ success: true, data: images });
  } catch (err) {
    console.error('Gallery fetch error:', err);
    res.status(500).json({ error: 'Failed to load gallery.' });
  }
});

// --- ADMIN: Upload image ---
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    try {
      const label_hr = req.body.label_hr || '';
      const label_en = req.body.label_en || '';
      const sort_order = parseInt(req.body.sort_order) || 0;

      const result = stmts.insertGalleryImage.run({
        filename: req.file.filename,
        label_hr,
        label_en,
        sort_order
      });

      res.json({
        success: true,
        data: {
          id: result.lastInsertRowid,
          filename: req.file.filename,
          label_hr,
          label_en,
          sort_order
        }
      });
    } catch (dbErr) {
      // Clean up uploaded file on DB error
      fs.unlink(req.file.path, () => {});
      console.error('Gallery insert error:', dbErr);
      res.status(500).json({ error: 'Failed to save image.' });
    }
  });
});

// --- ADMIN: Update image labels/order ---
router.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const image = stmts.getGalleryImageById.get(id);
    if (!image) return res.status(404).json({ error: 'Image not found.' });

    const { label_hr, label_en, sort_order } = req.body;
    stmts.updateGalleryImage.run({
      id,
      label_hr: label_hr ?? image.label_hr,
      label_en: label_en ?? image.label_en,
      sort_order: sort_order !== undefined ? parseInt(sort_order) : image.sort_order
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Gallery update error:', err);
    res.status(500).json({ error: 'Failed to update image.' });
  }
});

// --- ADMIN: Delete image ---
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const image = stmts.getGalleryImageById.get(id);
    if (!image) return res.status(404).json({ error: 'Image not found.' });

    // Delete from DB
    stmts.deleteGalleryImage.run(id);

    // Delete file from disk
    const filePath = path.join(galleryDir, image.filename);
    fs.unlink(filePath, (err) => {
      if (err) console.error('File delete error:', err);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Gallery delete error:', err);
    res.status(500).json({ error: 'Failed to delete image.' });
  }
});

module.exports = router;
