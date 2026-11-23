#!/bin/bash
# CI: validate the nginx config with a throwaway certificate.
set -euo pipefail
sudo apt-get install -yq nginx >/dev/null
d=example.test
sudo mkdir -p /etc/letsencrypt/live/$d /var/www/rea/current
sudo openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$d" \
  -keyout /etc/letsencrypt/live/$d/privkey.pem -out /etc/letsencrypt/live/$d/fullchain.pem 2>/dev/null
sudo cp deploy/headers.conf /etc/nginx/snippets/rea-headers.conf
sed "s/__DOMAIN__/$d/g" deploy/site.conf | sudo tee /etc/nginx/sites-enabled/rea >/dev/null
sudo rm -f /etc/nginx/sites-enabled/default
sudo touch /etc/nginx/rea.htpasswd
sudo nginx -t
