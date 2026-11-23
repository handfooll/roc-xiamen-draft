#!/bin/bash
# One-time server setup on a fresh Ubuntu 22.04/24.04 (run as root):
#   bash setup.sh <domain> <email-for-certificates> "<deploy ssh public key>"
# Afterwards, once key login is confirmed to work:  bash setup.sh --lock-ssh
set -euo pipefail

if [ "${1:-}" = "--lock-ssh" ]; then
  # refuse unless an admin (root or ubuntu) can still log in with a key
  if ! grep -qs '^ssh-' /root/.ssh/authorized_keys /home/ubuntu/.ssh/authorized_keys; then
    echo "No admin SSH key for root or ubuntu. Add one first, or you will be locked out."; exit 1
  fi
  # 00- so it wins over cloud-init's 50-cloud-init.conf (sshd keeps the first value it reads)
  cat > /etc/ssh/sshd_config.d/00-rea.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
  sshd -t && systemctl reload ssh
  sshd -T | grep -qi '^passwordauthentication no' || { echo "password login is STILL on, check sshd_config.d"; exit 1; }
  echo "SSH: password login switched off"
  exit 0
fi

DOMAIN="${1:?domain}"
EMAIL="${2:?email}"
PUBKEY="${3:?deploy public key}"
case "$DOMAIN" in *[!a-z0-9.-]*|"") echo "bad domain"; exit 1;; esac
HERE="$(cd "$(dirname "$0")" && pwd)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef
apt-get install -yq nginx certbot fail2ban unattended-upgrades apache2-utils rsync python3 ufw
dpkg-reconfigure -f noninteractive unattended-upgrades

# also open 80 and 443 in the Lighthouse firewall in the Tencent console, ufw does not cover that
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
systemctl enable --now fail2ban

# deploy user: owns the site and the app code, may only restart the app
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart rea-lead" > /etc/sudoers.d/rea-deploy
chmod 440 /etc/sudoers.d/rea-deploy
visudo -cf /etc/sudoers.d/rea-deploy

install -d -o deploy -g deploy /var/www/rea /var/www/rea/releases /opt/rea /opt/rea/server
install -d /var/www/acme /etc/rea
[ -f /etc/rea/env ] || install -m 600 "$HERE/env.example" /etc/rea/env

# HTTPS certificate (HTTP-only config first, then the full one)
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/rea <<CONF
server { listen 80; listen [::]:80; server_name $DOMAIN www.$DOMAIN;
  location /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 404; } }
CONF
ln -sf /etc/nginx/sites-available/rea /etc/nginx/sites-enabled/rea
nginx -t && systemctl reload nginx
certbot certonly --webroot -w /var/www/acme -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive \
  --deploy-hook "systemctl reload nginx"

install -m 644 "$HERE/headers.conf" /etc/nginx/snippets/rea-headers.conf
sed "s/__DOMAIN__/$DOMAIN/g" "$HERE/site.conf" > /etc/nginx/sites-available/rea
sed -i 's/^\s*#\?\s*server_tokens.*/\tserver_tokens off;/' /etc/nginx/nginx.conf

# admin login for the leads table
if [ ! -f /etc/nginx/rea.htpasswd ]; then
  PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  htpasswd -bc /etc/nginx/rea.htpasswd manager "$PASS"
  chown root:www-data /etc/nginx/rea.htpasswd
  chmod 640 /etc/nginx/rea.htpasswd
  echo "ADMIN LOGIN: manager / $PASS  (https://$DOMAIN/admin)"
fi

install -m 644 "$HERE/rea-lead.service" /etc/systemd/system/rea-lead.service
systemctl daemon-reload
systemctl enable rea-lead

# placeholder page until the first deploy
if [ ! -e /var/www/rea/current ]; then
  install -d -o deploy -g deploy /var/www/rea/releases/empty
  echo '<!doctype html><meta charset="utf-8"><title>…</title>' > /var/www/rea/releases/empty/index.html
  ln -sfn /var/www/rea/releases/empty /var/www/rea/current
  chown -h deploy:deploy /var/www/rea/current
fi

nginx -t && systemctl reload nginx
echo "Done. Next: push to main to deploy, then check key login and run: bash setup.sh --lock-ssh"
