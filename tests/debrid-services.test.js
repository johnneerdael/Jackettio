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
