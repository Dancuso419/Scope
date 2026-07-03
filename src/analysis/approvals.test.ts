import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRiskyApprovals } from './approvals.ts';
import type { ApprovalRecord } from './types.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000; // fixed reference for determinism
const UNLIMITED = (2n ** 256n - 1n).toString();

const approval = (over: Partial<ApprovalRecord>): ApprovalRecord => ({
  approvalAddress: '0xspender',
  tokenAddress: '0xtoken',
  symbol: 'AAA',
  blockTime: NOW - 400 * DAY,
  remainAmount: UNLIMITED,
  protocolName: 'somedex',
  vulnerabilityFlag: false,
  status: '1',
  ...over,
});

test('flags an active unlimited approval granted long ago', () => {
  const r = findRiskyApprovals([approval({})], NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].spender, '0xspender');
  assert.equal(r[0].unlimited, true);
  assert.equal(r[0].reason, 'unlimited-and-stale');
});

test('does not flag a recent unlimited approval', () => {
  const r = findRiskyApprovals([approval({ blockTime: NOW - 5 * DAY })], NOW);
  assert.equal(r.length, 0);
});

test('does not flag an old but finite (limited) approval', () => {
  const r = findRiskyApprovals([approval({ remainAmount: '1000000' })], NOW);
  assert.equal(r.length, 0);
});

test('flags a vulnerability-flagged approval regardless of age or amount', () => {
  const r = findRiskyApprovals(
    [approval({ blockTime: NOW - 1 * DAY, remainAmount: '1000000', vulnerabilityFlag: true })],
    NOW,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].reason, 'flagged-vulnerable');
});

test('ignores inactive (revoked) approvals', () => {
  const r = findRiskyApprovals([approval({ status: '0' })], NOW);
  assert.equal(r.length, 0);
});
