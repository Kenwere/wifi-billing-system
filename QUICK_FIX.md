# Quick Start - Fix Payment to Internet Issue

## The Problem
✗ Users pay → Page shows "connected" → But no internet

## The Solution in 3 Steps

### Step 1: Create Your .env.local File

```bash
cd /path/to/wifi-billing-system
cp .env.local.example .env.local
```

Edit `.env.local` and set these critical values:

```env
# ENABLE LIVE MODE - THIS IS THE KEY!
MIKROTIK_LIVE_MODE=true

# Your router's API credentials
MIKROTIK_API_ALLOWLIST_IPS=YOUR_BACKEND_IP_ADDRESS
```

Get your backend IP:
- If running on VPS: `curl https://api.ipify.org`
- If running locally: `hostname -I` (Linux) or `ipconfig` (Windows)

### Step 2: Configure Your MikroTik Router

SSH into your router and run these commands:

```bash
# Create API user
/user add name=api_backend group=full password=SecurePassword123

# Enable API
/ip service set api port=8728 disabled=no

# Allow your backend IP to access API
/ip firewall filter add chain=input protocol=tcp dst-port=8728 \
  src-address=YOUR_BACKEND_IP action=accept comment="WiFi Billing API"

# Block everyone else from API
/ip firewall filter add chain=input protocol=tcp dst-port=8728 \
  action=drop comment="WiFi Billing API - Drop Others"

# Verify firewall address lists exist
/ip firewall address-list print list=wifi-billing-active
/ip firewall address-list print list=wifi-billing-restricted
```

If address lists don't exist, import the `moonconnect.rsc` script again.

### Step 3: Test the Flow

1. **Connect to WiFi** → Device gets DHCP IP
2. **Open browser** → Redirected to checkout page
3. **Complete payment** → See "connected" page
4. **Test internet** → Open google.com → Should work! ✅

### Verify It's Working

```bash
# SSH to router and check:
/ip firewall address-list print list=wifi-billing-active
# You should see your device's IP listed here

ssh to_your_backend
# In logs, look for:
# [Billing] Successfully granted internet access to 10.10.10.XX
# [MikroTik] Granted internet access to 10.10.10.XX
```

---

## If It Still Doesn't Work

### Check 1: Backend can reach router

```bash
# From your backend server:
telnet YOUR_ROUTER_IP 8728
# Should connect. If it hangs:
# → Router firewall blocking (fix firewall rules)
# → Router API not running (/ip service set api disabled=no)
# → Wrong IP address
```

### Check 2: Router logs

```bash
# SSH to router:
/log print where topics~"api"
# Look for "succeeded" or error messages
```

### Check 3: MIKROTIK_LIVE_MODE confirmation

```bash
# In your backend logs, look for:
[MikroTik] Granted internet access to XXX.XXX.XXX.XXX
# If you don't see this, MIKROTIK_LIVE_MODE is false
```

### Check 4: Router credentials

```bash
# Verify user was created:
ssh api_backend@YOUR_ROUTER_IP
# Should ask for password (SecurePassword123)
```

---

## Optional: Enable RADIUS for Better Session Management

```bash
# In .env.local:
RADIUS_ENABLED=true

# On router:
/ip hotspot profile set [find name=hsprof-wifi-billing] use-radius=yes
/ip radius add service=hotspot address=YOUR_BACKEND_IP \
  secret=moonconnect123 timeout=3s
```

---

## Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| User pays but no internet | Set `MIKROTIK_LIVE_MODE=true` in .env.local |
| API connection timeout | Check router firewall rules allow your backend IP |
| "Failed to add to active list" | Verify address list exists on router |
| No logs appearing | Ensure `MIKROTIK_LIVE_MODE=true` (false = no API calls) |
| Device keeps showing captive portal | IP not being added to active list - check logs |

---

## Files Changed

✅ `lib/billing.ts` - Better error handling, RADIUS caching
✅ `lib/mikrotik.ts` - (No changes, but needs MIKROTIK_LIVE_MODE=true)
✅ `lib/radius.ts` - NEW: RADIUS server for session management
✅ `app/api/payments/checkout/route.ts` - Adds users to restricted list
✅ `.env.local.example` - NEW: Complete configuration guide
✅ `PAYMENT_FIX_GUIDE.md` - NEW: Detailed explanation

---

## What Happens Now

```
BEFORE FIX:
Payment → Page "connected" → Router: IP NOT in active list → No internet ✗

AFTER FIX:
Payment → grantInternetAccess() → Router API adds IP to active list 
      → Firewall allows traffic → Internet works! ✓
```

---

## Support

If stuck, check:
1. `/PAYMENT_FIX_GUIDE.md` - Full documentation
2. `.env.local.example` - Configuration examples
3. Backend logs - Check for [Billing] and [MikroTik] messages
4. Router logs - `/log print` on router

Good luck! 🚀
