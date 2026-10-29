# Candexa

| Folder | What | Live at |
|---|---|---|
| `web/` | Marketing website (Node/Express `server.js` + static `public/`) | https://candexa.ai |
| `app/` | Web app (coming soon) | https://app.candexa.ai |

## Website hosting
- DigitalOcean droplet **candexa-web** (FRA1, Ubuntu 24.04), app in `/opt/candexa/app`, runs as systemd unit `candexa` on port 3000.
- **Caddy** terminates HTTPS and proxies to the app (`web/Caddyfile`). DNS for candexa.ai is on Cloudflare.
- Secrets live only on the server in `/opt/candexa/.env` (keys listed in `web/.env.example`). Never commit them.

## Deploy the website
```bash
# on the droplet, as root
cd /root/candexa-repo && git pull && bash web/deploy.sh
```

## Social link previews
Every page carries Open Graph + Twitter tags pointing to `public/assets/og-image.jpg` (1200x630).
Regenerate the image after changing the hero copy: `python3 web/tools/og/make_og.py`.
After a change, refresh caches with LinkedIn Post Inspector and the Facebook Sharing Debugger (also covers WhatsApp).
