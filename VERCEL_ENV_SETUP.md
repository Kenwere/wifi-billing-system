# Vercel Environment Variables for WiFi Billing System

## How to Add to Vercel

1. Go to: https://vercel.com/dashboard
2. Select your project: **wifi-billing-system-kappa** (or your project name)
3. Click **Settings** → **Environment Variables**
4. Add each variable below
5. Select environments: **Production**, **Preview**, **Development** (or as needed)
6. Click **Save**
7. **Redeploy** your app for changes to take effect

---

## CRITICAL VARIABLES (Must Have)

```env
# ============================================================================
# MIKROTIK ROUTER - PAYMENT TO INTERNET
# ============================================================================

# THIS IS THE KEY VARIABLE - Set to true for production!
MIKROTIK_LIVE_MODE=true

# Your backend/server IP address (where Vercel is hosted, or your VPS IP)
# For Vercel, you typically use your VPS/server IP that runs the scheduled jobs
# If you're using Vercel's serverless only, use your router's expected call-back IP
MIKROTIK_API_ALLOWLIST_IPS=102.23.45.67

# Router API connection timeout
MIKROTIK_API_TIMEOUT_MS=8000

# WAN interface name on your router
MIKROTIK_WAN_INTERFACE=ether1
```

---

## MPESA PAYMENT (If Using M-Pesa)

```env
# ============================================================================
# MPESA DARAJA - M-Pesa Payments
# ============================================================================

# Get from: https://developer.safaricom.co.ke/

# Sandbox for testing, live for production
MPESA_API_URL=https://api.safaricom.co.ke

# Your till/paybill number
MPESA_BUSINESS_CODE=123456
MPESA_SHORTCODE=123456

# From Daraja portal - YOUR Settings
MPESA_PASSKEY=your_passkey_from_daraja
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret

# Callback URLs - Point to your Vercel domain
MPESA_CALLBACK_URL=https://your-vercel-domain.vercel.app/api/payments/mpesa/callback
MPESA_TIMEOUT_URL=https://your-vercel-domain.vercel.app/api/payments/mpesa/timeout

# Set to "true" only in development for auto-approval testing
MPESA_SIMULATE=false
```

---

## PAYSTACK PAYMENT (If Using Paystack)

```env
# ============================================================================
# PAYSTACK - Card Payments
# ============================================================================

# Get from: https://dashboard.paystack.com → Settings → API Keys

# Test keys (for development):
# PAYSTACK_PUBLIC_KEY=pk_test_...
# PAYSTACK_SECRET_KEY=sk_test_...

# Live keys (for production):
PAYSTACK_PUBLIC_KEY=pk_live_your_public_key
PAYSTACK_SECRET_KEY=sk_live_your_secret_key

# Your Vercel domain callback URL
PAYSTACK_PAYMENT_CALLBACK_URL=https://your-vercel-domain.vercel.app/api/payments/paystack/verify
```

---

## RADIUS SERVER (Optional - Recommended)

```env
# ============================================================================
# RADIUS - WiFi Session Authentication (Optional)
# ============================================================================

# Enable RADIUS for better session management
RADIUS_ENABLED=false

# Shared secret (must match on MikroTik)
RADIUS_SECRET=moonconnect123

# Port to listen on
RADIUS_PORT=1812

# Host to bind to (0.0.0.0 for all interfaces)
RADIUS_HOST=0.0.0.0
```

---

## DATABASE

```env
# ============================================================================
# DATABASE - File Storage (Current Implementation)
# ============================================================================

# For Vercel, don't worry about this - it uses /data/db.json
# But in production, consider migrating to:
# - Supabase (recommended for Vercel)
# - PostgreSQL
# - MongoDB

DATABASE_FILE=./data/db.json

# If using Supabase instead (FUTURE):
# DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your_anon_key
```

---

## EMAIL (Optional - For Notifications)

```env
# ============================================================================
# EMAIL - SMTP Configuration (Optional)
# ============================================================================

# For sending payment confirmations & session alerts

# Gmail example:
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your_app_password  (NOT your regular password!)
# SMTP_FROM_EMAIL=noreply@moonconnect.app
# SMTP_FROM_NAME=MoonConnect WiFi

# Or use SendGrid/Mailgun:
# SENDGRID_API_KEY=SG.xxxxx
# MAILGUN_API_KEY=key-xxxxx
```

---

## PUBLIC URLS (Important for Vercel)

```env
# ============================================================================
# APP URLs - Point to your Vercel deployment
# ============================================================================

# Your Vercel domain (replace with actual domain)
NEXT_PUBLIC_APP_URL=https://wifi-billing-system-kappa.vercel.app
APP_BASE_URL=https://wifi-billing-system-kappa.vercel.app

# Or if you have a custom domain:
# NEXT_PUBLIC_APP_URL=https://wifi.yourdomain.com
# APP_BASE_URL=https://wifi.yourdomain.com
```

---

## FIREBASE (Optional - Currently Disabled)

```env
# ============================================================================
# FIREBASE - Push Notifications (Optional - Currently Disabled)
# ============================================================================

# Only needed if you enable Firebase functionality later

# FIREBASE_API_KEY=xxxxx
# FIREBASE_AUTH_DOMAIN=xxxxx
# FIREBASE_PROJECT_ID=xxxxx
# FIREBASE_STORAGE_BUCKET=xxxxx
# FIREBASE_MESSAGING_SENDER_ID=xxxxx
# FIREBASE_APP_ID=xxxxx
# FIREBASE_MEASUREMENT_ID=xxxxx
```

---

# ⚠️ IMPORTANT NOTES FOR VERCEL

## 1. Vercel + Serverless Functions

Vercel uses **serverless functions** for API routes. Some considerations:

### ✅ What Works Great
- Payment callbacks (/api/payments/*)
- Session verification (/api/portal/status)
- Public APIs that handle quick requests
- Reading from database

### ⚠️ What Might Not Work
- RADIUS server (needs persistent UDP listener)
- Long-running background jobs (session expiry cleanup)
- Database polling/cron jobs

**Solution:** For RADIUS and cron jobs, run them on a separate VPS/server:

```bash
# Create a separate cron job on your VPS to:
1. Call: https://your-vercel-domain.vercel.app/api/sessions/expire-and-disconnect
2. Run every 5 minutes

# This endpoint would call expireAndDisconnectSessions()
```

---

## 2. Your Vercel Domain

If your site is at: `wifi-billing-system-kappa.vercel.app`

Then your environment variables should use:
```env
NEXT_PUBLIC_APP_URL=https://wifi-billing-system-kappa.vercel.app
PAYSTACK_PAYMENT_CALLBACK_URL=https://wifi-billing-system-kappa.vercel.app/api/payments/paystack/verify
MPESA_CALLBACK_URL=https://wifi-billing-system-kappa.vercel.app/api/payments/mpesa/callback
```

If you have a custom domain (e.g., `wifi.yourdomain.com`):
```env
NEXT_PUBLIC_APP_URL=https://wifi.yourdomain.com
PAYSTACK_PAYMENT_CALLBACK_URL=https://wifi.yourdomain.com/api/payments/paystack/verify
MPESA_CALLBACK_URL=https://wifi.yourdomain.com/api/payments/mpesa/callback
```

---

## 3. Vercel Secrets vs Regular Variables

- **For sensitive data** (API keys, passwords): Add as **Secrets** (encrypted)
- **For public data** (URLs, feature flags): Add as regular variables

In Vercel UI:
- When adding a variable, check if it should be encrypted
- API keys should ALWAYS be encrypted
- Public URLs don't need encryption

---

## 4. Setting Vercel URL Dynamically

For Vercel, you can also use the automatic `VERCEL_URL` variable:

```typescript
// In your code:
const appUrl = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}`
  : process.env.APP_BASE_URL
```

But it's safer to explicitly set `APP_BASE_URL` for clarity.

---

## 5. Testing Before Production

**Do this before going LIVE:**

1. Add variables to **Preview** environment
2. Deploy to a preview/staging URL
3. Test full payment flow
4. Confirm:
   - Payment callbacks work
   - Router receives API calls
   - Device gets internet after payment
5. Move variables to **Production** when confirmed

---

# Quick Copy-Paste Setup

Here's what to add to Vercel (minimum required):

```env
MIKROTIK_LIVE_MODE=true
MIKROTIK_API_ALLOWLIST_IPS=YOUR_BACKEND_IP
MIKROTIK_API_TIMEOUT_MS=8000
MIKROTIK_WAN_INTERFACE=ether1

MPESA_API_URL=https://api.safaricom.co.ke
MPESA_BUSINESS_CODE=YOUR_TILL
MPESA_SHORTCODE=YOUR_TILL
MPESA_PASSKEY=YOUR_PASSKEY
MPESA_CONSUMER_KEY=YOUR_KEY
MPESA_CONSUMER_SECRET=YOUR_SECRET
MPESA_CALLBACK_URL=https://YOUR_VERCEL_DOMAIN/api/payments/mpesa/callback
MPESA_TIMEOUT_URL=https://YOUR_VERCEL_DOMAIN/api/payments/mpesa/timeout
MPESA_SIMULATE=false

PAYSTACK_PUBLIC_KEY=pk_live_YOUR_KEY
PAYSTACK_SECRET_KEY=sk_live_YOUR_KEY
PAYSTACK_PAYMENT_CALLBACK_URL=https://YOUR_VERCEL_DOMAIN/api/payments/paystack/verify

NEXT_PUBLIC_APP_URL=https://YOUR_VERCEL_DOMAIN
APP_BASE_URL=https://YOUR_VERCEL_DOMAIN

DATABASE_FILE=./data/db.json

RADIUS_ENABLED=false
RADIUS_SECRET=moonconnect123
RADIUS_PORT=1812
RADIUS_HOST=0.0.0.0
```

---

# Checklist

- [ ] Go to Vercel project settings
- [ ] Add all required environment variables
- [ ] Replace YOUR_BACKEND_IP with actual IP
- [ ] Replace YOUR_VERCEL_DOMAIN with actual domain
- [ ] Replace payment API credentials with real ones
- [ ] Save and redeploy
- [ ] Test payment flow
- [ ] Confirm device gets internet after payment
