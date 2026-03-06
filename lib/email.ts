function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function generateVerificationCode(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function sendVerificationCodeEmail(input: {
  email: string;
  fullName: string;
  code: string;
}): Promise<void> {
  const serviceId = requireEnv("EMAILJS_SERVICE_ID");
  const templateId = requireEnv("EMAILJS_TEMPLATE_ID");
  const publicKey = requireEnv("EMAILJS_PUBLIC_KEY");
  const privateKey = requireEnv("EMAILJS_PRIVATE_KEY");

  const expiryTime = new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        // Keep both naming styles so common EmailJS OTP templates work without edits.
        email: input.email,
        password: input.code,
        passcode: input.code,
        time: expiryTime,
        to_email: input.email,
        to_name: input.fullName,
        verification_code: input.code,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to send verification email");
  }
}
