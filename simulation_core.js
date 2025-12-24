
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

function shouldInvestorEnter(g) {
  // higher probability to enter when recent growth is positive
  const base = 0.15;
  const sensitivity = 0.8;
  const prob = clamp(base + sensitivity * clamp(g, -0.1, 0.2), 0.02, 0.8);
  return Math.random() < prob;
}

function shouldManagerEnter(g) {
  const base = 0.1;
  const sensitivity = 0.6;
  const prob = clamp(base + sensitivity * clamp(g, -0.1, 0.2), 0.01, 0.6);
  return Math.random() < prob;
}

function investorTopUpAmount(inv) {
  // allow modest top-ups relative to original wealth
  const frac = 0.05 + Math.random() * 0.1;
  return inv.wealth * frac;
}

function processExitQueue(state) {
  const { exitQueue } = state;
  let { cash } = state;
  for (let i = 0; i < exitQueue.length; ) {
    if (cash <= 0) break;
    const q = exitQueue[i];
    const pay = Math.min(cash, q.remainingUSD);
    cash -= pay;
    q.remainingUSD -= pay;
    q.paidUSD += pay;
    q.investor.exitAmount = q.paidUSD + q.remainingUSD;
    if (q.remainingUSD <= 1e-6) {
      exitQueue.splice(i, 1);
    } else {
      i++;
    }
  }
  state.cash = cash;
}

// ---- Main simulation entry point ----
function runSimulation(params) {
  const {
    ps0,
    ps1,
    steps,
    arrivalRate,
    managerArrivalRate,
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
  let managerLockedBTC = 0; // BTC locked in manager-matched contracts
  let totalTokens = 0;    // share tokens
  let poolValue = 0;
  let poolValuePrev = 0;
  let cumulativeFees = 0;
  let lastProfitShareRate = ps0;
  let exitQueue = [];
  let transactions = [];
  // Start with no investors or managers; entry happens via decision functions during simulation

  // Initial pool value
  poolValue = cash + managerLockedBTC * btcPrice;
  poolValuePrev = poolValue;

  const metrics = [];
  const managerArrivalChance = clamp(typeof managerArrivalRate === "number" ? managerArrivalRate : 0.70, 0, 1);
  const managerArrivalMax = 50;
  const minInvestorDays = Math.max(1, parseInt(params.minInvestorDays ?? 365, 10));
  const managerUtilLimit = clamp(typeof params.managerUtilThreshold === "number" ? params.managerUtilThreshold : 0.9, 0.8, 1);

  const payQueue = () => {
    const st = { cash, exitQueue };
    processExitQueue(st);
    cash = st.cash;
  };

  // ---- Time loop ----
  const totalSteps = Math.min(steps, prices.length);
  for (let t = 1; t < totalSteps; t++) {
    const oldPrice = btcPrice;
    btcPrice = prices[t];

    // 1) Market move on BTC exposure
    const totalInvestedBTC = managerLockedBTC;
    const investedValuePrev = totalInvestedBTC * oldPrice;
    const investedValueNew = totalInvestedBTC * btcPrice;
    let poolAfterMarket = cash + investedValueNew;

    const g = poolValuePrev > 0 ? (poolAfterMarket - poolValuePrev) / poolValuePrev : 0;

    // 2) Utilization after market move
    const utilization = poolAfterMarket > 0 ? investedValueNew / poolAfterMarket : 0;

    // 3) Profit share rate driven by utilization
    const profitShareRate = ps0 + (ps1 - ps0) * utilization;
    lastProfitShareRate = profitShareRate;

    // Recompute pool after any price move (no separate fees now)
    let poolAfterFees = cash + managerLockedBTC * btcPrice;

    // Investor top-ups (existing holders adding more)
    poolValue = cash + managerLockedBTC * btcPrice;
    const tokenPriceTopUp = totalTokens > 0 && poolValue > 0 ? poolValue / totalTokens : 1;
    for (const inv of investors) {
      if (!inv.active || inv.tokens <= 0) continue;
      const topUpProb = clamp(0.05 + g, 0, 0.35);
      if (Math.random() < topUpProb) {
        const add = investorTopUpAmount(inv);
        const minted = tokenPriceTopUp > 0 ? add / tokenPriceTopUp : 0;
        cash += add;
        payQueue();
        totalTokens += minted;
        inv.tokens += minted;
        inv.invested += add;
        transactions.push({
          type: "investor_topup",
          day: t,
          btcPrice,
          amountUSD: add,
          tokens: minted
        });
      }
    }

    // 5) Manager exits (logistic based on pool growth)
    for (const mgr of managers) {
      if (!mgr.open || mgr.btc <= 0) continue;
      const contractAge = t - (mgr.entryStep ?? 0);
      const forcedExit = contractAge >= 365;
      let shouldExit = forcedExit;

      if (!shouldExit && poolValuePrev > 0) {
        const pExit = logistic(g, mgr.k, mgr.c);
        shouldExit = Math.random() < pExit;
      }

      if (shouldExit) {
        const proceeds = mgr.btc * btcPrice;
        const totalInitial = mgr.stake + mgr.poolMatch;
        const pnl = proceeds - totalInitial;
        let managerPayout = 0;
        let poolShare = 0;
        let managerShare = 0;

        if (pnl >= 0) {
          const rate = mgr.feeRate ?? profitShareRate;
          managerShare = pnl * rate;
          poolShare = pnl - managerShare;
          managerPayout = mgr.stake + managerShare;
          cumulativeFees += poolShare;
        } else {
          poolShare = Math.min(proceeds, mgr.poolMatch);
          const remainingAfterPool = proceeds - poolShare;
          managerPayout = Math.max(0, remainingAfterPool);
          managerShare = managerPayout; // - mgr.stake;
        }

        cash += proceeds;
        managerLockedBTC = Math.max(0, managerLockedBTC - mgr.btc);
        cash -= Math.min(cash, managerPayout);
        
        mgr.payout = managerPayout;
        mgr.profit = managerPayout - mgr.stake;
        mgr.exitStep = t;
        mgr.open = false;
        mgr.btc = 0;
        payQueue();

        transactions.push({
          type: "manager_exit",
          day: t,
          btcPrice,
          amountUSD: managerPayout,
          tokens: 0,
          managerShare,
          poolShare
        });
      }
    }

    // Manager entries (decision-based) gated by utilization and pool cash matching
    if (utilization < managerUtilLimit && Math.random() < managerArrivalChance) {
      const newManagers = 1 + Math.floor(Math.random() * managerArrivalMax);
      for (let mIdx = 0; mIdx < newManagers; mIdx++) {
        if (!shouldManagerEnter(g)) continue;
        const tType = pickManagerType();
        const aum = tType.minAUM + Math.random() * (tType.maxAUM - tType.minAUM);
        if (cash < aum) continue; // pool must match manager stake with its own cash
        const stake = aum;
        const poolMatch = aum;
        const totalToInvest = stake + poolMatch;
        cash -= poolMatch;
        const btcBought = totalToInvest > 0 ? totalToInvest / btcPrice : 0;
        managerLockedBTC += btcBought;

        managers.push({
          id: "mgr_new_" + t + "_" + mIdx + "_" + Math.random().toString(16).slice(2),
          type: tType.type,
          aum: stake,
          k: tType.k,
          c: tType.c,
          stake,
          poolMatch,
          btc: btcBought,
          entryPrice: btcPrice,
          entryStep: t,
          feeRate: profitShareRate,
          open: btcBought > 0,
          profit: 0,
          payout: 0,
          exitStep: null
        });

        transactions.push({
          type: "manager_entry",
          day: t,
          btcPrice,
          amountUSD: totalToInvest,
          tokens: 0,
          managerInvest: stake,
          poolMatch
        });
      }
    }

    // 6) Investor exits (logistic based on pool growth)
    poolValue = cash + managerLockedBTC * btcPrice;
    const tokenPrice = totalTokens > 0 && poolValue > 0 ? poolValue / totalTokens : 1;
    let exitsThisStep = 0;

    for (const inv of investors) {
      if (!inv.active || inv.tokens <= 0) continue;
      const contractAge = t - (inv.entryStep ?? 0);
      const forcedExit = contractAge >= Math.max(minInvestorDays, 540); // hard cap near 18 months
      let shouldExit = forcedExit;

      if (!shouldExit && poolValuePrev > 0 && contractAge >= minInvestorDays) {
        const pExitRaw = logistic(g, inv.k, inv.c);
        const exitScale = contractAge < (minInvestorDays + 180) ? 0.6 : 1;
        const pExit = pExitRaw * exitScale;
        shouldExit = Math.random() < pExit;
      }

      if (shouldExit) {
        // Exit: redeem tokens, use cash first, queue remainder
        const payout = inv.tokens * tokenPrice;
        const requestedTokens = inv.tokens;
        let paid = Math.min(cash, payout);
        cash -= paid;
        let remaining = payout - paid;
        let tokensBurnt = paid / tokenPrice;
        totalTokens -= tokensBurnt;
        inv.tokens -= tokensBurnt;
        inv.exitAmount = (inv.exitAmount || 0) + paid;
        inv.paidOut = (inv.paidOut || 0) + paid;
        inv.exitStep = t;
        exitsThisStep++;
        if( remaining > 0){
          inv.active = true;
          transactions.push({
            type: "investor_partial_withdrawal",
            day: t,
            btcPrice,
            amountUSD: paid,
            tokens: -tokensBurnt
          });

        } else{
          inv.active = false;
          transactions.push({
            type: "investor_exit",
            day: t,
            btcPrice,
            amountUSD: paid,
            tokens: -requestedTokens
          });

        }

        
      }
    }

    // 6) New investor arrivals
    const arrivals = Math.random() < arrivalRate ? (1 + Math.floor(Math.random() * 3)) : 0;
    for (let k = 0; k < arrivals; k++) {
      if (!shouldInvestorEnter(g)) continue;
      const tType = pickInvestorType();
      const wealth = tType.min + Math.random() * (tType.max - tType.min);
      const deposit = wealth * (0.3 + 0.3 * Math.random());

      const currentPool = cash + managerLockedBTC * btcPrice;
      const tPrice = totalTokens > 0 && currentPool > 0 ? currentPool / totalTokens : 1;
      const minted = deposit / tPrice;
      cash += deposit;
      totalTokens += minted;
      payQueue();

      investors.push({
        id: "inv_new_" + t + "_" + k + "_" + Math.random().toString(16).slice(2),
        type: tType.type,
        wealth,
        tokens: minted,
        k: tType.k,
        c: tType.c,
        active: true,
        entryStep: t,
        invested: deposit,
        exitAmount: 0,
        exitStep: null
      });
      transactions.push({
        type: "investor_deposit",
        day: t,
        btcPrice,
        amountUSD: deposit,
        tokens: minted
      });
    }

    // 7) Final pool state for this step
    poolValue = cash + managerLockedBTC * btcPrice;
    const finalTokenPrice = totalTokens > 0 && poolValue > 0 ? poolValue / totalTokens : 1;
    const finalUtilization = poolValue > 0 ? (managerLockedBTC * btcPrice) / poolValue : 0;

    const activeInvestors = investors.filter(inv => inv.active && inv.tokens > 0).length;
    const activeManagers = managers.filter(m => m.open && m.btc > 0).length;

    metrics.push({
      t,
      poolValue,
      tokenPrice: finalTokenPrice,
      utilization: finalUtilization,
      activeInvestors,
      activeManagers,
      exits: exitsThisStep,
      cumulativeFees,
      btcPrice
    });

    poolValuePrev = poolValue;
  }

  const finalPoolValue = poolValuePrev;
  const finalStep = totalSteps - 1;
  const finalTokenPrice = totalTokens > 0 && finalPoolValue > 0 ? finalPoolValue / totalTokens : 1;
  const finalProfitShare = lastProfitShareRate;

  const investorPnL = investors.map(inv => {
    const exitVal = inv.exitAmount > 0 ? inv.exitAmount : inv.tokens * finalTokenPrice;
    const heldDays = Math.max(1, (inv.exitStep ?? finalStep) - (inv.entryStep ?? 0));
    return {
      id: inv.id,
      invested: inv.invested,
      exitAmount: exitVal,
      profit: exitVal - inv.invested,
      days: heldDays
    };
  });

  const managerPnL = managers.map(m => {
    const exitVal = m.payout > 0
      ? m.payout
      : (() => {
        const proceeds = (m.btc || 0) * btcPrice;
        const totalInitial = (m.stake || 0) + (m.poolMatch || 0);
        const pnl = proceeds - totalInitial;
        if (pnl >= 0) {
          const rate = m.feeRate ?? finalProfitShare;
          return (m.stake || 0) + pnl * rate;
        }
        const poolRecovery = Math.min(proceeds, m.poolMatch || 0);
        return Math.max(0, proceeds - poolRecovery);
      })();
    const heldDays = Math.max(1, (m.exitStep ?? finalStep) - (m.entryStep ?? 0));
    return {
      id: m.id,
      invested: m.stake || 0,
      exitAmount: exitVal,
      profit: exitVal - (m.stake || 0),
      days: heldDays
    };
  });

  const exitQueueView = exitQueue.map(q => ({
    id: q.id,
    tokens: q.requestedTokens,
    remainingUSD: q.remainingUSD,
    totalUSD: q.totalUSD
  }));

  return { metrics, investorPnL, managerPnL, exitQueue: exitQueueView, transactions };
}
