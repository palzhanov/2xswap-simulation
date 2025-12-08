
// ---- Chart helpers (uses global Chart from CDN) ----

let poolChart = null;
let utilChart = null;
let btcChart = null;
let tokenChart = null;
let investorPieChart = null;
let managerPieChart = null;

const sliceLabelPlugin = {
  id: "sliceLabel",
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    if (!data?.datasets?.length) return;
    const dataset = data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    const total = (dataset.data || []).reduce((acc, v) => acc + Math.max(0, v || 0), 0);

    if (total <= 0) {
      const x = chart.width / 2;
      const y = chart.height / 2;
      ctx.save();
      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No data", x, y);
      ctx.restore();
      return;
    }

    meta.data.forEach((arc, idx) => {
      const value = dataset.data[idx];
      if (!value || value <= 0) return;
      const props = arc.getProps(["x", "y", "startAngle", "endAngle", "innerRadius", "outerRadius"], true);
      const angle = (props.startAngle + props.endAngle) / 2;
      const radius = props.innerRadius + (props.outerRadius - props.innerRadius) * 0.55;
      const x = props.x + radius * Math.cos(angle);
      const y = props.y + radius * Math.sin(angle);
      ctx.save();
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12px system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), x, y);
      ctx.restore();
    });
  }
};

Chart.register(sliceLabelPlugin);

function initCharts(metrics) {
  const labels = metrics.map(m => m.t);
  const poolSeries = metrics.map(m => m.poolValue);
  const utilSeries = metrics.map(m => m.utilization * 100);
  const btcSeries = metrics.map(m => m.btcPrice);
  const tokenSeries = metrics.map(m => m.tokenPrice);

  const poolCtx = document.getElementById("poolChart").getContext("2d");
  const utilCtx = document.getElementById("utilChart").getContext("2d");
  const btcCtx = document.getElementById("btcChart").getContext("2d");
  const tokenCtx = document.getElementById("tokenChart").getContext("2d");

  if (poolChart) poolChart.destroy();
  if (utilChart) utilChart.destroy();
  if (btcChart) btcChart.destroy();
  if (tokenChart) tokenChart.destroy();

  poolChart = new Chart(poolCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Pool value",
          data: poolSeries,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          borderColor: "#38bdf8"
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
          grid: { color: "rgba(148,163,184,0.12)" },
          title: { display: true, text: "Pool value", color: "#9ca3af" }
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
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          borderColor: "#22c55e"
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
          grid: { color: "rgba(148,163,184,0.1)" },
          title: { display: true, text: "Time step", color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(148,163,184,0.1)" },
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
          tension: 0.18,
          pointRadius: 0,
          borderWidth: 2,
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
          grid: { color: "rgba(148,163,184,0.1)" },
          title: { display: true, text: "Time step", color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "rgba(148,163,184,0.1)" },
          title: { display: true, text: "BTC price (USD)", color: "#9ca3af" }
        }
      }
    }
  });

  tokenChart = new Chart(tokenCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Token price",
          data: tokenSeries,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          borderColor: "#fbbf24"
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
          grid: { color: "rgba(148,163,184,0.1)" },
          title: { display: true, text: "Time step", color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#fbbf24" },
          grid: { color: "rgba(148,163,184,0.1)" },
          title: { display: true, text: "Token price", color: "#fbbf24" }
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
  if (tokenChart) {
    tokenChart.destroy();
    tokenChart = null;
  }
}

function updateOutcomePies(outcomes) {
  if (!outcomes) return;
  const invData = outcomes.investor || { wins: 0, losses: 0 };
  const mgrData = outcomes.manager || { wins: 0, losses: 0 };

  const invCtx = document.getElementById("investorPieChart").getContext("2d");
  const mgrCtx = document.getElementById("managerPieChart").getContext("2d");

  if (investorPieChart) investorPieChart.destroy();
  if (managerPieChart) managerPieChart.destroy();

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e5e7eb", font: { size: 10 } } },
      tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } }
    }
  };

  investorPieChart = new Chart(invCtx, {
    type: "pie",
    data: {
      labels: ["Profitable", "Loss"],
      datasets: [{
        data: [invData.wins, invData.losses],
        backgroundColor: ["#22c55e", "#ef4444"],
        borderColor: "#0f172a",
        borderWidth: 2
      }]
    },
    options: baseOptions
  });

  managerPieChart = new Chart(mgrCtx, {
    type: "pie",
    data: {
      labels: ["Profitable", "Loss"],
      datasets: [{
        data: [mgrData.wins, mgrData.losses],
        backgroundColor: ["#22c55e", "#ef4444"],
        borderColor: "#0f172a",
        borderWidth: 2
      }]
    },
    options: baseOptions
  });
}

function destroyPieCharts() {
  if (investorPieChart) {
    investorPieChart.destroy();
    investorPieChart = null;
  }
  if (managerPieChart) {
    managerPieChart.destroy();
    managerPieChart = null;
  }
}
