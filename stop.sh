#!/bin/bash

# 获取脚本所在目录，并进入项目文件夹
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/fitness-pwa"
cd "$DIR" || exit 1

echo "🛑 准备停止 Fitness PWA 服务..."

# 检查是否存在 PID 文件
if [ -f .server.pid ]; then
    PID=$(cat .server.pid)
    echo "找到运行中的进程 (PID: $PID)，正在关闭..."
    
    # 终止 npm 进程及其衍生的子进程 (vite)
    pkill -P $PID 2>/dev/null
    kill $PID 2>/dev/null
    
    # 删除 PID 文件
    rm .server.pid
    echo "✅ 服务已成功停止。"
else
    echo "⚠️  未找到运行记录 (.server.pid)。"
    echo "正在尝试清理可能遗留的 vite 进程..."
    
    # 暴力清理包含 "vite" 的进程
    pkill -f "vite" 2>/dev/null
    
    echo "✅ 清理完成。"
fi