# WiFi Billing MikroTik setup script
# Router: A1
# WAN: ether1
# Hotspot/LAN: ether2, ether3, ether4
# Captive Portal Backend: https://wifi-billing-system-kappa.vercel.app
# Options:
# - Hotspot sharing disabled (shared-users=1)
# - Device tracking rules enabled
# - Bandwidth control profile scaffold enabled
# - Session logging topics enabled

:log info "Starting WiFi Billing setup..."

# 1) Create bridge for hotspot ports
/interface bridge add name=br-hotspot-321cd7 comment="WiFi Billing LAN bridge"
/interface bridge port
add bridge=br-hotspot-321cd7 interface=ether2
add bridge=br-hotspot-321cd7 interface=ether3
add bridge=br-hotspot-321cd7 interface=ether4

# 2) Get internet on ether1 using DHCP client
/ip dhcp-client add interface=ether1 disabled=no use-peer-dns=yes use-peer-ntp=yes

# 3) LAN IP + DHCP server for hotspot clients
/ip address add address=10.10.10.1/24 interface=br-hotspot-321cd7 comment="Hotspot gateway"
/ip pool add name=hs-pool ranges=10.10.10.10-10.10.10.250
/ip dhcp-server add name=hs-dhcp interface=br-hotspot-321cd7 address-pool=hs-pool disabled=no
/ip dhcp-server network add address=10.10.10.0/24 gateway=10.10.10.1 dns-server=8.8.8.8,1.1.1.1

# 4) NAT for clients to reach internet
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="WiFi Billing NAT"

# 4b) Secure RouterOS API (TCP 8728) from allowed backend IPs only
:local moonWanIf "ether1"
:if ($moonWanIf = "") do={
  :if ([:len [/ip dhcp-client find where disabled=no and status="bound"]] > 0) do={
    :set moonWanIf [/ip dhcp-client get [find where disabled=no and status="bound"] interface]
    :log info ("MoonConnect WAN auto-detected: " . $moonWanIf)
  } else={
    :set moonWanIf "ether1"
    :log warning "MoonConnect WAN auto-detect failed. Falling back to ether1"
  }
}
:foreach i in=[/ip firewall filter find where comment~"MoonConnect API"] do={
  /ip firewall filter remove $i
  :log info "MoonConnect removed old API firewall rule"
}
/ip service set api address=0.0.0.0/0 port=8728 disabled=no
:log info "MoonConnect enabled RouterOS API service on tcp/8728"
/ip firewall filter add chain=input in-interface=$moonWanIf src-address=102.23.45.67 protocol=tcp dst-port=8728 action=accept comment="MoonConnect API allow 102.23.45.67"
:log info "MoonConnect applied API allow rule for 102.23.45.67"
/ip firewall filter add chain=input in-interface=$moonWanIf protocol=tcp dst-port=8728 action=drop comment="MoonConnect API drop others"
:log info "MoonConnect applied API drop rule for non-allowlisted sources on $moonWanIf"

# 5) Hotspot basic config (simplified - we'll use firewall for access control)
/ip hotspot profile
add name=hsprof-wifi-billing hotspot-address=10.10.10.1 html-directory=hotspot login-by=http-chap,http-pap,cookie use-radius=no
/ip hotspot add name=hotspot1 interface=br-hotspot-321cd7 address-pool=hs-pool profile=hsprof-wifi-billing disabled=no
/ip hotspot user profile
add name=wifi-billing-default shared-users=1 rate-limit=5M/5M

# 5b) Firewall-based access control (like ISPMan - simpler than IP bindings)
/ip firewall address-list
add list=wifi-billing-active comment="WiFi Billing - Active users (full internet)"
add list=wifi-billing-restricted comment="WiFi Billing - Restricted users (captive only)"

# Allow DNS for restricted users
/ip firewall filter add chain=forward action=accept src-address-list=wifi-billing-restricted protocol=udp dst-port=53 comment="WiFi Billing: allow DNS UDP for restricted"
/ip firewall filter add chain=forward action=accept src-address-list=wifi-billing-restricted protocol=tcp dst-port=53 comment="WiFi Billing: allow DNS TCP for restricted"

# Allow captive portal access for restricted users
/ip firewall filter add chain=forward action=accept src-address-list=wifi-billing-restricted dst-address-list=captive-allowed dst-port=80,443 protocol=tcp comment="WiFi Billing: allow captive portal for restricted"

# Block all other traffic for restricted users
/ip firewall filter add chain=forward action=drop src-address-list=wifi-billing-restricted comment="WiFi Billing: block internet for restricted users"

# Redirect HTTP/HTTPS to captive portal for restricted users
/ip firewall nat add chain=dstnat protocol=tcp dst-port=80 src-address-list=wifi-billing-restricted action=redirect to-ports=80 comment="WiFi Billing: redirect HTTP to captive"
/ip firewall nat add chain=dstnat protocol=tcp dst-port=443 src-address-list=wifi-billing-restricted action=redirect to-ports=80 comment="WiFi Billing: redirect HTTPS to captive"

# 6) Walled garden: allow payment + backend while user is unauthenticated
/ip hotspot walled-garden
add action=allow dst-host=wifi-billing-system-kappa.vercel.app
add action=allow dst-host=*.wifi-billing-system-kappa.vercel.app
add action=allow dst-host=paystack.com
add action=allow dst-host=*.paystack.com
add action=allow dst-host=checkout.paystack.com
add action=allow dst-host=api.paystack.co
add action=allow dst-host=js.paystack.co

# 7) Redirect hotspot login page to app portal
:local wifiBillingPortalUrl "https://wifi-billing-system-kappa.vercel.app/portal/router_919875d2-a3d9-4284-8490-fc526f321cd7?mac=$(mac)&ip=$(ip)"
:local wifiBillingLoginHtml ("<!doctype html><html><head><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0; url=" . $wifiBillingPortalUrl . "\"><script>location.replace('" . $wifiBillingPortalUrl . "');</script></head><body>Redirecting...</body></html>")
:do { /file set [find where name="hotspot/login.html"] contents=$wifiBillingLoginHtml } on-error={ :log warning "Could not update hotspot/login.html on first attempt" }
:do { /file set [find where name="hotspot/alogin.html"] contents=$wifiBillingLoginHtml } on-error={ :log warning "Could not update hotspot/alogin.html" }
:delay 1s
:do { /file set [find where name="hotspot/login.html"] contents=$wifiBillingLoginHtml } on-error={ :log warning "Portal redirect still not applied. Create hotspot files and re-import script." }

# 8) Optional tracking/logging toggles
/ip firewall filter add chain=forward src-address=10.10.10.0/24 action=add-src-to-address-list address-list=wifi-billing-devices address-list-timeout=1d comment="Track hotspot devices"
/system logging add topics=hotspot,info action=memory

# 9) Captive portal integration notes
:put "Portal URL: https://wifi-billing-system-kappa.vercel.app/portal/router_919875d2-a3d9-4284-8490-fc526f321cd7?mac=$(mac)&ip=$(ip)"
:put "Use routerId: router_919875d2-a3d9-4284-8490-fc526f321cd7"

:log info "WiFi Billing setup complete for A1"