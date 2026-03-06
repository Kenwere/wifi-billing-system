/interface bridge add name=br-ispman

# Add all ether ports (except WAN) to the bridge
:foreach i in=[/interface find where type="ether" name!="ether1"] do={
  :local ifName [/interface get $i name]
  :if ([:len [/interface bridge port find where interface=$ifName bridge="br-ispman"]] = 0) do={
    /interface bridge port add bridge=br-ispman interface=$ifName comment="ISPMAN - Auto-added LAN port"
  }
}

# Add all SFP ports (except WAN) to the bridge
:foreach i in=[/interface find where type="ether" name~"^sfp" name!="ether1"] do={
  :local ifName [/interface get $i name]
  :if ([:len [/interface bridge port find where interface=$ifName bridge="br-ispman"]] = 0) do={
    /interface bridge port add bridge=br-ispman interface=$ifName comment="ISPMAN - Auto-added SFP port"
  }
}

:if ([:len [/ip/firewall/nat find where chain=srcnat action=masquerade]] = 0) do={
  /ip/firewall/nat add chain=srcnat out-interface=ether1 action=masquerade comment="ISPMAN - Masquerade for WAN access"
}


/ip dhcp-client add interface=ether1 disabled=no

:log info "â Setting up admin user for API access.";
/user add name=ispman password="dmjmmzqkebjg" group=full;
:log info "â Admin user 'ispman' created with full privileges.";
:log info "â REST API access configured.";
:log info "â Start WireGuard setup (IPv4 only).";

/interface wireguard add name=wg-ispman-v4 private-key="ppytayv7RTN+S8lTfU3CWfc+HXxi/gL+p3QhK+bC3vA=" listen-port=60962;

:log info "â WireGuard interface added.";

/interface wireguard peers add interface=wg-ispman-v4 public-key="16BHnAllKyARNRcP2LBUPi9iZBPGyhbRe1BW0zQkPRo=" allowed-address=10.121.0.0/24 endpoint-address=orion.gateway.ispman.dev endpoint-port=43191 persistent-keepalive=15;

:log info "â WireGuard peer added.";

/ip address add address=10.121.10.233/32 interface=wg-ispman-v4;

:log info "â IP address assigned to WireGuard.";

/ip route add dst-address=10.121.0.0/24 gateway=wg-ispman-v4 comment="Route to ISPMan management network";

:log info "â Static route for WireGuard peers added.";

/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=no;

:log info "â DNS servers updated.";

# Firewall rules to allow management access from VPN
/ip firewall filter add chain=input action=drop protocol=tcp dst-port=21,22,8291,80,443,8728,8729 comment="ISPMAN - DROP Management from WAN"
/ip firewall filter add chain=input action=accept protocol=tcp in-interface=wg-ispman-v4 place-before=0 comment="ISPMAN - Allow Management from VPN"
/ip firewall filter add chain=input action=accept protocol=udp in-interface=wg-ispman-v4 place-before=0 comment="ISPMAN - Allow UDP from VPN - RADIUS, WG Handshake"

:log info "â Firewall rules added for WireGuard management access.";

/system ntp client set enabled=yes servers=time.google.com,time.cloudflare.com
:log info "â Configuring RADIUS authentication server (IPv4: 10.121.0.2).";

# Add RADIUS server configuration using device management zone server
/radius add service=hotspot,ppp address=10.121.0.2 secret="bVJZZZUuNc4LAvBzPl6Rjk8mDek" authentication-port=1812 accounting-port=1813 timeout=3s realm="e6febdbd-df5b-4dec-822f-3cffa883546d";
/radius incoming set accept=yes

:log info "â RADIUS server configured for hotspot and PPPoE services.";

# Configure PPP to use RADIUS
/ppp aaa set use-radius=yes accounting=yes interim-update=10m;

:log info "â PPP configured to use RADIUS authentication.";
/ip firewall address-list
add list=allow-internet comment="ISPMAN - Active users (full internet)"
add list=no-internet comment="ISPMAN - Restricted users (captive only)"

/ip firewall address-list
add list=captive-allowed address=captive.ispman.tech comment="ISPMan captive portal"
add list=captive-allowed address=captive.ispman.dev comment="ISPMan captive portal API"
add list=captive-allowed address=fonts.gstatic.com comment="Captive fonts"
add list=captive-allowed address=static.ispman.tech comment="Captive static assets"
add list=captive-allowed address=challenges.cloudflare.com comment="Captive Cloudflare Challenge"
add list=captive-allowed address=www.gstatic.com comment="Captive gstatic"

/ip firewall filter
add chain=forward action=accept     src-address-list=no-internet     protocol=udp dst-port=53     comment="Restricted: allow DNS UDP"

add chain=forward action=accept     src-address-list=no-internet     protocol=tcp dst-port=53     comment="Restricted: allow DNS TCP"

/ip firewall filter
add chain=forward action=accept     src-address-list=no-internet     dst-address-list=captive-allowed     dst-port=80,443     proto=tcp     comment="Restricted: allow captive portal"

/ip firewall filter
add chain=forward action=drop     src-address-list=no-internet     comment="Restricted: block all other traffic"

/ip firewall nat
add chain=dstnat protocol=tcp dst-port=80     src-address-list=no-internet     action=redirect to-ports=80     comment="Restricted: redirect HTTP to captive portal"
/ip firewall nat
add chain=dstnat protocol=tcp dst-port=443     src-address-list=no-internet     action=redirect to-ports=80     comment="Restricted: redirect HTTP to captive portal"
:log info "â Setting up ISPMan monitoring and task execution system.";

# Create ISPMan monitoring script
/system script add name=ispman \
source="\
:local arch [/system resource get architecture-name];\
:local version [/system resource get version];\
:local board [/system resource get board-name];\
:local platform [/system resource get platform];\
:local buildTime [/system resource get build-time];\
:local authKey \"a1d05071c1d241db9c843952d323474e96502581426b1b296e8a8a32c1ad9e7c\";\
:local ispId \"e6febdbd-df5b-4dec-822f-3cffa883546d\";\
:local deviceId \"ff54382d-3523-4b8e-9ec4-f0aab1681635\";\
:local globalAuthKey \"f5b44e117fd4c1bf6bdc9caf8d1faa3fe32f32e15493eac8fee8185516118e01\";\

:local postData \"{\\\"arch\\\":\\\"\$arch\\\", \
                   \\\"version\\\":\\\"\$version\\\", \
                   \\\"board\\\":\\\"\$board\\\", \
                   \\\"platform\\\":\\\"\$platform\\\", \
                   \\\"build_time\\\":\\\"\$buildTime\\\", \
                   \\\"auth_key\\\":\\\"\$authKey\\\", \
                   \\\"isp_id\\\":\\\"\$ispId\\\", \
                   \\\"device_id\\\":\\\"\$deviceId\\\", \
                   \\\"global_auth_key\\\":\\\"\$globalAuthKey\\\"}\";\

/tool fetch http-method=post \
    http-header-field=\"Content-Type: application/json\" \
    http-data=\$postData \
    dst-path=\"ispman-task.rsc\" \
    keep-result=yes \
    idle-timeout=60s \
    duration=2m \
    url=\"https://sup.ispman.tech/functions/v1/mikrotik-onboarding\"; \

:delay 1;\

/import ispman-task.rsc;\
/file remove ispman-task.rsc;\

:log info \"ISPMan task completed, waiting for next task\";\
"

# Add scheduler to run every 30 seconds
/system scheduler add name=ispman \
    interval=30s \
    on-event="/system script run ispman" \
    start-time=startup

:log info "â ISPMan monitoring system configured successfully.";
:log info "â Device will check for management tasks every 30 seconds.";
