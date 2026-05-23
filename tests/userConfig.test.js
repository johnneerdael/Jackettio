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
