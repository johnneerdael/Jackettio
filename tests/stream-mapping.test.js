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
