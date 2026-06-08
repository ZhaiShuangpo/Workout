#!/bin/bash
IP="111.229.128.124"
USER="root"
LOCAL_DIST="/Users/zhai/Documents/Workout/fitness-pwa/dist"

echo "================================================="
echo "🚀 开始自动部署到腾讯云服务器 ($IP)..."
echo "================================================="

echo -e "\n[1/2] 正在将最新的网页文件上传到服务器临时目录..."
echo "⚠️  注意：如果终端卡住并提示 password，请按一下键盘上的【Tab】键聚焦到终端，然后输入服务器密码并回车（输入时密码不会显示）。"
scp -r "$LOCAL_DIST" "$USER@$IP:~/fitness-app"

if [ $? -ne 0 ]; then
    echo "❌ 上传文件失败，请检查密码是否输入正确或网络是否畅通。"
    exit 1
fi

echo -e "\n[2/2] 正在服务器上配置并替换 Nginx 网页目录..."
echo "⚠️  注意：此处可能需要您再次输入一次密码。"
ssh "$USER@$IP" "mkdir -p /var/www/html && rm -rf /var/www/html/* && mv ~/fitness-app/* /var/www/html/ && rm -rf ~/fitness-app"

if [ $? -ne 0 ]; then
    echo "❌ 部署文件失败。"
    exit 1
fi

echo -e "\n🎉 部署完美成功！"
echo "👉 现在你可以立刻在手机或电脑浏览器访问：http://$IP"
