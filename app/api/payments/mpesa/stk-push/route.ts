import { NextRequest, NextResponse } from "next/server";
import { startStkPush } from "@/lib/mpesa";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const phone = String(body.phone ?? "");
  const amountKsh = Number(body.amountKsh ?? 0);
  const accountReference = String(body.accountReference ?? "WiFi");
  const transactionDesc = String(body.transactionDesc ?? "WiFi Package");
  const method = String(body.method ?? "mpesa_paybill") as
    | "mpesa_till"
    | "mpesa_paybill"
    | "mpesa_phone";

  if (!phone || amountKsh <= 0) {
    return NextResponse.json({ error: "phone and amountKsh are required" }, { status: 400 });
  }

  const result = await startStkPush({
    phone,
    amountKsh,
    accountReference,
    transactionDesc,
    method,
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json(result);
}
