const express = require('express');
const supabase = require('./supabase');

module.exports = (pool) => {
  const router = express.Router();

  /**
   * @openapi
   * /documents/project/{project_id}/upload-or-other:
   *   get:
   *     summary: Retrieve documents for a project where source is Upload or Other
   *     parameters:
   *       - in: path
   *         name: project_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Documents retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 documents:
   *                   type: array
   *                   items:
   *                     type: object
   */
  // Get documents for a project where source is Upload or Other
  router.get('/documents/project/:project_id/upload-or-other', async (req, res) => {
    try {
      const projectId = req.params.project_id;
      if (!projectId) return res.status(400).json({ error: 'project_id is required' });
      if (!pool) return res.status(500).json({ error: 'DATABASE_URL not configured' });

      const query = `SELECT * FROM documents WHERE project_id = $1 AND lower(source) IN ('upload','other') ORDER BY filename`;
      const { rows } = await pool.query(query, [projectId]);

      return res.json({ documents: rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /documents/project/{project_id}/scraped:
   *   get:
   *     summary: Retrieve documents for a project where source is Scrape
   *     parameters:
   *       - in: path
   *         name: project_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Scraped documents retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 documents:
   *                   type: array
   *                   items:
   *                     type: object
   */
  // Get documents for a project where source is scrape
  router.get('/documents/project/:project_id/scraped', async (req, res) => {
    try {
      const projectId = req.params.project_id;
      if (!projectId) return res.status(400).json({ error: 'project_id is required' });
      if (!pool) return res.status(500).json({ error: 'DATABASE_URL not configured' });

      const query = `SELECT id, filename AS file_name, created_at, status FROM documents WHERE project_id = $1 AND lower(source) = 'scrape' ORDER BY filename`;
      const { rows } = await pool.query(query, [projectId]);

      return res.json({ documents: rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /documents/scrape/{document_id}:
   *   get:
   *     summary: Retrieve a single scraped document by document_id
   *     parameters:
   *       - in: path
   *         name: document_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Scraped document retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 document:
   *                   type: object
   */
  // Retrieve a single scraped document by id and return a preview URL for scraped or uploaded files
  /**
   * @openapi
   * /documents/scrape/{document_id}:
   *   get:
   *     summary: Retrieve a preview URL for a document (scraped or uploaded)
   *     parameters:
   *       - in: path
   *         name: document_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Preview URL returned
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 preview_url:
   *                   type: string
   */
  router.get('/documents/scrape/:document_id', async (req, res) => {
    try {
      const id = req.params.document_id;
      if (!id) return res.status(400).json({ error: 'document_id is required' });
      if (!pool) return res.status(500).json({ error: 'DATABASE_URL not configured' });

      const query = `SELECT * FROM documents WHERE id = $1`;
      const { rows } = await pool.query(query, [id]);
      if (!rows.length) return res.status(404).json({ error: 'document not found' });

      const doc = rows[0];
      const filename = doc.filename || '';
      
      if (!filename) {
        return res.status(500).json({ error: 'Document filename not found in database' });
      }

      // Use Supabase signed URL for inline preview (not download)
      const supabaseUrl = process.env.SUPABASE_URL;
      const bucket = process.env.SUPABASE_BUCKET;
      
      if (supabase && supabaseUrl && bucket) {
        const normalized = filename.replace(/^\/+/, '');
        try {
          // Generate signed URL with 1 hour expiry for inline preview
          const { data: signedData, error: signedErr } = await supabase.storage
            .from(bucket)
            .createSignedUrl(normalized, 3600);
          
          if (!signedErr && signedData && signedData.signedUrl) {
            return res.json({ preview_url: signedData.signedUrl });
          }
          
          // Fallback to public URL if signed URL fails
          const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${encodeURIComponent(normalized)}`;
          return res.json({ preview_url: publicUrl });
        } catch (e) {
          return res.status(500).json({ error: `Failed to generate preview URL: ${e.message}` });
        }
      }

      // Fallback for Firebase if Supabase not configured
      const fbBucket = process.env.FIREBASE_STORAGE_BUCKET;
      if (fbBucket) {
        const normalized = filename.replace(/^\/+/, '');
        const preview = `https://firebasestorage.googleapis.com/v0/b/${fbBucket}/o/${encodeURIComponent(normalized)}?alt=media`;
        return res.json({ preview_url: preview });
      }

      return res.status(500).json({ error: 'Storage not configured for preview URL generation' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /documents/project/{project_id}/summary:
   *   get:
   *     summary: Document summary counts by source and status for a project
   *     parameters:
   *       - in: path
   *         name: project_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Summary counts returned
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  router.get('/documents/project/:project_id/summary', async (req, res) => {
    try {
      const projectId = req.params.project_id;
      if (!projectId) return res.status(400).json({ error: 'project_id is required' });
      if (!pool) return res.status(500).json({ error: 'DATABASE_URL not configured' });

      const q = `SELECT source, status, COUNT(*)::int AS count FROM documents WHERE project_id = $1 GROUP BY source, status`;
      const { rows } = await pool.query(q, [projectId]);

      const summary = {};
      let total_processed = 0;
      let total_analysed = 0;
      let total_all = 0;

      for (const r of rows) {
        const src = r.source || 'unknown';
        const status = r.status || 'unknown';
        const cnt = r.count || 0;
        total_all += cnt;

        if (!summary[src]) summary[src] = { status: {}, total: 0 };
        summary[src].status[status] = (summary[src].status[status] || 0) + cnt;
        summary[src].total += cnt;

        if (String(status).toLowerCase() === 'processed') total_processed += cnt;
        if (String(status).toLowerCase() === 'analysed' || String(status).toLowerCase() === 'analyzed') total_analysed += cnt;
      }

      return res.json({ sources: summary, total_processed, total_analysed, total: total_all });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
