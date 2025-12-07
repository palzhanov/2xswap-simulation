
// ---- Core simulation logic: investors, managers, pool, BTC, share tokens ----

// Investor and manager type definitions
const investorTypes = [
  { type: "minnow",   min: 1000,    max: 10000,    k: 25, c: 0.02 },
  { type: "mackerel", min: 10000,   max: 100000,   k: 15, c: 0.05 },
  { type: "tuna",     min: 100000,  max: 1000000,  k: 8,  c: 0.08 },
  { type: "whale",    min: 1000000, max: 5000000,  k: 4,  c: 0.15 }
];

const managerTypes = [
  { type: "shrimp", minAUM: 100,     maxAUM: 1000,    k: 18, c: 0.02 },
  { type: "crab",   minAUM: 1000,    maxAUM: 10000,   k: 12, c: 0.04 },
  { type: "shark",  minAUM: 10000,   maxAUM: 100000,  k: 7,  c: 0.07 },
  { type: "orca",   minAUM: 100000,  maxAUM: 500000,  k: 3,  c: 0.12 }
];

function pickInvestorType() {
  const r = Math.random();
  if (r < 0.4) return investorTypes[0];   // more minnows
  if (r < 0.7) return investorTypes[1];
  if (r < 0.9) return investorTypes[2];
  return investorTypes[3];               // few whales
}

function pickManagerType() {
  const r = Math.random();
  if (r < 0.3) return managerTypes[0];
  if (r < 0.6) return managerTypes[1];
  if (r < 0.9) return managerTypes[2];
  return managerTypes[3];
}

// Logistic helper for exit / derisk probabilities
function logistic(g, k, c) {
  // g: growth (e.g. 0.10 = +10%), k: steepness, c: shift
  const x = -(g + c);
  return 1 / (1 + Math.exp(-k * x));
}

// Simple synthetic BTC price series: random walk with drift
function generatePriceSeries(steps) {
  const prices = [20000];
  const drift = 0.0004;
  const vol = 0.04;
  for (let i = 1; i < steps; i++) {
    const rnd = (Math.random() * 2 - 1);
    const ret = drift + vol * rnd;
    prices.push(prices[i - 1] * (1 + ret));
  }
  return prices;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

// ---- Main simulation entry point ----
function runSimulation(params) {
  const {
    initialInvestors,
    initialManagers,
    ps0,
    ps1,
    steps,
    arrivalRate,
    initialRiskLevel,
    priceSeries
  } = params;

  const hasExternalPrices = Array.isArray(priceSeries) && priceSeries.length >= 2;
  const prices = hasExternalPrices ? priceSeries.slice() : generatePriceSeries(steps);
  if (prices.length < 2) {
    // Fall back to synthetic if provided series is too short
    prices.splice(0, prices.length, ...generatePriceSeries(steps));
  }
  let btcPrice = prices[0];

  let investors = [];
  let managers = [];

  // Pool state
  let cash = 0;           // unutilized USD
  let investedBTC = 0;    // BTC quantity
  let totalTokens = 0;    // share tokens
  let poolValue = 0;
  let poolValuePrev = 0;
  let cumulativeFees = 0;
  let riskLevel = initialRiskLevel; // target utilization 0..1

  // ---- Initialize investors ----
  for (let i = 0; i < initialInvestors; i++) {
    const t = pickInvestorType();
    const wealth = t.min + Math.random() * (t.max - t.min);
    const deposit = wealth * (0.4 + 0.4 * Math.random()); // invest 40–80%

    const tokenPrice = totalTokens > 0 && poolValue > 0 ? poolValue / totalTokens : 1;
    const minted = deposit / tokenPrice;
    cash += deposit;
    totalTokens += minted;
    poolValue = cash + investedBTC * btcPrice;

    investors.push({
      id: "inv_" + i,
      type: t.type,
      wealth,
      tokens: minted,
      k: t.k,
      c: t.c,
      active: true,
      entryStep: 0
    });
  }

  // ---- Initialize managers ----
  for (let j = 0; j < initialManagers; j++) {
    const t = pickManagerType();
    const aum = t.minAUM + Math.random() * (t.maxAUM - t.minAUM);
    managers.push({
      id: "mgr_" + j,
      type: t.type,
      aum,
      k: t.k,
      c: t.c,
      feeAccrued: 0
    });
  }

  // Initial rebalance to target risk
  poolValue = cash + investedBTC * btcPrice;
  let desiredInvested = poolValue * riskLevel;
  if (desiredInvested > 0) {
    const toInvest = Math.min(desiredInvested, cash);
    investedBTC += toInvest / btcPrice;
    cash -= toInvest;
    poolValue = cash + investedBTC * btcPrice;
  }
  poolValuePrev = poolValue;

  const metrics = [];

  // ---- Time loop ----
  const totalSteps = Math.min(steps, prices.length);
  for (let t = 1; t < totalSteps; t++) {
    const oldPrice = btcPrice;
    btcPrice = prices[t];

    // 1) Market move on BTC exposure
    const investedValuePrev = investedBTC * oldPrice;
    const investedValueNew = investedBTC * btcPrice;
    let poolBefore = poolValuePrev;
    let poolAfterMarket = cash + investedValueNew;

    const g = poolValuePrev > 0 ? (poolAfterMarket - poolValuePrev) / poolValuePrev : 0;

    // 2) Utilization after market move
    const utilization = poolAfterMarket > 0 ? investedValueNew / poolAfterMarket : 0;

    // 3) Profit and manager fees (only on positive profit)
    const profit = Math.max(poolAfterMarket - poolValuePrev, 0);
    const feeRate = ps0 + (ps1 - ps0) * utilization;
    let managerFee = profit * feeRate;

    if (managerFee > 0 && poolAfterMarket > 0) {
      // Deduct fee from pool (cash first, then BTC)
      let remaining = managerFee;
      if (cash >= remaining) {
        cash -= remaining;
        remaining = 0;
      } else {
        remaining -= cash;
        cash = 0;
      }
      if (remaining > 0) {
        const btcToSell = remaining / btcPrice;
        investedBTC = Math.max(0, investedBTC - btcToSell);
      }
      cumulativeFees += managerFee;

      // Distribute to managers based on their AUM proportion
      let totalAUM = managers.reduce((acc, m) => acc + m.aum, 0);
      if (totalAUM <= 0) totalAUM = 1;
      for (const m of managers) {
        const w = m.aum / totalAUM;
        m.feeAccrued += managerFee * w;
      }
    }

    // Recompute pool after fees
    let poolAfterFees = cash + investedBTC * btcPrice;

    // 4) Managers derisk / rerisk -> adjust global riskLevel
    if (managers.length > 0) {
      let avgDeriskProb = 0;
      for (const m of managers) {
        avgDeriskProb += logistic(g, m.k, m.c);
      }
      avgDeriskProb /= managers.length;

      if (avgDeriskProb > 0.5) {
        riskLevel = clamp(riskLevel - 0.03, 0, 1);
      } else if (avgDeriskProb < 0.2 && g > 0) {
        riskLevel = clamp(riskLevel + 0.02, 0, 1);
      }
    }

    // Rebalance to riskLevel (target utilization)
    poolAfterFees = cash + investedBTC * btcPrice;
    let targetInvested = poolAfterFees * riskLevel;
    let currentInvested = investedBTC * btcPrice;

    if (targetInvested > currentInvested) {
      const toInvest = Math.min(targetInvested - currentInvested, cash);
      investedBTC += toInvest / btcPrice;
      cash -= toInvest;
    } else if (targetInvested < currentInvested) {
      const diff = currentInvested - targetInvested;
      const btcToSell = diff / btcPrice;
      investedBTC = Math.max(0, investedBTC - btcToSell);
      cash += diff;
    }

    // 5) Investor exits (logistic based on pool growth)
    poolValue = cash + investedBTC * btcPrice;
    const tokenPrice = totalTokens > 0 && poolValue > 0 ? poolValue / totalTokens : 1;
    let exitsThisStep = 0;

    for (const inv of investors) {
      if (!inv.active || inv.tokens <= 0) continue;
      const contractAge = t - (inv.entryStep ?? 0);
      const forcedExit = contractAge >= 365; // auto-terminate after 1 year
      let shouldExit = forcedExit;

      if (!shouldExit && poolValuePrev > 0) {
        const pExit = logistic(g, inv.k, inv.c);
        shouldExit = Math.random() < pExit;
      }

      if (shouldExit) {
        // Exit: redeem tokens and distribute value
        const payout = inv.tokens * tokenPrice;
        let remaining = payout;
        if (cash >= remaining) {
          cash -= remaining;
          remaining = 0;
        } else {
          remaining -= cash;
          cash = 0;
        }
        if (remaining > 0) {
          const btcToSell = remaining / btcPrice;
          investedBTC = Math.max(0, investedBTC - btcToSell);
        }
        totalTokens -= inv.tokens;
        inv.tokens = 0;
        inv.active = false;
        exitsThisStep++;
      }
    }

    // 6) New investor arrivals
    const arrivals = Math.random() < arrivalRate ? (1 + Math.floor(Math.random() * 3)) : 0;
    for (let k = 0; k < arrivals; k++) {
      const tType = pickInvestorType();
      const wealth = tType.min + Math.random() * (tType.max - tType.min);
      const deposit = wealth * (0.3 + 0.3 * Math.random());

      const currentPool = cash + investedBTC * btcPrice;
      const tPrice = totalTokens > 0 && currentPool > 0 ? currentPool / totalTokens : 1;
      const minted = deposit / tPrice;
      cash += deposit;
      totalTokens += minted;

      investors.push({
        id: "inv_new_" + t + "_" + k + "_" + Math.random().toString(16).slice(2),
        type: tType.type,
      wealth,
      tokens: minted,
      k: tType.k,
      c: tType.c,
      active: true,
      entryStep: t
    });
  }

    // 7) Final pool state for this step
    poolValue = cash + investedBTC * btcPrice;
    const finalTokenPrice = totalTokens > 0 && poolValue > 0 ? poolValue / totalTokens : 1;
    const finalUtilization = poolValue > 0 ? (investedBTC * btcPrice) / poolValue : 0;

    const activeInvestors = investors.filter(inv => inv.active && inv.tokens > 0).length;

    metrics.push({
      t,
      poolValue,
      tokenPrice: finalTokenPrice,
      utilization: finalUtilization,
      feeRate,
      activeInvestors,
      exits: exitsThisStep,
      cumulativeFees,
      riskLevel,
      btcPrice
    });

    poolValuePrev = poolValue;
  }

  return { metrics };
}
