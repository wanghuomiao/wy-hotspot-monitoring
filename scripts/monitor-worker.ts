import { runMonitoringCycle } from "../lib/monitor";

const intervalMs = Number(process.env.WORKER_TICK_MS || 300_000);

async function tick() {
  try {
    const result = await runMonitoringCycle();
    console.log(`[worker] ${new Date().toISOString()} processed=${result.processedMonitors} newHotspots=${result.newHotspots} notifications=${result.notifications}`);
  } catch (error) {
    console.error("[worker]", error);
  }
}

void tick();
setInterval(() => {
  void tick();
}, intervalMs);