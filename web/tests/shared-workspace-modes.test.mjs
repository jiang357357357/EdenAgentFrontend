import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostsInMode, spacesInMode } from '../src/components/shared-workspace/shared-workspace-mode.ts'

const hosts = [{ deviceId: 'local', local: true, dedicated: false }, { deviceId: 'neighbor', local: false, dedicated: false },
  { deviceId: 'cloud', local: false, dedicated: true, reachable: false }]
const spaces = [{ id: 'one', hostDeviceId: 'local' }, { id: 'two', hostDeviceId: 'neighbor' },
  { id: 'three', hostDeviceId: 'cloud' }, { id: 'legacy-local' }]
test('LAN host choices exclude offline cloud hosts and cloud choices exclude the local computer', () => {
  assert.deepEqual(hostsInMode(hosts, 'lan').map(host => host.deviceId), ['local', 'neighbor'])
  assert.deepEqual(hostsInMode(hosts, 'cloud').map(host => host.deviceId), ['cloud'])
})
test('library lists follow their host classification even when the cloud is offline', () => {
  assert.deepEqual(spacesInMode(spaces, hosts, 'lan').map(space => space.id), ['one', 'two', 'legacy-local'])
  assert.deepEqual(spacesInMode(spaces, hosts, 'cloud').map(space => space.id), ['three'])
})
test('an empty cloud catalog never shows local libraries or local host creation targets', () => {
  assert.deepEqual(spacesInMode(spaces.slice(0, 2), hosts.slice(0, 2), 'cloud'), [])
  assert.deepEqual(hostsInMode(hosts.slice(0, 2), 'cloud'), [])
})
