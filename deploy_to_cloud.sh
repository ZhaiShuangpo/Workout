#!/bin/bash
set -euo pipefail

SERVER_IP="${FITNESS_SERVER_IP:-111.229.128.124}"
SERVER_USER="${FITNESS_SERVER_USER:-root}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIST="$SCRIPT_DIR/fitness-pwa/dist"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
REMOTE_RELEASE="/var/www/fitness-releases/$RELEASE_ID"
FITNESS_DOMAIN="${FITNESS_DOMAIN:-}"

echo "================================================="
echo "🚀 开始自动部署到腾讯云服务器 ($SERVER_IP)..."
echo "================================================="

echo -e "\n[1/2] 正在将最新的网页文件上传到服务器临时目录..."
echo "⚠️  注意：如果终端卡住并提示 password，请按一下键盘上的【Tab】键聚焦到终端，然后输入服务器密码并回车（输入时密码不会显示）。"
if [ ! -f "$LOCAL_DIST/index.html" ]; then
    echo "❌ 未找到构建产物，请先运行 npm run build。"
    exit 1
fi

scp -r "$LOCAL_DIST" "$SERVER_USER@$SERVER_IP:~/fitness-app-$RELEASE_ID"

echo -e "\n[2/2] 正在服务器上配置并替换 Nginx 网页目录..."
echo "⚠️  注意：此处可能需要您再次输入一次密码。"
ssh "$SERVER_USER@$SERVER_IP" "mkdir -p '$REMOTE_RELEASE' /var/www/html && cp -a /var/www/html/. '$REMOTE_RELEASE.previous' 2>/dev/null || true; cp -a ~/fitness-app-$RELEASE_ID/. '$REMOTE_RELEASE/'; cp -a '$REMOTE_RELEASE'/. /var/www/html/; rm -rf ~/fitness-app-$RELEASE_ID"

if [ -n "$FITNESS_DOMAIN" ]; then
    SSL_CERT_PATH="${FITNESS_SSL_CERT:-/etc/letsencrypt/live/$FITNESS_DOMAIN/fullchain.pem}"
    SSL_KEY_PATH="${FITNESS_SSL_KEY:-/etc/letsencrypt/live/$FITNESS_DOMAIN/privkey.pem}"
    TEMP_NGINX_CONFIG="$(mktemp)"
    trap 'rm -f "$TEMP_NGINX_CONFIG"' EXIT
    sed -e "s|__FITNESS_DOMAIN__|$FITNESS_DOMAIN|g" -e "s|__SSL_CERT__|$SSL_CERT_PATH|g" -e "s|__SSL_KEY__|$SSL_KEY_PATH|g" "$SCRIPT_DIR/nginx-fitness.conf.template" > "$TEMP_NGINX_CONFIG"
    scp "$TEMP_NGINX_CONFIG" "$SERVER_USER@$SERVER_IP:~/fitness-nginx.conf"
    ssh "$SERVER_USER@$SERVER_IP" "test -f '$SSL_CERT_PATH' && test -f '$SSL_KEY_PATH' && mv ~/fitness-nginx.conf /etc/nginx/sites-available/fitness-app && ln -sfn /etc/nginx/sites-available/fitness-app /etc/nginx/sites-enabled/fitness-app && nginx -t && systemctl reload nginx"
    PUBLIC_URL="https://$FITNESS_DOMAIN"
else
    PUBLIC_URL="http://$SERVER_IP"
    echo "⚠️  未设置 FITNESS_DOMAIN，本次仍通过 HTTP 发布，PWA 离线与通知不可用。"
fi

echo -e "\n🎉 部署完美成功！"
echo "👉 现在你可以立刻在手机或电脑浏览器访问：$PUBLIC_URL"
echo "📦 当前发布保存在: $REMOTE_RELEASE"
