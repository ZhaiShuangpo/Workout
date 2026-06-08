#!/bin/bash

# 获取脚本所在目录，并进入项目文件夹
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/fitness-pwa"
cd "$DIR" || exit 1

# 检查是否已经在运行
if [ -f .server.pid ]; then
    PID=$(cat .server.pid)
    if ps -p $PID > /dev/null; then
        echo "⚠️  服务已经在运行中 (PID: $PID)"
        echo "你可以通过查看 fitness-pwa/server.log 获取访问链接。"
        exit 0
    else
        # 进程不存在但 pid 文件存在，清理遗留文件
        rm .server.pid
    fi
fi

echo "🚀 正在启动 Fitness PWA 本地服务..."

# 在后台启动服务，并将日志输出到 server.log
nohup npm run dev -- --host > server.log 2>&1 &
PID=$!

# 保存进程 ID
echo $PID > .server.pid

echo "✅ 服务已在后台成功启动！(PID: $PID)"
echo "📄 日志已输出至: fitness-pwa/server.log"
echo "🌐 请等待几秒后，查看 server.log 获取本机的局域网访问 IP。"
echo "💡 提示：你可以安全地关闭当前终端窗口，服务会继续在后台运行。"