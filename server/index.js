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

// Mount routers
app.use('/api', healthRoutes);
app.use('/api', proteinRoutes);
app.use('/api', speciesRoutes);
app.use('/api', datasetRoutes);
app.use('/api', proteinsSummaryRoutes);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // Rebuild the Redis protein caches from Mongo so they never silently go
  // stale. Non-blocking: existing keys (and the Mongo fallback) serve until
  // a rebuild lands. Runs once at boot, then on an interval so a species
  // ingested into a live server gets cache-accelerated with no restart.
  const { refreshProteinCache } = require('./services/cacheRefresh');
  const REFRESH_MIN = Math.max(1, parseInt(process.env.CACHE_REFRESH_INTERVAL_MIN || '30', 10));
  setImmediate(() => { refreshProteinCache(); });
  const timer = setInterval(() => { refreshProteinCache(); }, REFRESH_MIN * 60 * 1000);
  timer.unref();
  console.log(`[cache] periodic refresh every ${REFRESH_MIN} min`);
});

server.timeout = 120000;
