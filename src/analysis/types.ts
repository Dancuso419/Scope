// Input data shapes as returned by the OKX Onchain OS CLI.
// Numeric fields arrive as strings and must be parsed before use.

// From `onchainos portfolio all-balances` → data[].tokenAssets[]
export interface TokenBalance {
  symbol: string;
  tokenContractAddress: string;
  balance: string; // UI units (already decimal-adjusted)
  rawBalance: string;
  tokenPrice: string; // USD per token
  isRiskToken: boolean;
  chainIndex: string;
}

// From `onchainos market portfolio-dex-history` → data.transactionList[]
export interface DexTransaction {
  type: string; // "1"=BUY "2"=SELL "3"=Transfer In "4"=Transfer Out
  tokenSymbol: string;
  tokenContractAddress: string;
  valueUsd: string;
  amount: string;
  price: string;
  time: string; // ms epoch
}

// From `onchainos token price-info` → data[] (one call per held token)
export interface TokenMarket {
  symbol: string;
  tokenContractAddress: string;
  liquidity: string; // total liquidity in USD
  volume24H: string; // 24h trading volume in USD
}

// From `onchainos security approvals` → data[].dataList[]
export interface ApprovalRecord {
  approvalAddress: string; // the spender contract
  tokenAddress: string;
  symbol: string;
  blockTime: number; // ms epoch when the approval was GRANTED (not last-used)
  remainAmount: string; // remaining approved amount, base units; ~2^256 = unlimited
  protocolName: string;
  vulnerabilityFlag: boolean;
  status: string; // "1" = active
}
