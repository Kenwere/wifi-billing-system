const PAYSTACK_BASE = "https://api.paystack.co";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${requireEnv("PAYSTACK_SECRET_KEY")}`,
  };
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountKsh: number;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountKsh * 100),
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
  });
  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message ?? "Unable to initialize Paystack transaction");
  }
  return data.data;
}

export async function verifyPaystackTransaction(reference: string) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: headers(),
  });
  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      status: string;
      reference: string;
      amount: number;
      paid_at?: string;
      metadata?: Record<string, unknown>;
    };
  };
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message ?? "Unable to verify Paystack transaction");
  }
  return data.data;
}
