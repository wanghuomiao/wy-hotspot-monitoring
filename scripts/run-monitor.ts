import { loadEnvConfig } from "@next/env";

import { runMonitoringCycle } from "../lib/monitor";

loadEnvConfig(process.cwd());

async function main() {
  const result = await runMonitoringCycle({ force: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});