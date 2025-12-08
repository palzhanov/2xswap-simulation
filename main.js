
// ---- UI wiring & controls ----

function formatMoney(x) {
  if (!isFinite(x)) return "–";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (x / 1e3).toFixed(2) + "K";
  return x.toFixed(0);
}

function formatCurrency(x) {
  if (!isFinite(x)) return "–";
  const sign = x < 0 ? "-" : "";
  return sign + "$" + formatMoney(Math.abs(x));
}

function formatSignedCurrency(x) {
  if (!isFinite(x)) return "–";
  const sign = x > 0 ? "+" : x < 0 ? "-" : "";
  return sign + "$" + formatMoney(Math.abs(x));
}

const ps0Input = document.getElementById("ps0");
const ps1Input = document.getElementById("ps1");
const stepsInput = document.getElementById("steps");
const arrivalInput = document.getElementById("arrivalRate");
const managerArrivalInput = document.getElementById("managerArrivalRate");
const minInvestorDaysInput = document.getElementById("minInvestorDays");
const managerUtilLimitInput = document.getElementById("managerUtilLimit");
const priceModeInputs = document.querySelectorAll("input[name=priceMode]");

const ps0Label = document.getElementById("ps0Label");
const ps1Label = document.getElementById("ps1Label");
const stepsLabel = document.getElementById("stepsLabel");
const arrivalLabel = document.getElementById("arrivalLabel");
const managerArrivalLabel = document.getElementById("managerArrivalLabel");
const minInvestorDaysLabel = document.getElementById("minInvestorDaysLabel");
const managerUtilLimitLabel = document.getElementById("managerUtilLimitLabel");
const priceModeLabel = document.getElementById("priceModeLabel");

const runBtn = document.getElementById("runBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const priceSourceStatus = document.getElementById("priceSourceStatus");

const metricTime = document.getElementById("metricTime");
const metricPool = document.getElementById("metricPool");
const metricToken = document.getElementById("metricToken");
const metricUtil = document.getElementById("metricUtil");
const metricInvestors = document.getElementById("metricInvestors");
const metricManagers = document.getElementById("metricManagers");
const investorProfitBody = document.getElementById("investorProfitBody");
const investorLossBody = document.getElementById("investorLossBody");
const managerProfitBody = document.getElementById("managerProfitBody");
const managerLossBody = document.getElementById("managerLossBody");
const exitQueueBody = document.getElementById("exitQueueBody");
const transactionsBody = document.getElementById("transactionsBody");
const transactionsFilter = document.getElementById("transactionsFilter");

function buildOutcomeSummary(sim) {
  const inv = Array.isArray(sim?.investorPnL) ? sim.investorPnL : [];
  const mgr = Array.isArray(sim?.managerPnL) ? sim.managerPnL : [];
  const invWins = inv.filter(p => p.profit > 0).length;
  const invLosses = inv.length - invWins;
  const mgrWins = mgr.filter(p => p.profit > 0).length;
  const mgrLosses = mgr.length - mgrWins;
  return {
    investor: { wins: invWins, losses: invLosses },
    manager: { wins: mgrWins, losses: mgrLosses }
  };
}

const timeSliderContainer = document.getElementById("timeSliderContainer");
const timeSlider = document.getElementById("timeSlider");
const timeCursorLabel = document.getElementById("timeCursorLabel");

let currentSim = null;
let playInterval = null;
let currentIndex = 0;
let cachedHistorical = null;

function updateLabels() {
  ps0Label.textContent = Math.round(ps0Input.value * 100) + "%";
  ps1Label.textContent = Math.round(ps1Input.value * 100) + "%";
  stepsLabel.textContent = stepsInput.value;
  arrivalLabel.textContent = parseFloat(arrivalInput.value).toFixed(2);
  managerArrivalLabel.textContent = parseFloat(managerArrivalInput.value).toFixed(2);
  minInvestorDaysLabel.textContent = minInvestorDaysInput.value;
  managerUtilLimitLabel.textContent = Math.round(managerUtilLimitInput.value * 100) + "%";
  const mode = document.querySelector("input[name=priceMode]:checked");
  priceModeLabel.textContent = mode && mode.value === "historical" ? "Historical" : "Synthetic";
}

[ps0Input, ps1Input, stepsInput, arrivalInput, managerArrivalInput, minInvestorDaysInput, managerUtilLimitInput]
  .forEach(el => el.addEventListener("input", updateLabels));

function adjustStepsForMode(mode) {
  const maxSteps = 730; // 2 years
  stepsInput.max = maxSteps;
  if (parseInt(stepsInput.value, 10) > maxSteps) {
    stepsInput.value = maxSteps;
  }
  updateLabels();
}

priceModeInputs.forEach(el => {
  el.addEventListener("change", (evt) => {
    const mode = evt.target.value;
    adjustStepsForMode(mode);
    priceSourceStatus.textContent = mode === "historical"
      ? "Will fetch 3y daily BTC prices on run"
      : "Synthetic random walk";
  });
});

function updateMetricsAtIndex(idx) {
  if (!currentSim) return;
  const m = currentSim.metrics[idx];
  currentIndex = idx;
  timeCursorLabel.textContent = "t = " + m.t;
  metricTime.textContent = m.t;
  metricPool.textContent = "$" + formatMoney(m.poolValue);
  metricToken.textContent = m.tokenPrice.toFixed(4);
  metricUtil.textContent = (m.utilization * 100).toFixed(1) + "%";
  metricInvestors.textContent = m.activeInvestors;
  metricManagers.textContent = m.activeManagers ?? "–";
}

timeSlider.addEventListener("input", () => {
  const idx = parseInt(timeSlider.value, 10);
  updateMetricsAtIndex(idx);
});

function renderLeaderboardRows(bodyEl, rows) {
  bodyEl.innerHTML = "";
  if (!rows || rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No data";
    tr.appendChild(td);
    bodyEl.appendChild(tr);
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${formatCurrency(row.invested)}</td>
      <td>${formatCurrency(row.exitAmount)}</td>
      <td class="${row.profit >= 0 ? "pos" : "neg"}">${formatSignedCurrency(row.profit)}</td>
      <td>${row.days ?? "–"}</td>
    `;
    bodyEl.appendChild(tr);
  });
}

function updateLeaderboards(sim) {
  if (!sim) {
    clearLeaderboards("Run simulation to see results");
    return;
  }
  const invPnL = Array.isArray(sim.investorPnL) ? sim.investorPnL : [];
  const mgrPnL = Array.isArray(sim.managerPnL) ? sim.managerPnL : [];

  const invTopProfits = [...invPnL].sort((a, b) => b.profit - a.profit).slice(0, 10);
  const invTopLosses = [...invPnL].sort((a, b) => a.profit - b.profit).slice(0, 10);
  const mgrTopProfits = [...mgrPnL].sort((a, b) => b.profit - a.profit).slice(0, 10);
  const mgrTopLosses = [...mgrPnL].sort((a, b) => a.profit - b.profit).slice(0, 10);

  renderLeaderboardRows(investorProfitBody, invTopProfits);
  renderLeaderboardRows(investorLossBody, invTopLosses);
  renderLeaderboardRows(managerProfitBody, mgrTopProfits);
  renderLeaderboardRows(managerLossBody, mgrTopLosses);

  const outcomes = buildOutcomeSummary(sim);
  updateOutcomePies(outcomes);
  renderExitQueue(sim.exitQueue || []);
  renderTransactions(sim.transactions || []);
}

function clearLeaderboards(message) {
  [investorProfitBody, investorLossBody, managerProfitBody, managerLossBody].forEach(body => {
    body.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = message;
    tr.appendChild(td);
    body.appendChild(tr);
  });
}

function clearExitQueue(message) {
  exitQueueBody.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 3;
  td.textContent = message;
  tr.appendChild(td);
  exitQueueBody.appendChild(tr);
}

function clearTransactions(message) {
  transactionsBody.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 9;
  td.textContent = message;
  tr.appendChild(td);
  transactionsBody.appendChild(tr);
}

function renderExitQueue(entries) {
  exitQueueBody.innerHTML = "";
  if (!entries || !entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "Queue empty";
    tr.appendChild(td);
    exitQueueBody.appendChild(tr);
    return;
  }
  entries.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${(item.tokens ?? 0).toFixed(4)}</td>
      <td>${formatCurrency(item.remainingUSD ?? 0)}</td>
    `;
    exitQueueBody.appendChild(tr);
  });
}

function renderTransactions(entries) {
  const filter = transactionsFilter?.value || "all";
  const filtered = filter === "all" ? entries : (entries || []).filter(tx => tx.type === filter);
  const list = filtered || [];
  transactionsBody.innerHTML = "";
  if (!list.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = "No transactions";
    tr.appendChild(td);
    transactionsBody.appendChild(tr);
    return;
  }

  list.forEach(tx => {
    const tr = document.createElement("tr");
    const tokenText = typeof tx.tokens === "number"
      ? (tx.tokens >= 0 ? "+" : "") + tx.tokens.toFixed(4)
      : "–";
    const mgrShare = typeof tx.managerShare === "number" ? formatSignedCurrency(tx.managerShare) : "–";
    const poolShare = typeof tx.poolShare === "number" ? formatSignedCurrency(tx.poolShare) : "–";
    const managerInvest = typeof tx.managerInvest === "number" ? formatCurrency(tx.managerInvest) : "–";
    const poolMatch = typeof tx.poolMatch === "number" ? formatCurrency(tx.poolMatch) : "–";
    tr.innerHTML = `
      <td>${tx.type}</td>
      <td>${tx.day ?? "–"}</td>
      <td>${tx.btcPrice ? formatCurrency(tx.btcPrice) : "–"}</td>
      <td>${formatCurrency(tx.amountUSD ?? 0)}</td>
      <td>${tokenText}</td>
      <td>${managerInvest}</td>
      <td>${poolMatch}</td>
      <td>${mgrShare}</td>
      <td>${poolShare}</td>
    `;
    transactionsBody.appendChild(tr);
  });
}

function stopPlayback() {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
  playPauseBtn.textContent = "Play";
}

playPauseBtn.addEventListener("click", () => {
  if (!currentSim) return;
  if (playInterval) {
    stopPlayback();
    return;
  }
  playPauseBtn.textContent = "Pause";
  playInterval = setInterval(() => {
    if (currentIndex >= currentSim.metrics.length - 1) {
      stopPlayback();
      return;
    }
    currentIndex++;
    timeSlider.value = currentIndex.toString();
    updateMetricsAtIndex(currentIndex);
  }, 80);
});

resetBtn.addEventListener("click", () => {
  stopPlayback();
  currentSim = null;
  destroyCharts();
  destroyPieCharts();
  timeSliderContainer.style.display = "none";
  metricTime.textContent = "–";
  metricPool.textContent = "–";
  metricToken.textContent = "–";
  metricUtil.textContent = "–";
  metricInvestors.textContent = "–";
  metricManagers.textContent = "–";
  playPauseBtn.disabled = true;
  resetBtn.disabled = true;
  clearLeaderboards("Reset — run again");
  clearExitQueue("Reset — run again");
  clearTransactions("No transactions");
});

async function fetchHistoricalPrices() {
  if (cachedHistorical && cachedHistorical.length > 0) {
    return cachedHistorical;
  }
  const url = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1095&interval=daily";
  priceSourceStatus.textContent = "Fetching 3y BTC history…";
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error("BTC price fetch failed (" + resp.status + ")");
  }
  const data = await resp.json();
  const prices = Array.isArray(data.prices) ? data.prices.map(p => Number(p[1])) : [];
  if (!prices.length) {
    throw new Error("BTC price response was empty");
  }
  cachedHistorical = prices;
  priceSourceStatus.textContent = "Historical mode: " + prices.length + " days loaded";
  return prices;
}

runBtn.addEventListener("click", async () => {
  stopPlayback();
  runBtn.disabled = true;
  runBtn.textContent = "Running…";

  try {
    const params = {
      ps0: parseFloat(ps0Input.value),
      ps1: parseFloat(ps1Input.value),
      steps: parseInt(stepsInput.value, 10),
      arrivalRate: parseFloat(arrivalInput.value),
      managerArrivalRate: parseFloat(managerArrivalInput.value),
      minInvestorDays: parseInt(minInvestorDaysInput.value, 10),
      managerUtilThreshold: parseFloat(managerUtilLimitInput.value)
    };

    const selectedMode = document.querySelector("input[name=priceMode]:checked")?.value || "synthetic";
    if (selectedMode === "historical") {
      try {
        const historical = await fetchHistoricalPrices();
        params.priceSeries = historical;
        params.steps = Math.min(params.steps, historical.length);
      } catch (err) {
        console.error("Historical price load failed, falling back to synthetic", err);
        priceSourceStatus.textContent = "Historical fetch failed, using synthetic";
      }
    } else {
      priceSourceStatus.textContent = "Synthetic random walk";
    }

    const sim = runSimulation(params);
    currentSim = sim;

    initCharts(sim.metrics);
    updateLeaderboards(sim);

    timeSliderContainer.style.display = "block";
    timeSlider.min = 0;
    timeSlider.max = sim.metrics.length - 1;
    timeSlider.value = sim.metrics.length - 1;
    updateMetricsAtIndex(sim.metrics.length - 1);

    playPauseBtn.disabled = false;
    resetBtn.disabled = false;

    priceSourceStatus.textContent = (params.priceSeries && params.priceSeries.length)
      ? "Historical BTC (" + params.steps + " days)"
      : "Synthetic random walk";
  } catch (err) {
    console.error("Simulation failed", err);
    priceSourceStatus.textContent = "Error: " + err.message;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "▶ Run simulation";
  }
});

// Initialize labels on load
updateLabels();
adjustStepsForMode("synthetic");
clearLeaderboards("Run simulation to see results");
clearExitQueue("Queue empty");
clearTransactions("No transactions");
destroyPieCharts();

if (transactionsFilter) {
  transactionsFilter.addEventListener("change", () => {
    if (currentSim) {
      renderTransactions(currentSim.transactions || []);
    }
  });
}
