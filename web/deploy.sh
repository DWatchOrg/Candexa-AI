#!/usr/bin/env bash
# Deploy candexa.ai from this repo onto the droplet. Run as root on the droplet:
#   cd /root/candexa-repo && git pull && bash web/deploy.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; APP=/opt/candexa/app
id candexa >/dev/null 2>&1 || useradd -r -m -d /opt/candexa -s /usr/sbin/nologin candexa
rm -rf "$APP.new"; mkdir -p "$APP.new"
rsync -a --exclude tools --exclude deploy.sh --exclude .env.example "$HERE/" "$APP.new/"
(cd "$APP.new" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
rm -rf "$APP.old"; [ -d "$APP" ] && mv "$APP" "$APP.old"; mv "$APP.new" "$APP"
chown -R candexa:candexa /opt/candexa
cp "$APP/candexa.service" /etc/systemd/system/candexa.service
cp "$APP/Caddyfile" /etc/caddy/Caddyfile
[ -f /opt/candexa/.env ] || { echo "Missing /opt/candexa/.env (see web/.env.example)"; exit 1; }
systemctl daemon-reload; systemctl enable --now candexa; systemctl restart candexa
systemctl reload caddy || systemctl restart caddy
sleep 2; curl -fsS http://127.0.0.1:3000/api/health && echo && echo DEPLOY-OK
