require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const firebase = require('./firebase');
const supabase = require('./supabase');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const documentsRoutes = require('./documents');

const app = express();
// Enable CORS for all origins and handle preflight explicitly so Swagger UI can call the API
// Use wildcard origin '*' (no credentials) so public UIs can fetch the OpenAPI JSON.
const corsOptions = {
  origin: '*',
  credentials: false,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @openapi
 * /upload:
 *   post:
 *     summary: Upload a file to Firebase or Supabase Storage
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - project_id
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               project_id:
 *                 type: string
 *                 description: ID of the project this document belongs to
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document_id:
 *                   type: string
 *                   description: UUID of the created document
 *                 message:
 *                   type: string
 *                   example: upload successfully
 *                 name:
 *                   type: string
 *                 url:
 *                   type: string
 *                 document:
 *                   type: object
 *       400:
 *         description: Missing required fields
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

        // Require project_id in the multipart form
        const projectId = req.body.project_id || req.body.projectId;
        if (!projectId) return res.status(400).json({ error: 'project_id is required' });

        // Ensure database is configured
        if (!pool) return res.status(500).json({ error: 'DATABASE_URL not configured' });

        try {
          const id = uuidv4();
          const filename = originalName;
          const file_path = path;
          const source = 'Upload';
          const status = 'pending';
          const document_content = null;

          const insertQuery = `INSERT INTO documents (id, project_id, filename, file_path, source, status, document_content) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
          const { rows } = await pool.query(insertQuery, [id, projectId, filename, file_path, source, status, document_content]);

          // Return document_id and success message in response body
          return res.json({ document_id: rows[0].id, message: 'upload successfully', name: path, url: signedData.signedUrl });
        } catch (dbErr) {
          return res.status(500).json({ error: dbErr.message });
        }
      } catch (sbErr) {
        return res.status(500).json({ error: sbErr.message });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Removed generic project documents endpoint; use routes in `src/documents.js` instead.

const port = process.env.PORT || 3000;
// Serve a dynamic swagger JSON that sets `servers` to the current protocol+host
app.get('/swagger.json', (req, res) => {
  try {
    const spec = JSON.parse(JSON.stringify(swaggerSpec));
    spec.servers = [{ url: `${req.protocol}://${req.get('host')}` }];
    res.json(spec);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Configure Swagger UI to load the dynamic JSON so it matches the current deployment URL
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerUrl: '/swagger.json' }));

// Mount documents routes (requires `pool` for DB access)
app.use('/', documentsRoutes(pool));

app.listen(port, () => console.log(`Server listening on port ${port} - docs at /api-docs`));
