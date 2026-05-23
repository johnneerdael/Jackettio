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
