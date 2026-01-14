require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const firebase = require('./firebase');
const supabase = require('./supabase');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @openapi
 * /upload:
 *   post:
 *     summary: Upload a file to Firebase Storage
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 url:
 *                   type: string
 *       400:
 *         description: No file uploaded
 */
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const originalName = req.file.originalname;
    const timestamp = Date.now();
    const dest = `${timestamp}_${originalName}`;

    // Try Firebase first
    try {
      const bucket = firebase.getBucket();
      const file = bucket.file(dest);
      const stream = file.createWriteStream({
        metadata: { contentType: req.file.mimetype },
      });

      stream.on('error', (err) => {
        console.error('Upload error (firebase):', err);
        return res.status(500).json({ error: err.message });
      });

      stream.on('finish', async () => {
        try {
          const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
          res.json({ name: dest, url });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      stream.end(req.file.buffer);
      return;
    } catch (fbErr) {
      // Firebase not available; fall back to Supabase if configured
      if (!supabase) {
        return res.status(500).json({ error: fbErr.message });
      }
      try {
        const bucketName = process.env.SUPABASE_BUCKET;
        if (!bucketName) return res.status(500).json({ error: 'SUPABASE_BUCKET not configured' });
        const path = dest;
        const { error: upErr } = await supabase.storage.from(bucketName).upload(path, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });
        if (upErr) return res.status(500).json({ error: upErr.message });

        const { data: signedData, error: signedErr } = await supabase.storage.from(bucketName).createSignedUrl(path, 60 * 60);
        if (signedErr) return res.status(500).json({ error: signedErr.message });
        return res.json({ name: path, url: signedData.signedUrl });
      } catch (sbErr) {
        return res.status(500).json({ error: sbErr.message });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(port, () => console.log(`Server listening on port ${port} - docs at /api-docs`));
