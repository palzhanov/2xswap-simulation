
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

const investorCountInput = document.getElementById("investorCount");
const managerCountInput = document.getElementById("managerCount");
const ps0Input = document.getElementById("ps0");
const ps1Input = document.getElementById("ps1");
const stepsInput = document.getElementById("steps");
const arrivalInput = document.getElementById("arrivalRate");
const riskInput = document.getElementById("riskLevel");
const priceModeInputs = document.querySelectorAll("input[name=priceMode]");

const investorCountLabel = document.getElementById("investorCountLabel");
const managerCountLabel = document.getElementById("managerCountLabel");
const ps0Label = document.getElementById("ps0Label");
const ps1Label = document.getElementById("ps1Label");
const stepsLabel = document.getElementById("stepsLabel");
const arrivalLabel = document.getElementById("arrivalLabel");
const riskLabel = document.getElementById("riskLabel");
const priceModeLabel = document.getElementById("priceModeLabel");

const runBtn = document.getElementById("runBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const priceSourceStatus = document.getElementById("priceSourceStatus");

const metricTime = document.getElementById("metricTime");
const metricPool = document.getElementById("metricPool");
const metricToken = document.getElementById("metricToken");
const metricUtil = document.getElementById("metricUtil");
const metricFeeRate = document.getElementById("metricFeeRate");
const metricInvestors = document.getElementById("metricInvestors");

const timeSliderContainer = document.getElementById("timeSliderContainer");
const timeSlider = document.getElementById("timeSlider");
const timeCursorLabel = document.getElementById("timeCursorLabel");

let currentSim = null;
let playInterval = null;
let currentIndex = 0;
let cachedHistorical = null;

function updateLabels() {
  investorCountLabel.textContent = investorCountInput.value;
  managerCountLabel.textContent = managerCountInput.value;
  ps0Label.textContent = Math.round(ps0Input.value * 100) + "%";
  ps1Label.textContent = Math.round(ps1Input.value * 100) + "%";
  stepsLabel.textContent = stepsInput.value;
  arrivalLabel.textContent = parseFloat(arrivalInput.value).toFixed(2);
  riskLabel.textContent = Math.round(riskInput.value * 100) + "%";
  const mode = document.querySelector("input[name=priceMode]:checked");
  priceModeLabel.textContent = mode && mode.value === "historical" ? "Historical" : "Synthetic";
}

[investorCountInput, managerCountInput, ps0Input, ps1Input, stepsInput, arrivalInput, riskInput]
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
  metricFeeRate.textContent = (m.feeRate * 100).toFixed(2) + "%";
  metricInvestors.textContent = m.activeInvestors;
}

timeSlider.addEventListener("input", () => {
  const idx = parseInt(timeSlider.value, 10);
  updateMetricsAtIndex(idx);
});

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
  timeSliderContainer.style.display = "none";
  metricTime.textContent = "–";
  metricPool.textContent = "–";
  metricToken.textContent = "–";
  metricUtil.textContent = "–";
  metricFeeRate.textContent = "–";
  metricInvestors.textContent = "–";
  playPauseBtn.disabled = true;
  resetBtn.disabled = true;
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
      initialInvestors: parseInt(investorCountInput.value, 10),
      initialManagers: parseInt(managerCountInput.value, 10),
      ps0: parseFloat(ps0Input.value),
      ps1: parseFloat(ps1Input.value),
      steps: parseInt(stepsInput.value, 10),
      arrivalRate: parseFloat(arrivalInput.value),
      initialRiskLevel: parseFloat(riskInput.value)
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
