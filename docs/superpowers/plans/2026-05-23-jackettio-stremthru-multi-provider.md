# Jackettio StremThru Multi-Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jackettio's single native debrid integration with a breaking-change StremThru-backed `debridServices[]` model that supports multiple providers and reliable cached-only filtering.

**Architecture:** Add a small provider registry, user-config normalizer, and ESM StremThru client, then refactor Jackettio stream/download code to expand each torrent across configured provider entries. Keep Jackett search, torrent parsing, private tracker passkey logic, MediaFlow wrapping, and existing error-video routes in place.

**Tech Stack:** Node.js ESM, Express, built-in `node:test`, built-in `fetch`, StremThru `/v0/store/torz/*` API, existing Jackettio helpers.

---

## File Structure

- Create `src/lib/debrid/services.js`: provider registry with supported service IDs, labels, display names, and API key help URLs.
- Create `src/lib/userConfig.js`: normalize user config, validate `debridServices`, ignore legacy `debridId` / `debridApiKey`, and build manifest provider labels.
- Replace `src/lib/debrid.js`: facade over registry and StremThru operations; keep `ERROR` export for existing route error handling.
- Create `src/lib/debrid/stremthru.js`: StremThru HTTP client and response mapping.
- Modify `src/lib/config.js`: add `debridServices: []` to `defaultUserConfig` and optional `stremthruUrl` setting.
- Modify `src/lib/jackettio.js`: remove single `debridInstance`, expand stream entries by provider index, enforce `hideUncached`, and resolve downloads by `serviceIndex`.
- Modify `src/index.js`: render `debridServices` metadata into configure page, build manifest labels from normalized config, and change download route to include `:serviceIndex`.
- Modify `src/template/configure.html`: replace single debrid dropdown/API key with repeatable provider rows.
- Modify `package.json`: add `test` script.
- Create `tests/userConfig.test.js`, `tests/debrid-services.test.js`, `tests/stremthru.test.js`, and `tests/stream-mapping.test.js`.

## Task 1: Test Harness, Registry, and Config Normalization

**Files:**
- Modify: `package.json`
- Modify: `src/lib/config.js`
- Create: `src/lib/debrid/services.js`
- Create: `src/lib/userConfig.js`
- Create: `tests/debrid-services.test.js`
- Create: `tests/userConfig.test.js`

- [ ] **Step 1: Add failing tests for provider registry**

Create `tests/debrid-services.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {getService, listServices, isSupportedService} from '../src/lib/debrid/services.js';

test('service registry exposes the Nexio-Torii StremThru providers', () => {
  assert.deepEqual(listServices().map(service => service.id), [
    'realdebrid',
    'torbox',
    'alldebrid',
    'premiumize',
    'debridlink',
    'debrider',
    'easydebrid',
    'offcloud',
    'pikpak'
  ]);
});

test('registry returns display metadata for manifest and configure page', () => {
  assert.equal(getService('realdebrid').shortName, 'RD');
  assert.equal(getService('premiumize').name, 'Premiumize');
  assert.equal(getService('debridlink').href.label, 'Get API Key Here');
});

test('registry rejects unsupported services', () => {
  assert.equal(isSupportedService('realdebrid'), true);
  assert.equal(isSupportedService('unknown'), false);
  assert.equal(getService('unknown'), null);
});
```

- [ ] **Step 2: Add failing tests for config normalization**

Create `tests/userConfig.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/lib/config.js';
import {getProviderLabel, normalizeUserConfig} from '../src/lib/userConfig.js';

test('normalizeUserConfig keeps valid debridServices and drops malformed entries', async () => {
  const normalized = await normalizeUserConfig({
    debridServices: [
      {service: 'realdebrid', apiKey: ' rd-key '},
      {service: 'unknown', apiKey: 'bad'},
      {service: 'premiumize', apiKey: ''},
      {service: 'premiumize', apiKey: 'pm-key'}
    ],
    hideUncached: true
  });

  assert.equal(normalized.hideUncached, true);
  assert.deepEqual(normalized.debridServices, [
    {service: 'realdebrid', apiKey: 'rd-key'},
    {service: 'premiumize', apiKey: 'pm-key'}
  ]);
});

test('normalizeUserConfig ignores legacy debridId and debridApiKey', async () => {
  const normalized = await normalizeUserConfig({
    debridId: 'realdebrid',
    debridApiKey: 'legacy-key',
    debridServices: [{service: 'torbox', apiKey: 'tb-key'}]
  });

  assert.deepEqual(normalized.debridServices, [
    {service: 'torbox', apiKey: 'tb-key'}
  ]);
  assert.equal(Object.hasOwn(normalized, 'debridId'), false);
  assert.equal(Object.hasOwn(normalized, 'debridApiKey'), false);
});

test('normalizeUserConfig preserves duplicate services as distinct accounts', async () => {
  const normalized = await normalizeUserConfig({
    debridServices: [
      {service: 'realdebrid', apiKey: 'first'},
      {service: 'realdebrid', apiKey: 'second'}
    ]
  });

  assert.deepEqual(normalized.debridServices, [
    {service: 'realdebrid', apiKey: 'first'},
    {service: 'realdebrid', apiKey: 'second'}
  ]);
});

test('normalizeUserConfig applies existing defaults', async () => {
  const normalized = await normalizeUserConfig({
    debridServices: [{service: 'realdebrid', apiKey: 'rd-key'}]
  });

  assert.deepEqual(normalized.qualities, config.defaultUserConfig.qualities);
  assert.deepEqual(normalized.indexers, config.defaultUserConfig.indexers);
});

test('getProviderLabel formats short manifest labels', () => {
  assert.equal(getProviderLabel([{service: 'realdebrid', apiKey: 'a'}]), 'RD');
  assert.equal(getProviderLabel([
    {service: 'realdebrid', apiKey: 'a'},
    {service: 'premiumize', apiKey: 'b'},
    {service: 'torbox', apiKey: 'c'}
  ]), 'RD+PM+TB');
  assert.equal(getProviderLabel([
    {service: 'realdebrid', apiKey: 'a'},
    {service: 'premiumize', apiKey: 'b'},
    {service: 'torbox', apiKey: 'c'},
    {service: 'alldebrid', apiKey: 'd'}
  ]), '4 providers');
});
```

- [ ] **Step 3: Add test script and run failing tests**

Modify `package.json` scripts:

```json
"scripts": {
  "start": "node src/index.js",
  "test": "node --test tests/*.test.js"
}
```

Run: `npm test`

Expected: FAIL with module-not-found errors for `src/lib/debrid/services.js` and `src/lib/userConfig.js`.

- [ ] **Step 4: Implement service registry**

Create `src/lib/debrid/services.js`:

```js
export const SERVICES = [
  {
    id: 'realdebrid',
    name: 'RealDebrid',
    shortName: 'RD',
    href: {value: 'https://real-debrid.com/apitoken', label: 'Get API Key Here'}
  },
  {
    id: 'torbox',
    name: 'TorBox',
    shortName: 'TB',
    href: {value: 'https://torbox.app/settings', label: 'Get API Key Here'}
  },
  {
    id: 'alldebrid',
    name: 'AllDebrid',
    shortName: 'AD',
    href: {value: 'https://alldebrid.com/apikeys', label: 'Get API Key Here'}
  },
  {
    id: 'premiumize',
    name: 'Premiumize',
    shortName: 'PM',
    href: {value: 'https://www.premiumize.me/account', label: 'Get API Key Here'}
  },
  {
    id: 'debridlink',
    name: 'Debrid-Link',
    shortName: 'DL',
    href: {value: 'https://debrid-link.com/webapp/apikey', label: 'Get API Key Here'}
  },
  {
    id: 'debrider',
    name: 'Debrider',
    shortName: 'DB',
    href: {value: 'https://debrider.app', label: 'Get API Key Here'}
  },
  {
    id: 'easydebrid',
    name: 'EasyDebrid',
    shortName: 'ED',
    href: {value: 'https://easydebrid.com', label: 'Get API Key Here'}
  },
  {
    id: 'offcloud',
    name: 'Offcloud',
    shortName: 'OC',
    href: {value: 'https://offcloud.com', label: 'Get API Key Here'}
  },
  {
    id: 'pikpak',
    name: 'PikPak',
    shortName: 'PP',
    href: {value: 'https://mypikpak.com', label: 'Get API Key Here'}
  }
];

export function listServices(){
  return SERVICES.map(service => ({...service}));
}

export function getService(id){
  return SERVICES.find(service => service.id == id) || null;
}

export function isSupportedService(id){
  return !!getService(id);
}
```

- [ ] **Step 5: Implement config normalization**

Modify `src/lib/config.js` `defaultUserConfig` by adding:

```js
debridServices: [],
```

Place it near the other user-facing defaults, before `passkey`.

Create `src/lib/userConfig.js`:

```js
import config from './config.js';
import {getService} from './debrid/services.js';
import { updateUserConfigWithMediaFlowIp } from './mediaflowProxy.js';

export function normalizeDebridServices(input){
  if(!Array.isArray(input))return [];
  return input.reduce((services, entry) => {
    const service = getService(entry?.service);
    const apiKey = String(entry?.apiKey || '').trim();
    if(!service || !apiKey)return services;
    services.push({service: service.id, apiKey});
    return services;
  }, []);
}

export async function normalizeUserConfig(userConfig = {}){
  const cleanUserConfig = {...userConfig};
  delete cleanUserConfig.debridId;
  delete cleanUserConfig.debridApiKey;
  config.immulatableUserConfigKeys.forEach(key => delete cleanUserConfig[key]);

  const normalized = Object.assign({}, config.defaultUserConfig, cleanUserConfig);
  normalized.debridServices = normalizeDebridServices(cleanUserConfig.debridServices);

  return updateUserConfigWithMediaFlowIp(normalized);
}

export function requireDebridService(userConfig, serviceIndex){
  const index = Number.parseInt(serviceIndex, 10);
  if(!Number.isInteger(index) || index < 0 || index >= userConfig.debridServices.length){
    throw new Error(`Invalid debrid service index ${serviceIndex}`);
  }
  return Object.assign({index}, userConfig.debridServices[index]);
}

export function getProviderLabel(debridServices){
  const labels = normalizeDebridServices(debridServices)
    .map(entry => getService(entry.service)?.shortName)
    .filter(Boolean);

  if(labels.length <= 3)return labels.join('+');
  return `${labels.length} providers`;
}
```

- [ ] **Step 6: Run tests and commit**

Run: `npm test`

Expected: PASS for `debrid-services.test.js` and `userConfig.test.js`.

Commit:

```bash
git add package.json src/lib/config.js src/lib/debrid/services.js src/lib/userConfig.js tests/debrid-services.test.js tests/userConfig.test.js
git commit -m "feat: add stremthru provider config model"
```

## Task 2: StremThru Client and Debrid Facade

**Files:**
- Create: `src/lib/debrid/stremthru.js`
- Replace: `src/lib/debrid.js`
- Create: `tests/stremthru.test.js`

- [ ] **Step 1: Add failing StremThru client tests**

Create `tests/stremthru.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addStoreTorz,
  checkStoreTorz,
  generateStoreLink,
  getUserHash,
  mapTorzItem,
  normalizeStoreFile
} from '../src/lib/debrid/stremthru.js';

const entry = {service: 'realdebrid', apiKey: 'secret-token'};

function createFetchMock(handler){
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({url, options});
    return handler(url, options);
  };
  fetchMock.calls = calls;
  return fetchMock;
}

function jsonResponse(body, status = 200){
  return {
    status,
    ok: status >= 200 && status < 300,
    async json(){
      return body;
    }
  };
}

test('normalizeStoreFile maps StremThru files to Jackettio file shape', () => {
  assert.deepEqual(normalizeStoreFile({index: 2, path: '/Show/S01E02.mkv', size: 123, link: 'store-link'}), {
    id: 2,
    index: 2,
    name: 'S01E02.mkv',
    path: '/Show/S01E02.mkv',
    size: 123,
    url: 'store-link',
    ready: true
  });
});

test('mapTorzItem marks cached statuses and lowercases hash', () => {
  const mapped = mapTorzItem({
    hash: 'ABCDEF',
    status: 'downloaded',
    files: [{index: 0, name: 'Movie.mkv', size: 10, link: 'link'}]
  });

  assert.equal(mapped.hash, 'abcdef');
  assert.equal(mapped.isCached, true);
  assert.equal(mapped.files[0].name, 'Movie.mkv');
});

test('checkStoreTorz sends StremThru headers and maps items by hash', async () => {
  const fetchMock = createFetchMock(() => jsonResponse({
    data: {
      items: [
        {hash: 'hash-a', status: 'cached', files: [{index: 0, name: 'A.mkv', link: 'a'}]},
        {hash: 'hash-b', status: 'queued', files: []}
      ]
    }
  }));

  const result = await checkStoreTorz(['hash-a', 'hash-b'], entry, {
    fetchImpl: fetchMock,
    stremthruUrl: 'https://st.example',
    cache: false
  });

  assert.equal(fetchMock.calls[0].url, 'https://st.example/v0/store/torz/check?hash=hash-a,hash-b');
  assert.equal(fetchMock.calls[0].options.headers['X-StremThru-Store-Name'], 'realdebrid');
  assert.equal(fetchMock.calls[0].options.headers['X-StremThru-Store-Authorization'], 'Bearer secret-token');
  assert.equal(result['hash-a'].isCached, true);
  assert.equal(result['hash-b'].isCached, false);
});

test('checkStoreTorz returns empty results on provider failure', async () => {
  const fetchMock = createFetchMock(() => {
    throw Object.assign(new Error('rate limited'), {status: 429});
  });

  const result = await checkStoreTorz(['hash-a'], entry, {
    fetchImpl: fetchMock,
    stremthruUrl: 'https://st.example',
    cache: false
  });

  assert.deepEqual(result, {});
});

test('addStoreTorz posts link payload', async () => {
  const fetchMock = createFetchMock((url, options) => {
    assert.equal(url, 'https://st.example/v0/store/torz');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, JSON.stringify({link: 'magnet:?xt=urn:btih:hash'}));
    return jsonResponse({data: {hash: 'hash', status: 'cached', files: []}});
  });

  const result = await addStoreTorz('magnet:?xt=urn:btih:hash', entry, {
    fetchImpl: fetchMock,
    stremthruUrl: 'https://st.example'
  });

  assert.equal(result.hash, 'hash');
});

test('generateStoreLink returns direct link', async () => {
  const fetchMock = createFetchMock(() => jsonResponse({data: {link: 'https://cdn.example/movie.mkv'}}));
  const link = await generateStoreLink('store-link', entry, {
    fetchImpl: fetchMock,
    stremthruUrl: 'https://st.example'
  });

  assert.equal(link, 'https://cdn.example/movie.mkv');
});

test('getUserHash does not expose raw token', () => {
  const hash = getUserHash(entry);
  assert.equal(hash.length, 32);
  assert.notEqual(hash, entry.apiKey);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test`

Expected: FAIL with module-not-found for `src/lib/debrid/stremthru.js`.

- [ ] **Step 3: Implement StremThru client**

Create `src/lib/debrid/stremthru.js`:

```js
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
```

- [ ] **Step 4: Add StremThru URL config**

Modify `src/lib/config.js` near `jackettApiKey`:

```js
// StremThru base URL
stremthruUrl: process.env.STREMTHRU_URL || 'https://stremthrufortheweak.nhyira.dev',
```

- [ ] **Step 5: Replace debrid facade**

Replace `src/lib/debrid.js` with:

```js
import {ERROR} from './debrid/const.js';
import {getService, listServices} from './debrid/services.js';
import {
  addStoreTorz,
  checkStoreTorz,
  generateStoreLink,
  getUserHash
} from './debrid/stremthru.js';

export {ERROR};

export async function list(){
  return listServices().map(service => ({
    id: service.id,
    name: service.name,
    shortName: service.shortName,
    href: service.href
  }));
}

export function serviceInfo(entry){
  return getService(entry?.service);
}

export function serviceShortName(entry){
  return serviceInfo(entry)?.shortName || String(entry?.service || '').toUpperCase();
}

export async function getTorrentsCached(torrents, serviceEntry, isValidCachedFiles){
  const hashes = torrents.map(torrent => torrent.infos?.infoHash).filter(Boolean);
  const availability = await checkStoreTorz(hashes, serviceEntry);
  return torrents.filter(torrent => {
    const cached = availability[torrent.infos.infoHash];
    if(!cached?.isCached)return false;
    if(cached.files.length && !isValidCachedFiles(cached.files))return false;
    torrent.cachedFiles = cached.files;
    return true;
  });
}

export async function getFilesFromMagnet(magnet, serviceEntry){
  const item = await addStoreTorz(magnet, serviceEntry);
  if(!item.isCached || !item.files.length){
    throw new Error(ERROR.NOT_READY);
  }
  return item.files;
}

export async function getFilesFromHash(infoHash, serviceEntry){
  return getFilesFromMagnet(`magnet:?xt=urn:btih:${infoHash}`, serviceEntry);
}

export async function getDownload(file, serviceEntry){
  if(!file?.url){
    throw new Error(ERROR.NOT_READY);
  }
  const link = await generateStoreLink(file.url, serviceEntry);
  if(!link){
    throw new Error(ERROR.NOT_READY);
  }
  return link;
}

export function getAccountHash(serviceEntry){
  return getUserHash(serviceEntry);
}
```

- [ ] **Step 6: Run tests and commit**

Run: `npm test`

Expected: PASS for registry, config, and StremThru tests.

Commit:

```bash
git add src/lib/config.js src/lib/debrid.js src/lib/debrid/stremthru.js tests/stremthru.test.js
git commit -m "feat: add stremthru debrid client"
```

## Task 3: Stream Mapping Helpers for Multi-Provider Cached Filtering

**Files:**
- Create: `src/lib/streamMapping.js`
- Create: `tests/stream-mapping.test.js`

- [ ] **Step 1: Add failing tests for stream expansion**

Create `tests/stream-mapping.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {expandTorrentsByService, searchEpisodeFile, getFile} from '../src/lib/streamMapping.js';

const torrents = [
  {
    id: 'torrent-a',
    name: 'Movie A',
    size: 100,
    seeders: 10,
    quality: 1080,
    indexerId: 'indexer',
    languages: [],
    infos: {infoHash: 'hash-a', files: [{name: 'Movie A.mkv', size: 100}]}
  },
  {
    id: 'torrent-b',
    name: 'Movie B',
    size: 200,
    seeders: 5,
    quality: 720,
    indexerId: 'indexer',
    languages: [],
    infos: {infoHash: 'hash-b', files: [{name: 'Movie B.mkv', size: 200}]}
  }
];

const services = [
  {service: 'realdebrid', apiKey: 'rd'},
  {service: 'premiumize', apiKey: 'pm'}
];

test('searchEpisodeFile matches common episode patterns', () => {
  const files = [
    {name: 'Show.S01E001.mkv'},
    {name: 'Show.S01E02.mkv'},
    {name: 'Show.103.mkv'}
  ];
  assert.equal(searchEpisodeFile(files, 1, 2).name, 'Show.S01E02.mkv');
});

test('getFile returns largest movie file', () => {
  const file = getFile([
    {name: 'sample.mkv', size: 1},
    {name: 'movie.mkv', size: 100}
  ], 'movie', 0, 0);
  assert.equal(file.name, 'movie.mkv');
});

test('expandTorrentsByService emits cached streams for each provider', async () => {
  const items = await expandTorrentsByService({
    torrents,
    services,
    type: 'movie',
    season: 0,
    episode: 0,
    hideUncached: false,
    checkCached: async (inputTorrents, serviceEntry) => {
      return serviceEntry.service == 'realdebrid' ? [inputTorrents[0]] : [inputTorrents[1]];
    }
  });

  assert.deepEqual(items.map(item => `${item.serviceIndex}:${item.service.service}:${item.torrent.id}:${item.isCached}`), [
    '0:realdebrid:torrent-a:true',
    '0:realdebrid:torrent-b:false',
    '1:premiumize:torrent-a:false',
    '1:premiumize:torrent-b:true'
  ]);
});

test('expandTorrentsByService hides uncached entries when hideUncached is true', async () => {
  const items = await expandTorrentsByService({
    torrents,
    services,
    type: 'movie',
    season: 0,
    episode: 0,
    hideUncached: true,
    checkCached: async inputTorrents => [inputTorrents[0]]
  });

  assert.deepEqual(items.map(item => item.torrent.id), ['torrent-a', 'torrent-a']);
});

test('expandTorrentsByService skips cached series without matching episode file', async () => {
  const seriesTorrent = {
    ...torrents[0],
    infos: {infoHash: 'hash-a', files: [{name: 'Show.S01E01.mkv', size: 100}]}
  };
  const items = await expandTorrentsByService({
    torrents: [seriesTorrent],
    services: [services[0]],
    type: 'series',
    season: 1,
    episode: 2,
    hideUncached: true,
    checkCached: async inputTorrents => [inputTorrents[0]]
  });

  assert.deepEqual(items, []);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL with module-not-found for `src/lib/streamMapping.js`.

- [ ] **Step 3: Implement stream mapping helper**

Create `src/lib/streamMapping.js`:

```js
import {numberPad, sortBy} from './util.js';

export function searchEpisodeFile(files, season, episode){
  return files.find(file => file.name.includes(`S${numberPad(season, 2)}E${numberPad(episode, 3)}`))
    || files.find(file => file.name.includes(`S${numberPad(season, 2)}E${numberPad(episode, 2)}`))
    || files.find(file => file.name.includes(`${season}${numberPad(episode, 2)}`))
    || files.find(file => file.name.includes(`${numberPad(episode, 2)}`))
    || false;
}

export function getFile(files, type, season, episode){
  files = [...files].sort(sortBy('size', true));
  if(type == 'movie'){
    return files[0];
  }else if(type == 'series'){
    return searchEpisodeFile(files, season, episode) || files[0];
  }
  return files[0];
}

function cachedKeySet(cachedTorrents){
  return new Set(cachedTorrents.map(torrent => torrent.infos.infoHash));
}

export async function expandTorrentsByService({
  torrents,
  services,
  type,
  season,
  episode,
  hideUncached,
  checkCached
}){
  const expanded = [];
  const isValidCachedFiles = type == 'series'
    ? files => !!searchEpisodeFile(files, season, episode)
    : () => true;

  for(let serviceIndex = 0; serviceIndex < services.length; serviceIndex++){
    const service = services[serviceIndex];
    let cached = [];
    try {
      cached = await checkCached(torrents, service, isValidCachedFiles);
    }catch(err){
      console.log(`[${service.service}] cache check failed: ${err.message || err}`);
      cached = [];
    }

    const cachedHashes = cachedKeySet(cached);
    for(const torrent of torrents){
      const isCached = cachedHashes.has(torrent.infos.infoHash);
      const files = isCached && torrent.cachedFiles?.length ? torrent.cachedFiles : torrent.infos.files;
      if(isCached && type == 'series' && !searchEpisodeFile(files, season, episode))continue;
      if(!isCached && hideUncached)continue;

      expanded.push({
        torrent,
        service,
        serviceIndex,
        isCached,
        files
      });
    }
  }

  return expanded;
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Expected: PASS for all tests.

Commit:

```bash
git add src/lib/streamMapping.js tests/stream-mapping.test.js
git commit -m "feat: add multi-provider stream mapping"
```

## Task 4: Refactor Jackettio Stream and Download Flow

**Files:**
- Modify: `src/lib/jackettio.js`
- Modify: `src/index.js`
- Modify: `src/lib/debrid.js`
- Modify: `tests/stream-mapping.test.js`

- [ ] **Step 1: Add route-shape assertion to stream mapping test**

Append to `tests/stream-mapping.test.js`:

```js
import {buildDownloadPath} from '../src/lib/jackettio.js';

test('buildDownloadPath includes service index and opaque config payload', () => {
  const path = buildDownloadPath({
    publicUrl: 'https://addon.example',
    userConfig: {debridServices: [{service: 'realdebrid', apiKey: 'secret'}]},
    serviceIndex: 1,
    type: 'movie',
    stremioId: 'tt123',
    torrentId: 'torrent-a',
    name: 'Movie A.mkv'
  });

  assert.match(path, /^https:\/\/addon\.example\/eyJ/);
  assert.match(path, /\/download\/1\/movie\/tt123\/torrent-a\/Movie%20A\.mkv$/);
  assert.equal(path.includes('/secret/'), false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test`

Expected: FAIL because `buildDownloadPath` is not exported.

- [ ] **Step 3: Modify Jackettio imports and config normalization**

In `src/lib/jackettio.js`, replace:

```js
import * as debrid from './debrid.js';
```

with:

```js
import * as debrid from './debrid.js';
import {normalizeUserConfig, requireDebridService} from './userConfig.js';
import {expandTorrentsByService, getFile, searchEpisodeFile} from './streamMapping.js';
```

Replace the `mergeDefaultUserConfig` function with:

```js
async function mergeDefaultUserConfig(userConfig){
  return normalizeUserConfig(userConfig);
}
```

Remove the local `searchEpisodeFile` and `getFile` functions from `src/lib/jackettio.js` after imports are updated.

- [ ] **Step 4: Add route builder export**

Add this function near `getStreams` in `src/lib/jackettio.js`:

```js
export function buildDownloadPath({publicUrl, userConfig, serviceIndex, type, stremioId, torrentId, name}){
  const payload = btoa(JSON.stringify(userConfig));
  const encodedName = encodeURIComponent(name || '');
  return `${publicUrl}/${payload}/download/${serviceIndex}/${type}/${stremioId}/${torrentId}/${encodedName}`;
}
```

- [ ] **Step 5: Refactor `getStreams` to expand provider entries**

In `src/lib/jackettio.js`, replace the beginning of `getStreams`:

```js
userConfig = await mergeDefaultUserConfig(userConfig);
const {id, season, episode} = parseStremioId(stremioId);
const debridInstance = debrid.instance(userConfig);
```

with:

```js
userConfig = await mergeDefaultUserConfig(userConfig);
const {id, season, episode} = parseStremioId(stremioId);
if(!userConfig.debridServices.length){
  throw new Error('At least one debrid service is required');
}
```

Replace:

```js
const torrents = await getTorrents(userConfig, metaInfos, debridInstance);
```

with:

```js
const torrents = await getTorrents(userConfig, metaInfos);
const streamItems = await expandTorrentsByService({
  torrents,
  services: userConfig.debridServices,
  type,
  season,
  episode,
  hideUncached: userConfig.hideUncached,
  checkCached: debrid.getTorrentsCached
});
```

Replace the stream `return torrents.map(torrent => { ... })` loop with:

```js
return streamItems.map(({torrent, service, serviceIndex, isCached, files}) => {
  const file = getFile(files || [], type, season, episode) || {};
  const quality = torrent.quality > 0 ? config.qualities.find(q => q.value == torrent.quality).label : '';
  const rows = [torrent.name];
  if(type == 'series' && file.name)rows.push(file.name);
  if(torrent.infoText)rows.push(`ℹ️ ${torrent.infoText}`);
  rows.push([`💾${bytesToSize(file.size || torrent.size)}`, `👥${torrent.seeders}`, `⚙️${torrent.indexerId}`, ...(torrent.languages || []).map(language => language.emoji)].join(' '));
  if(torrent.progress && !isCached){
    rows.push(`⬇️ ${torrent.progress.percent}% ${bytesToSize(torrent.progress.speed)}/s`);
  }
  const shortName = debrid.serviceShortName(service);
  return {
    name: `[${shortName}${isCached ? '+' : ''}] ${userConfig.enableMediaFlow ? '🕵🏼‍♂️ ' : ''}${config.addonName} ${quality}`,
    title: rows.join("\n"),
    url: torrent.disabled ? '#' : buildDownloadPath({
      publicUrl,
      userConfig,
      serviceIndex,
      type,
      stremioId,
      torrentId: torrent.id,
      name: file.name || torrent.name
    })
  };
});
```

- [ ] **Step 6: Simplify `getTorrents` debrid-specific block**

Change `async function getTorrents(userConfig, metaInfos, debridInstance)` to:

```js
async function getTorrents(userConfig, metaInfos)
```

Delete the block beginning with:

```js
if(debridInstance){
```

and ending just before:

```js
return torrents;
```

Then add private-torrent uncached disabling after torrent info dedupe:

```js
if(config.replacePasskey && !(userConfig.passkey && userConfig.passkey.match(new RegExp(config.replacePasskeyPattern)))){
  torrents.forEach(torrent => {
    if(torrent.infos.private){
      torrent.disabled = true;
      torrent.infoText = 'Uncached torrent require a passkey configuration';
    }
  });
}
```

- [ ] **Step 7: Update next-episode preparation calls**

Change `prepareNextEpisode(userConfig, metaInfos, debridInstance)` to:

```js
async function prepareNextEpisode(userConfig, metaInfos)
```

Inside it, replace:

```js
const torrents = await getTorrents(userConfig, metaInfos, debridInstance);
```

with:

```js
const torrents = await getTorrents(userConfig, metaInfos);
```

Replace:

```js
if(bestTorrent)await getDebridFiles(userConfig, bestTorrent.infos, debridInstance);
```

with:

```js
if(bestTorrent && userConfig.debridServices.length){
  await getDebridFiles(userConfig, bestTorrent.infos, userConfig.debridServices[0]);
}
```

In `getStreams`, replace:

```js
prepareNextEpisode({...userConfig, forceCacheNextEpisode: false}, metaInfos, debridInstance);
```

with:

```js
prepareNextEpisode({...userConfig, forceCacheNextEpisode: false}, metaInfos);
```

- [ ] **Step 8: Refactor debrid file/download helpers**

Change:

```js
async function getDebridFiles(userConfig, infos, debridInstance)
```

to:

```js
async function getDebridFiles(userConfig, infos, serviceEntry)
```

Inside it, replace method calls:

```js
return debridInstance.getFilesFromMagnet(infos.magnetUrl, infos.infoHash);
return debridInstance.getFilesFromHash(infos.infoHash);
return debridInstance.getFilesFromBuffer(buffer, infos.infoHash);
```

with:

```js
return debrid.getFilesFromMagnet(infos.magnetUrl, serviceEntry);
return debrid.getFilesFromHash(infos.infoHash, serviceEntry);
throw new Error('Torrent file upload through StremThru is not supported for this stream');
```

Keep the passkey replacement code before the thrown upload error so private torrent behavior stays centralized. A separate future change can replace the thrown error with a StremThru upload method if StremThru file upload support is confirmed.

- [ ] **Step 9: Refactor `getDownload` signature and cache key**

Change:

```js
export async function getDownload(userConfig, type, stremioId, torrentId){
```

to:

```js
export async function getDownload(userConfig, serviceIndex, type, stremioId, torrentId){
```

Replace:

```js
const debridInstance = debrid.instance(userConfig);
```

with:

```js
const serviceEntry = requireDebridService(userConfig, serviceIndex);
```

Replace cache key:

```js
const cacheKey = `download:2:${await debridInstance.getUserHash()}${userConfig.enableMediaFlow ? ':mfp': ''}:${stremioId}:${torrentId}`;
```

with:

```js
const cacheKey = `download:3:${debrid.getAccountHash(serviceEntry)}${userConfig.enableMediaFlow ? ':mfp': ''}:${stremioId}:${torrentId}`;
```

Replace logging and method calls:

```js
console.log(`${stremioId} : ${debridInstance.shortName} : ${infos.infoHash} : get files ...`);
files = await getDebridFiles(userConfig, infos, debridInstance);
console.log(`${stremioId} : ${debridInstance.shortName} : ${infos.infoHash} : ${files.length} files found`);
download = await debridInstance.getDownload(getFile(files, type, season, episode));
```

with:

```js
const shortName = debrid.serviceShortName(serviceEntry);
console.log(`${stremioId} : ${shortName} : ${infos.infoHash} : get files ...`);
files = await getDebridFiles(userConfig, infos, serviceEntry);
console.log(`${stremioId} : ${shortName} : ${infos.infoHash} : ${files.length} files found`);
download = await debrid.getDownload(getFile(files, type, season, episode), serviceEntry);
```

- [ ] **Step 10: Update Express manifest and download route**

In `src/index.js`, add:

```js
import {getProviderLabel, normalizeUserConfig} from './lib/userConfig.js';
```

In configure template config, keep:

```js
debrids: await debrid.list(),
```

In manifest route, replace:

```js
const userConfig = JSON.parse(atob(req.params.userConfig));
const debridInstance = debrid.instance(userConfig);
manifest.name += ` ${debridInstance.shortName}`;
```

with:

```js
const userConfig = await normalizeUserConfig(JSON.parse(atob(req.params.userConfig)));
const providerLabel = getProviderLabel(userConfig.debridServices);
if(providerLabel)manifest.name += ` ${providerLabel}`;
```

Change route:

```js
app.use('/:userConfig/download/:type/:id/:torrentId/:name?', async(req, res, next) => {
```

to:

```js
app.use('/:userConfig/download/:serviceIndex/:type/:id/:torrentId/:name?', async(req, res, next) => {
```

Change `jackettio.getDownload` call:

```js
Object.assign(JSON.parse(atob(req.params.userConfig)), {ip: req.clientIp}),
req.params.type,
req.params.id,
req.params.torrentId
```

to:

```js
Object.assign(JSON.parse(atob(req.params.userConfig)), {ip: req.clientIp}),
req.params.serviceIndex,
req.params.type,
req.params.id,
req.params.torrentId
```

- [ ] **Step 11: Run tests and smoke-check syntax**

Run: `npm test`

Expected: PASS.

Run: `node --check src/lib/jackettio.js`

Expected: no syntax output and exit code 0.

Run: `node --check src/index.js`

Expected: no syntax output and exit code 0.

- [ ] **Step 12: Commit**

Commit:

```bash
git add src/lib/jackettio.js src/index.js src/lib/debrid.js tests/stream-mapping.test.js
git commit -m "feat: expand streams across stremthru providers"
```

## Task 5: Configure Page Multi-Provider UI

**Files:**
- Modify: `src/template/configure.html`
- Modify: `src/index.js`

- [ ] **Step 1: Replace debrid selector markup**

In `src/template/configure.html`, replace the current Debrid provider block:

```html
<div class="mb-3">
  <label>Debrid provider:</label>
  <select v-model="debrid" class="form-select" @change="form.debridId = debrid.id">
    <option v-for="option in debrids" :value="option">{{ option.name }}</option>
  </select>
</div>
<div v-for="field in debrid.configFields" class="mb-3">
  <label>{{field.label}}:</label> 
  <small v-if="field.href" class="ms-2"><a :href="field.href.value" target="_blank" rel="noreferrer">{{field.href.label}}</a></small>
  <input type="{{field.type}}" v-model="field.value" class="form-control">
</div>
```

with:

```html
<div class="mb-3">
  <label>Debrid providers:</label>
  <div v-for="(entry, index) in form.debridServices" class="border border-secondary-subtle rounded p-2 mb-2">
    <div class="d-flex gap-2 align-items-start">
      <select v-model="entry.service" class="form-select">
        <option value="">Select provider</option>
        <option v-for="option in debrids" :value="option.id">{{ option.name }}</option>
      </select>
      <button type="button" class="btn btn-outline-danger" @click="removeDebridService(index)">Remove</button>
    </div>
    <div class="mt-2">
      <label>API Key:</label>
      <small v-if="getDebridOption(entry.service)?.href" class="ms-2">
        <a :href="getDebridOption(entry.service).href.value" target="_blank" rel="noreferrer">{{getDebridOption(entry.service).href.label}}</a>
      </small>
      <input type="password" v-model="entry.apiKey" class="form-control">
    </div>
  </div>
  <button type="button" class="btn btn-outline-secondary" @click="addDebridService">Add provider</button>
</div>
```

- [ ] **Step 2: Update setup variables**

In the script setup block, replace:

```js
const debrid = ref({});
```

with:

```js
const debrid = ref({});
```

Keep `debrid` only if removing every reference is riskier during this task; it will no longer drive install-button state.

Replace saved-config handling:

```js
debrid.value = debrids.find(debrid => debrid.id == savedUserConfig.debridId) || {};
debrid.value.configFields.forEach(field => field.value = savedUserConfig[field.name] || null);
```

with:

```js
savedUserConfig.debridServices = Array.isArray(savedUserConfig.debridServices) ? savedUserConfig.debridServices : [];
```

In `form = ref({ ... })`, replace:

```js
debridId: defaultUserConfig.debridId || '',
```

with:

```js
debridServices: (defaultUserConfig.debridServices || []).map(entry => ({...entry})),
```

- [ ] **Step 3: Add provider row helpers**

Add these functions before `configure()`:

```js
function addDebridService(){
  form.value.debridServices.push({service: debrids[0]?.id || '', apiKey: ''});
}

function removeDebridService(index){
  form.value.debridServices.splice(index, 1);
}

function getDebridOption(serviceId){
  return debrids.find(option => option.id == serviceId) || null;
}
```

After `form` initialization, add:

```js
if(form.value.debridServices.length == 0){
  addDebridService();
}
```

- [ ] **Step 4: Update configure validation and payload**

Inside `configure()`, remove:

```js
debrid.value.configFields.forEach(field => {
  if(field.required && !field.value)throw new Error(`${field.label} is required`);
  userConfig[field.name] = field.value
});

if(!userConfig.debridId){
  throw new Error(`Debrid is required`);
}
```

Replace with:

```js
userConfig.debridServices = form.value.debridServices
  .map(entry => ({service: entry.service, apiKey: String(entry.apiKey || '').trim()}))
  .filter(entry => entry.service && entry.apiKey);

if(!userConfig.debridServices.length){
  throw new Error(`At least one Debrid provider is required`);
}

for(const entry of userConfig.debridServices){
  if(!getDebridOption(entry.service)){
    throw new Error(`Unsupported Debrid provider: ${entry.service}`);
  }
}
```

Update the install button:

```html
<button @click="configure" type="button" class="btn btn-primary" :disabled="form.debridServices.length == 0">{{isUpdate ? 'Update' : 'Install'}}</button>
```

Return the new helper functions:

```js
addDebridService,
removeDebridService,
getDebridOption
```

- [ ] **Step 5: Verify rendered template config shape**

In `src/index.js`, confirm `debrids: await debrid.list()` returns objects with `id`, `name`, `shortName`, and `href`. No `configFields` are needed after this UI change.

Run: `npm test`

Expected: PASS.

Run: `node --check src/index.js`

Expected: no syntax output and exit code 0.

- [ ] **Step 6: Commit**

Commit:

```bash
git add src/template/configure.html src/index.js
git commit -m "feat: configure multiple stremthru providers"
```

## Task 6: Runtime Verification and Fixes

**Files:**
- Modify only files needed to fix issues found during runtime verification.

- [ ] **Step 1: Start Jackettio locally**

Run:

```bash
npm start
```

Expected: server starts and logs `Server listen at: http://localhost:4000`.

- [ ] **Step 2: Open configure page manually**

Open: `http://localhost:4000/configure`

Expected:

- Debrid section shows one provider row.
- Provider dropdown lists RealDebrid, TorBox, AllDebrid, Premiumize, Debrid-Link, Debrider, EasyDebrid, Offcloud, and PikPak.
- Add provider creates another row.
- Remove provider removes the selected row.
- Install button rejects empty API keys.

- [ ] **Step 3: Generate a manifest URL with two dummy services**

Use the configure page with:

```json
[
  {"service": "realdebrid", "apiKey": "rd-test"},
  {"service": "premiumize", "apiKey": "pm-test"}
]
```

Expected generated Stremio URL contains a Base64 config payload and does not show `rd-test` or `pm-test` in plaintext outside the payload.

- [ ] **Step 4: Verify manifest naming**

Convert the generated Stremio URL to HTTP by replacing `stremio://` with `http://` and open `/manifest.json`.

Expected response includes:

```json
{
  "name": "Jackettio RD+PM"
}
```

- [ ] **Step 5: Verify unconfigured stream behavior**

Open: `http://localhost:4000/stream/movie/tt0111161.json`

Expected response contains one stream with title `ℹ Kindly configure this addon to access streams.`

- [ ] **Step 6: Run automated tests after runtime fixes**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit runtime fixes**

If changes were needed, commit:

```bash
git add src package.json tests
git commit -m "fix: verify stremthru provider runtime flow"
```

If no changes were needed, do not create an empty commit.

## Task 7: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-23-jackettio-stremthru-multi-provider-design.md` only if implementation intentionally differs from the spec.

- [ ] **Step 1: Update README feature summary**

In `README.md`, replace:

```md
- Resolve streams using Jackett and Debrid (debrid-link, alldebrid, real-debrid)
```

with:

```md
- Resolve streams using Jackett and StremThru-backed Debrid providers (RealDebrid, TorBox, AllDebrid, Premiumize, Debrid-Link, Debrider, EasyDebrid, Offcloud, PikPak)
```

- [ ] **Step 2: Update README configuration notes**

Find the debrid configuration section in `README.md` and update it to describe `debridServices` with this markdown:

````md
Jackettio uses StremThru for debrid resolution. Configure one or more providers on the `/configure` page. The generated manifest stores providers as:

```json
{
  "debridServices": [
    {"service": "realdebrid", "apiKey": "YOUR_REALDEBRID_KEY"},
    {"service": "premiumize", "apiKey": "YOUR_PREMIUMIZE_KEY"}
  ]
}
```

Enable "Display only cached torrents" to hide uncached provider streams.
````

- [ ] **Step 3: Run final automated checks**

Run:

```bash
npm test
```

Expected: PASS.

Run:

```bash
node --check src/index.js
```

Expected: no syntax output and exit code 0.

Run:

```bash
node --check src/lib/jackettio.js
```

Expected: no syntax output and exit code 0.

- [ ] **Step 4: Review git diff**

Run:

```bash
git diff --stat HEAD
```

Expected: only files from this plan are changed.

Run:

```bash
git status --short
```

Expected: README and any final documentation changes are unstaged.

- [ ] **Step 5: Commit documentation**

Commit:

```bash
git add README.md docs/superpowers/specs/2026-05-23-jackettio-stremthru-multi-provider-design.md
git commit -m "docs: document stremthru provider configuration"
```

If the spec file was not changed, use:

```bash
git add README.md
git commit -m "docs: document stremthru provider configuration"
```

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: clean worktree.
