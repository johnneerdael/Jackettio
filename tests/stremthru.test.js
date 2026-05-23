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
