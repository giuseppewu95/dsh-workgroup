/**
 * Trust-fence tests: the loopback Host + same-origin browser-marker rule the
 * workgroup HTTP API applies before reading any membership data.
 *
 * @module dsh-workgroup/tests/trust
 */

import { describe, expect, it } from 'vitest'
import { isTrustedWorkgroupRequest } from '../src/trust.ts'

describe('isTrustedWorkgroupRequest', () => {
  it('accepts a loopback host without browser markers', () => {
    expect(isTrustedWorkgroupRequest({ host: '127.0.0.1:3080' })).toBe(true)
    expect(isTrustedWorkgroupRequest({ host: 'localhost:3080' })).toBe(true)
    expect(isTrustedWorkgroupRequest({ host: '[::1]:3080' })).toBe(true)
  })

  it('accepts a loopback host with a same-origin Origin', () => {
    expect(isTrustedWorkgroupRequest({
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
    })).toBe(true)
  })

  it('refuses a non-loopback host', () => {
    expect(isTrustedWorkgroupRequest({ host: 'evil.example' })).toBe(false)
    expect(isTrustedWorkgroupRequest({ host: '192.168.1.10:3080' })).toBe(false)
  })

  it('refuses a cross-site browser marker', () => {
    expect(isTrustedWorkgroupRequest({
      host: '127.0.0.1:3080',
      'sec-fetch-site': 'cross-site',
    })).toBe(false)
  })

  it('refuses a foreign Origin', () => {
    expect(isTrustedWorkgroupRequest({
      host: '127.0.0.1:3080',
      origin: 'http://evil.example',
    })).toBe(false)
  })

  it('refuses a null origin and an unparsable origin', () => {
    expect(isTrustedWorkgroupRequest({
      host: '127.0.0.1:3080',
      origin: 'null',
    })).toBe(false)
    expect(isTrustedWorkgroupRequest({
      host: '127.0.0.1:3080',
      origin: 'not a url',
    })).toBe(false)
  })

  it('refuses a missing host', () => {
    expect(isTrustedWorkgroupRequest({})).toBe(false)
  })
})
