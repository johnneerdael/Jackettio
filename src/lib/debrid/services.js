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
