// ─── Multer config: accept .tif / .tiff / .png / .jpg ───────────────────────
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ts = Date.now();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `field_${ts}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const allowed = ['.tif', '.tiff', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
};

module.exports = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
});
