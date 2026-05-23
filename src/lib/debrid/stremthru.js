import {createHash} from 'crypto';
import path from 'path';
import config from '../config.js';

export const PENDING_STATUSES = new Set(['queued', 'downloading', 'processing', 'uploading']);
export const READY_STATUSES = new Set(['cached', 'downloaded']);
export const FAILED_STATUSES = new Set(['failed', 'invalid']);

const apiCache = new Map();
const MAX_CACHE_ENTRIES = 500;
const DEFAULT_STREMTHRU_URL = 'https://stremthrufortheweak.nhyira.dev';

export function getStremThruUrl(options = {}){
  return String(options.stremthruUrl || config.stremthruUrl || process.env.STREMTHRU_URL || DEFAULT_STREMTHRU_URL).replace(/\/+$/, '');
}

function setCache(key, dataOrPromise, ttlMs){
  if(apiCache.has(key)){
    apiCache.delete(key);
  }else if(apiCache.size >= MAX_CACHE_ENTRIES){
    apiCache.delete(apiCache.keys().next().value);
  }
  apiCache.set(key, {data: dataOrPromise, expiresAt: Date.now() + ttlMs});
}

function getCache(key){
  if(!apiCache.has(key))return null;
  const item = apiCache.get(key);
  if(item.expiresAt <= Date.now()){
    apiCache.delete(key);
    return null;
  }
  apiCache.delete(key);
  apiCache.set(key, item);
  return item.data;
}

function buildHeaders(entry){
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'X-StremThru-Store-Name': entry.service,
    'X-StremThru-Store-Authorization': `Bearer ${entry.apiKey}`,
    'User-Agent': 'Jackettio/1.0'
  };
}

async function readJsonResponse(res){
  const data = await res.json().catch(() => ({}));
  if(res.status >= 400){
    const err = new Error(`StremThru request failed with status ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function normalizeStoreFile(file = {}){
  const index = file.index !== undefined ? file.index : -1;
  const filePath = file.path || file.name || 'Unknown';
  return {
    id: index,
    index,
    name: file.name || path.basename(filePath),
    path: filePath,
    size: file.size !== undefined ? file.size : 0,
    url: file.link || '',
    ready: !!file.link
  };
}

export function mapTorzItem(item = {}){
  const status = String(item.status || 'unknown').toLowerCase();
  const hash = String(item.hash || '').toLowerCase();
  return {
    hash,
    status,
    isCached: READY_STATUSES.has(status),
    isPending: PENDING_STATUSES.has(status),
    isFailed: FAILED_STATUSES.has(status),
    files: Array.isArray(item.files) ? item.files.map(normalizeStoreFile) : []
  };
}

function serviceCacheKey(prefix, entry, extra){
  return `${prefix}:${entry.service}:${getUserHash(entry)}:${extra}`;
}

export async function checkStoreTorz(hashes, entry, options = {}){
  if(!Array.isArray(hashes) || hashes.length == 0)return {};

  const useCache = options.cache !== false;
  const hashKey = hashes.map(String).sort().join(',');
  const cacheKey = serviceCacheKey('torz-check', entry, hashKey);
  const cached = useCache ? getCache(cacheKey) : null;
  if(cached)return cached;

  const fetchImpl = options.fetchImpl || fetch;
  const performFetch = async () => {
    const results = {};
    const chunkSize = options.chunkSize || 500;
    try {
      for(let i = 0; i < hashes.length; i += chunkSize){
        const chunk = hashes.slice(i, i + chunkSize);
        const url = `${getStremThruUrl(options)}/v0/store/torz/check?hash=${chunk.join(',')}`;
        const data = await readJsonResponse(await fetchImpl(url, {
          method: 'GET',
          headers: buildHeaders(entry),
          signal: options.signal
        }));
        const items = data?.data?.items || [];
        items.forEach(item => {
          const mapped = mapTorzItem(item);
          if(mapped.hash)results[mapped.hash] = mapped;
        });
      }
      return {data: results, ttl: 60000};
    }catch(err){
      console.log(`[StremThru ${entry.service} Check Error] ${err.message || err}`);
      const ttl = err.status === 401 || err.status === 403 ? 3600000 : err.status === 429 ? 30000 : 10000;
      return {data: {}, ttl};
    }
  };

  const promise = performFetch().then(result => {
    if(useCache)setCache(cacheKey, result.data, result.ttl);
    return result.data;
  });
  if(useCache)setCache(cacheKey, promise, 10000);
  return promise;
}

export async function addStoreTorz(link, entry, options = {}){
  const fetchImpl = options.fetchImpl || fetch;
  const data = await readJsonResponse(await fetchImpl(`${getStremThruUrl(options)}/v0/store/torz`, {
    method: 'POST',
    headers: buildHeaders(entry),
    body: JSON.stringify({link}),
    signal: options.signal
  }));
  return mapTorzItem(data?.data || {});
}

export async function generateStoreLink(link, entry, options = {}){
  const fetchImpl = options.fetchImpl || fetch;
  const data = await readJsonResponse(await fetchImpl(`${getStremThruUrl(options)}/v0/store/torz/link/generate`, {
    method: 'POST',
    headers: buildHeaders(entry),
    body: JSON.stringify({link}),
    signal: options.signal
  }));
  return data?.data?.link || '';
}

export async function checkStoreUser(entry, options = {}){
  const fetchImpl = options.fetchImpl || fetch;
  const data = await readJsonResponse(await fetchImpl(`${getStremThruUrl(options)}/v0/store/user`, {
    method: 'GET',
    headers: buildHeaders(entry),
    signal: options.signal
  }));
  return data?.data || null;
}

export function getUserHash(entry){
  return createHash('md5').update(`${entry.service}:${entry.apiKey}`).digest('hex');
}
