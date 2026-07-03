import type { ApprovalRecord } from './types.ts';
import { STALE_APPROVAL_AGE_DAYS } from './thresholds.ts';

export interface RiskyApproval {
  spender: string;
  token: string;
  granted_at: string; // ISO date
  unlimited: boolean;
  reason: 'unlimited-and-stale' | 'flagged-vulnerable';
}

// No legitimate token has a balance near 2^255 base units, so an approval at or
// above that is the "infinite approval" sentinel. Threshold, NOT equality with
// 2^256-1: live data shows remainAmount = max-uint minus already-spent amounts.
const UNLIMITED_MIN = 2n ** 255n;

function isUnlimited(remainAmount: string): boolean {
  try {
    return BigInt(remainAmount) >= UNLIMITED_MIN;
  } catch {
    return false;
  }
}

export function findRiskyApprovals(approvals: ApprovalRecord[], now = Date.now()): RiskyApproval[] {
  const staleBefore = now - STALE_APPROVAL_AGE_DAYS * 24 * 60 * 60 * 1000;
  const risky: RiskyApproval[] = [];
  for (const a of approvals) {
    if (a.status !== '1') continue; // only active approvals
    const unlimited = isUnlimited(a.remainAmount);
    let reason: RiskyApproval['reason'] | null = null;
    if (a.vulnerabilityFlag) reason = 'flagged-vulnerable';
    else if (unlimited && a.blockTime < staleBefore) reason = 'unlimited-and-stale';
    if (!reason) continue;
    risky.push({
      spender: a.approvalAddress,
      token: a.symbol,
      granted_at: new Date(a.blockTime).toISOString(),
      unlimited,
      reason,
    });
  }
  return risky;
}
