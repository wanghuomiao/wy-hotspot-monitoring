import { getDashboardData } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const data = await getDashboardData();
  return Response.json(data);
}