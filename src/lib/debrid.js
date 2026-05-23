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
