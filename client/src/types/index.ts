export interface Status {
  date: string; // e.g. "2024-08"
  cash: number;
  reputation: number;
  stage: "startup" | "growthature" | "massProduction" | "exit";
}

export interface Financials {
  revenue: number;
  materials: number;
  opex: number;
  depreciation: number;
  netProfit: number;
  cash: number;
  assets: number;
  liabilities: number;
}

export interface Equipment {
  id: string;
  name: string;
  category: "fab" | "tool";
  priceUsd: number;
  health?: number; // 0‑100 %
}

export interface Contract {
  id: string;
  name: string; // e.g. "180nm GPU order"
  targetNode: string; // technology node
  rewardUsd: number;
  progress: number; // 0‑100 %
  status: "available" | "accepted" | "completed";
}

export interface TechNode {
  id: string;
  name: string; // e.g. "7nm", "A16"
  costUsd: number;
  level: number; // 0 = locked, 1 = researching, 2 = unlocked
}

export interface StateSnapshot {
  date: string;
  cash: number;
  reputation: number;
  stage: "startup" | "growthature" | "massProduction" | "exit";
  factories: {
    id: string;
    name: string;
    health: number;
    level: number;
  }[];
  economy: {
    revenue: number;
    materials: number;
    opex: number;
    depreciation: number;
    netProfit: number;
  };
  techNodes: {
    id: string;
    name: string;
    level: number;
    costUsd: number;
  }[];
  contracts: Contract[];
}