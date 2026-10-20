import test from 'node:test';
import assert from 'node:assert/strict';
import { pushDeviceState } from '../lib/push-device.ts';

const base = { supported: true, configured: true, permission: 'granted', subscribed: true, registered: true };

test('Ativo somente com inscrição local, permissão e registro confirmado pelo servidor', () => {
  assert.equal(pushDeviceState(base).active, true);
  assert.equal(pushDeviceState({ ...base, permission: 'default' }).active, false);
  assert.equal(pushDeviceState({ ...base, subscribed: false, registered: undefined }).active, false);
});

test('Inscrição local órfã não é tratada como ativa nem reativada', () => {
  const orphan = pushDeviceState({ ...base, registered: false });
  assert.equal(orphan.active, false);
  assert.match(orphan.message, /Ative novamente/);
});

test('Mensagens de indisponibilidade têm prioridade', () => {
  assert.match(pushDeviceState({ ...base, supported: false }).message, /Neste navegador/);
  assert.match(pushDeviceState({ ...base, configured: false }).message, /não foram configuradas/);
  assert.match(pushDeviceState({ ...base, permission: 'denied' }).message, /bloqueadas/);
  assert.equal(pushDeviceState({ ...base, permission: 'denied' }).active, false);
});
