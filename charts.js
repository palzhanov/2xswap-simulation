
// ---- Chart helpers (uses global Chart from CDN) ----

let poolChart = null;
let utilChart = null;
let btcChart = null;

function initCharts(metrics) {
  const labels = metrics.map(m => m.t);
  const poolSeries = metrics.map(m => m.poolValue);
  const tokenSeries = metrics.map(m => m.tokenPrice);
  const utilSeries = metrics.map(m => m.utilization * 100);
  const feeRateSeries = metrics.map(m => m.feeRate * 100);
  const btcSeries = metrics.map(m => m.btcPrice);

  const poolCtx = document.getElementById("poolChart").getContext("2d");
  const utilCtx = document.getElementById("utilChart").getContext("2d");
  const btcCtx = document.getElementById("btcChart").getContext("2d");

  if (poolChart) poolChart.destroy();
  if (utilChart) utilChart.destroy();
  if (btcChart) btcChart.destroy();

  poolChart = new Chart(poolCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Pool value",
          data: poolSeries,
          fill: false,
          tension: 0.15
        },
        {
          label: "Token price",
          data: tokenSeries,
          fill: false,
          tension: 0.15,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e5e7eb", font: { size: 10 } } }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxTicksLimit: 8 },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "Time step", color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "Pool value", color: "#9ca3af" }
        },
        y1: {
          position: "right",
          ticks: { color: "#38bdf8" },
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Token price", color: "#38bdf8" }
        }
      }
    }
  });

  utilChart = new Chart(utilCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Utilization (%)",
          data: utilSeries,
          fill: false,
          tension: 0.15
        },
        {
          label: "Fee rate (%)",
          data: feeRateSeries,
          fill: false,
          tension: 0.15
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e5e7eb", font: { size: 10 } } }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxTicksLimit: 8 },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "Time step", color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "Percent", color: "#9ca3af" }
        }
      }
    }
  });

  btcChart = new Chart(btcCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "BTC price (USD)",
          data: btcSeries,
          fill: false,
          tension: 0.12,
          borderColor: "#fbbf24",
          backgroundColor: "#fbbf24"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e5e7eb", font: { size: 10 } } }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxTicksLimit: 8 },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "Time step", color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(148,163,184,0.15)" },
          title: { display: true, text: "BTC price (USD)", color: "#9ca3af" }
        }
      }
    }
  });
}

function destroyCharts() {
  if (poolChart) {
    poolChart.destroy();
    poolChart = null;
  }
  if (utilChart) {
    utilChart.destroy();
    utilChart = null;
  }
  if (btcChart) {
    btcChart.destroy();
    btcChart = null;
  }
}
