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
  delete normalized.debridId;
  delete normalized.debridApiKey;

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
