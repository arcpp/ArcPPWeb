const axios = require('axios');
const cheerio = require('cheerio');

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const DATASET_CACHE = new Map();
const SOURCE_BASE = 'https://proteomecentral.proteomexchange.org';

function preferredDatasetUrl(datasetId) {
  const id = String(datasetId || '').trim().toUpperCase();
  if (!id) return `${SOURCE_BASE}/cgi/GetDataset`;

  // PRIDE project pages are generally more stable than ProteomeCentral CGI pages.
  if (/^(PXD|RPXD|PRXD)\d{6}$/.test(id)) {
    const canonical = id.startsWith('RPXD') ? id.slice(1) : id.startsWith('PRXD') ? `PXD${id.slice(4)}` : id;
    return `https://www.ebi.ac.uk/pride/archive/projects/${encodeURIComponent(canonical)}`;
  }

  return `${SOURCE_BASE}/cgi/GetDataset?ID=${encodeURIComponent(id)}`;
}

function normalizeExternalUrl(rawUrl, fallbackUrl = null) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return fallbackUrl;
  if (/^javascript:/i.test(raw)) return fallbackUrl;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^doi:\s*/i.test(raw)) {
    return `https://doi.org/${raw.replace(/^doi:\s*/i, '').trim()}`;
  }
  if (/^10\.\d{4,9}\//.test(raw)) return `https://doi.org/${raw}`;
  const pmid = raw.match(/^pmid:\s*(\d+)$/i);
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid[1]}/`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}($|\/)/i.test(raw)) return `https://${raw}`;
  try {
    return new URL(raw, SOURCE_BASE).href;
  } catch {
    return fallbackUrl;
  }
}

function cacheGet(id) {
  const hit = DATASET_CACHE.get(id);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    DATASET_CACHE.delete(id);
    return null;
  }
  return hit.data;
}

function cacheSet(id, data) {
  DATASET_CACHE.set(id, { ts: Date.now(), data });
}

async function scrapeProteomeCentral(datasetId) {
  const cached = cacheGet(datasetId);
  if (cached) return cached;

  const url = `${SOURCE_BASE}/cgi/GetDataset?ID=${encodeURIComponent(
    datasetId
  )}`;
  const { data: html } = await axios.get(url, {
    headers: {
      'User-Agent': 'ArcPP/1.0 (academic; mailto:lab@example.org)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 20000,
  });

  const $ = cheerio.load(html);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const eq = (s) => norm(s).toLowerCase();

  // Title
  const title =
    norm($('td:contains("Title")').first().next('td').text()) ||
    norm($('th:contains("Title")').first().next('td').text()) ||
    norm($('b:contains("Title")').parent().next().text()) ||
    null;

  // Publication List
  let firstPublicationRow = null;
  const citations = [];

  let headerEl = $('*:contains("Publication List")')
    .filter(function () {
      return eq($(this).text()) === 'publication list';
    })
    .first();

  let pubTable = $();
  if (headerEl.length) {
    pubTable = headerEl.nextAll('table').first();
    if (!pubTable.length) pubTable = headerEl.parent().nextAll('table').first();
    if (!pubTable.length) pubTable = headerEl.closest('tr,td,th,div').nextAll('table').first();
  }
  if (!pubTable.length && headerEl.length) {
    const allAfter = headerEl.nextAll().add(headerEl.parent().nextAll());
    pubTable = allAfter.filter('table').first();
  }

  const extractYear = (txt) => {
    const matches = txt.match(/(19|20)\d{2}/g);
    if (!matches || !matches.length) return null;
    return parseInt(matches[matches.length - 1], 10);
  };

  if (pubTable && pubTable.length) {
    const trs = pubTable.find('tr').toArray();
    const candidates = [];
    for (const tr of trs) {
      const $tr = $(tr);
      const text = norm($tr.text());
      if (!text) continue;
      if (text.length >= 40 && /[,.;)]/.test(text)) {
        candidates.push({ $tr, text, year: extractYear(text) });
      }
    }

    let chosen = null;
    const withYear = candidates.filter((c) => Number.isFinite(c.year));
    if (withYear.length) {
      withYear.sort((a, b) => b.year - a.year);
      chosen = withYear[0];
    } else if (candidates.length) {
      chosen = candidates[0];
    }

    if (chosen) {
      const $row = chosen.$tr;

      $row.find('a').each((_, a) => {
        const $a = $(a);
        const t = norm($a.text());
        const href = normalizeExternalUrl($a.attr('href'), null);
        if (/^\[[^\]]+\]$/.test(t)) {
          citations.push({ label: t.replace(/^\[|\]$/g, ''), url: href || null });
          return;
        }
        if (href && /pubmed/i.test(href)) {
          citations.push({ label: 'pubmed', url: href });
          return;
        }
        if (href && /doi\.org/i.test(href)) {
          citations.push({ label: 'doi', url: href });
        }
      });

      firstPublicationRow = norm(
        $row.clone().find('a').remove().end().text().replace(/\[[^\]]+\]/g, '')
      );
    }
  }

  const result = {
    id: datasetId,
    title,
    firstPublicationRow,
    citations,
    sourceUrl: preferredDatasetUrl(datasetId),
  };
  cacheSet(datasetId, result);
  return result;
}

async function fetchSummariesBatched(ids, batchSize = 4) {
  const out = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return await scrapeProteomeCentral(id);
        } catch (err) {
          console.warn('Scrape failed for', id, err.message);
          return {
            id,
            title: null,
            firstPublicationRow: null,
            citations: [],
            sourceUrl: preferredDatasetUrl(id),
          };
        }
      })
    );
    out.push(...results);
  }
  return out;
}

module.exports = { fetchSummariesBatched };
