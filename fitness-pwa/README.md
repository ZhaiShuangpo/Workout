# 健身训练记录

本地优先的 React + TypeScript 健身 Web 应用。训练、营养、身体指标和计划数据默认保存在浏览器 IndexedDB 中，可通过“我的”页面导出或恢复 JSON 备份。

## 功能

- 带目标组数、次数范围、RPE、休息时间和排期的训练模板
- 实时组记录、休息倒计时、上次表现和渐进建议
- TDEE、宏量目标、每日摄入、常用餐和补剂打卡
- 训练容量、估算 1RM、肌群周组数、出勤和身体指标趋势
- 离线缓存、安装到桌面、明暗主题和完整数据备份

## 开发

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

`dist/` 为静态部署产物。路由使用 URL hash，因此不依赖服务器端 SPA fallback。
