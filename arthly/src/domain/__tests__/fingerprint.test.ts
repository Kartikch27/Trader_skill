import { describe, expect, it } from 'vitest';
import { canonical, fingerprint, sha256Hex } from '../fingerprint';
import risk from '../../fixtures/risk-TSLA.json';
import sizing from '../../fixtures/sizing-TSLA.json';

describe('exact-order fingerprint (same as check.py and ticket.py)', () => {
  it('sha256 known vectors', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the fingerprint check.py wrote for the reel order', () => {
    expect(fingerprint(sizing.orders[0] as never)).toBe(risk.results[0].fingerprint);
  });

  it('ignores notes that are never sent (why, plan) and key order', () => {
    const { why: _w, plan: _p, ...bare } = sizing.orders[0];
    const shuffled = Object.fromEntries(Object.entries(bare).reverse());
    expect(fingerprint(shuffled as never)).toBe(risk.results[0].fingerprint);
    expect(canonical(bare as never).startsWith('{"order_class":"bracket"')).toBe(true);
  });

  it('any change to the order makes a new fingerprint', () => {
    expect(fingerprint({ ...sizing.orders[0], qty: '9' } as never)).not.toBe(risk.results[0].fingerprint);
  });
});
