const counters = new Map();
const gauges = new Map();
const histograms = new Map();

function incCounter(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value);
}

function setGauge(name, value) {
  gauges.set(name, value);
}

function observeHistogram(name, value) {
  const values = histograms.get(name) || [];
  values.push(value);
  histograms.set(name, values);
}

function snapshotMetrics() {
  return {
    counters: Object.fromEntries(counters.entries()),
    gauges: Object.fromEntries(gauges.entries()),
    histograms: Object.fromEntries(
      Array.from(histograms.entries()).map(([key, values]) => [
        key,
        {
          count: values.length,
          min: values.length ? Math.min(...values) : 0,
          max: values.length ? Math.max(...values) : 0,
          avg: values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0
        }
      ])
    )
  };
}

module.exports = {
  incCounter,
  setGauge,
  observeHistogram,
  snapshotMetrics
};