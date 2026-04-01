import { getDashboardData, runMonitoringCycle } from "@/lib/monitor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    monitorId?: string;
    force?: boolean;
  };

  const result = await runMonitoringCycle({
    monitorId: body.monitorId,
    force: body.force ?? true,
  });

  const snapshot = await getDashboardData();
  return Response.json({ result, snapshot });
}