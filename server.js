import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { request as httpRequest } from 'http';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve vendor libraries from node_modules
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));

// Proxy /api/* to the Python Flask backend on port 6001
const FLASK_PORT = process.env.FLASK_PORT || 6001;
app.use('/api', (req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: FLASK_PORT,
    path: '/api' + req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${FLASK_PORT}` },
  };
  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', (err) => {
    console.error('[PROXY] Flask backend error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: 'Backend unavailable. Ensure the Python server is running on port ' + FLASK_PORT });
    }
  });
  req.pipe(proxyReq, { end: true });
});

// Serve index.html for root and navigation routes only (SPA)
// NOTE: Static files must be served FIRST before this catch-all
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Only catch routes that don't look like files (no dot in the last segment)
app.get(/^(?!.*\.).*$/, (req, res) => {
  // This matches routes without a file extension (like /#timetable)
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 SmartAMS Frontend running at http://localhost:${PORT}`);
});
