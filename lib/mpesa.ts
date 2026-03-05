import { sanitizePhone } from "@/lib/utils";

type MpesaEnv = "sandbox" | "production";

function envMode(): MpesaEnv {
  return process.env.MPESA_ENV === "production" ? "production" : "sandbox";
}

function baseUrl(): string {
  return envMode() === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function accessToken(): Promise<string> {
  const key = requireEnv("MPESA_CONSUMER_KEY");
  const secret = requireEnv("MPESA_CONSUMER_SECRET");
  const token = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${token}` },
  });
  const data = (await res.json()) as { access_token?: string; errorMessage?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.errorMessage ?? "Unable to get M-Pesa access token");
  }
  return data.access_token;
}

function timestampNow(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mi = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function transactionType(method: "mpesa_till" | "mpesa_paybill" | "mpesa_phone"): string {
  return method === "mpesa_till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
}

export async function startStkPush(input: {
  phone: string;
  amountKsh: number;
  accountReference: string;
  transactionDesc: string;
  method: "mpesa_till" | "mpesa_paybill" | "mpesa_phone";
}) {
  const shortcode = requireEnv("MPESA_SHORTCODE");
  const passkey = requireEnv("MPESA_PASSKEY");
  const callbackUrl = requireEnv("MPESA_CALLBACK_URL");
  const timestamp = timestampNow();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
  const token = await accessToken();
  const phone = sanitizePhone(input.phone);

  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType(input.method),
      Amount: Math.max(1, Math.round(input.amountKsh)),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: input.accountReference,
      TransactionDesc: input.transactionDesc,
    }),
  });

  const data = (await res.json()) as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorMessage?: string;
  };
  if (!res.ok || data.ResponseCode !== "0") {
    throw new Error(data.errorMessage ?? data.ResponseDescription ?? "Failed to initiate STK push");
  }
  return data;
}

export type MpesaStkCallback = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{ Name?: string; Value?: string | number }>;
      };
    };
  };
};

export function parseStkCallback(payload: MpesaStkCallback) {
  const cb = payload.Body?.stkCallback;
  const items = cb?.CallbackMetadata?.Item ?? [];
  const getValue = (name: string) => items.find((i) => i.Name === name)?.Value;
  return {
    merchantRequestId: cb?.MerchantRequestID,
    checkoutRequestId: cb?.CheckoutRequestID,
    resultCode: cb?.ResultCode ?? -1,
    resultDesc: cb?.ResultDesc ?? "No result description",
    mpesaReceipt: getValue("MpesaReceiptNumber"),
    amount: Number(getValue("Amount") ?? 0),
    phone: String(getValue("PhoneNumber") ?? ""),
  };
}
