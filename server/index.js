// Express server entry: loads env, connects MongoDB, mounts the /api routes, and
// starts the background Redis cache refresh after the server is listening.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const connectToMongo = require('./mongo/connect');

// Route modules
const healthRoutes = require('./routes/health');
const proteinRoutes = require('./routes/proteins');
const speciesRoutes = require('./routes/species');
const datasetRoutes = require('./routes/datasets');
const proteinsSummaryRoutes = require('./routes/proteinsSummary');

connectToMongo();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(compression());
app.set('etag', 'strong');
app.use(cors());
app.use(express.json());

const { refreshProteinCache } = require('./services/cacheRefresh');

// Manual cache refresh — call this after a re-ingest to rebuild the (persistent)
// Redis caches without a restart. Protected by a shared token: set
// CACHE_REFRESH_TOKEN in the server env and send it as the x-refresh-token
// header. Disabled (503) when the token isn't configured, so it can't be abused
// to trigger an expensive full rebuild.
app.post('/api/admin/refresh-cache', (req, res) => {
  const expected = process.env.CACHE_REFRESH_TOKEN;
  if (!expected) return res.status(503).json({ error: 'Refresh endpoint disabled (set CACHE_REFRESH_TOKEN)' });
  if (req.get('x-refresh-token') !== expected) return res.status(401).json({ error: 'Unauthorized' });
  // Fire-and-forget: rebuild in the background, respond immediately.
  setImmediate(() => { refreshProteinCache(true); });
  res.status(202).json({ status: 'refresh started' });
});

// Mount routers
app.use('/api', healthRoutes);
app.use('/api', proteinRoutes);
app.use('/api', speciesRoutes);
app.use('/api', datasetRoutes);
app.use('/api', proteinsSummaryRoutes);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // Warm the (persistent, AOF-backed) Redis caches from Mongo once at boot.
  // refreshProteinCache no-ops if the cache is already warm (the sentinel key
  // survives restarts), so a redeploy doesn't re-scan MongoDB. The data only
  // changes on a re-ingest, after which POST /api/admin/refresh-cache rebuilds.
  setImmediate(() => { refreshProteinCache(); });
});

server.timeout = 120000;
