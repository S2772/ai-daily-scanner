# Insight 前端上下文（UI 优化必读）

本文档用于让 `openclaw insight` 快速定位并修改前端 UI。

## 1) 前后端端口与访问地址
- 前端（React + Vite）：`http://127.0.0.1:3000/`
- 后端（Python）：`http://127.0.0.1:6003/`

说明：UI 优化优先修改 `frontend/` 下代码，不是 `templates/` 和 `static/` 里的旧页面。

## 2) 前端目录（UI 主要工作区）
- `frontend/src/App.tsx`：页面框架与路由/主布局入口
- `frontend/src/index.css`：全局样式
- `frontend/src/components/`：核心 UI 组件
- `frontend/src/components/designSystem.ts`：设计变量/风格基线
- `frontend/src/components/Overview.tsx`：概览页
- `frontend/src/components/Intelligence.tsx`：情报页
- `frontend/src/components/NewsFeed.tsx`：信息流列表
- `frontend/src/components/NewsCard.tsx`：卡片样式与交互
- `frontend/src/components/Sidebar.tsx`：侧栏

## 3) 启动与停止
在项目根目录执行：

```bash
./start.sh start
```

状态检查：

```bash
./start.sh status
```

停止：

```bash
./start.sh stop
```

## 4) 前端单独开发（可选）

```bash
cd frontend
npm run dev
```

默认端口为 `3000`（见 `frontend/package.json`）。

## 5) UI 修改后的最小验收
- 页面可打开：`http://127.0.0.1:3000/`
- 无明显报错：浏览器控制台无红色错误
- 布局可用：桌面宽度与移动宽度都不破版
- 核心页面可用：`Overview`、`Intelligence`、`NewsFeed`

## 6) 常见误区
- 不要把 React 前端问题只改到 `static/dashboard.css`。
- 不要只看 `templates/dashboard.html` 判断当前 UI；3000 端口是当前主 UI。
- 改完前端后，优先提交 `frontend/src/**` 变更和验证结果。
