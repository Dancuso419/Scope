// Manual integration check (not a unit test — needs CLI login + network).
// Usage: node src/data/smoke.ts <address> [chain]
import { getWalletData } from './wallet.ts';
import { assembleHealth, isCredibleMarket } from '../analysis/assemble.ts';
import { runOnchainos } from './transport.ts';

const address = process.argv[2] ?? '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const chain = process.argv[3] ?? 'ethereum';

const data = await getWalletData(address, chain, runOnchainos);
console.log(JSON.stringify({
  address,
  chain,
  balances: data.balances.length,
  approvals: data.approvals.length,
  dexHistory: data.dexHistory.length,
  markets: data.markets.length,
  failed: data.failed,
  credibleMarkets: data.markets.filter(isCredibleMarket).map((m) => ({ symbol: m.symbol, liquidity: m.liquidity.slice(0, 12) })),
  sampleBalance: data.balances[0],
  health: assembleHealth(data),
}, null, 2));
