# 文枢前端

Vue 3 + TypeScript + Vite + Pinia + Element Plus。包含用户工作台、认证页面和管理员后台。

## 本地运行

使用 Node.js 22.12+ 或 Node.js 24，安装依赖后启动：

```sh
npm ci
npm run dev
```

默认访问 `http://localhost:5173/docu_frontend/`。`.env.development` 中的 `VITE_API_BASE_URL` 为开发 API 地址，绝对地址需要后端允许跨域。需要 Vite 同源代理时，可在未提交的 `.env.development.local` 中设置 `VITE_API_BASE_URL=`。`VITE_USE_MOCK=1` 仅用于本机开发模拟，真实联调请使用 `0`。

## 已实现功能

- 密码/验证码登录与注册、找回及修改密码、令牌刷新、退出登录和退出其他设备。
- 文件上传、搜索、重命名、删除、明确版本预览/下载/比较/恢复。
- AI 流式回复、会话历史、计划恢复、确认及放弃；转换与导出任务。
- DOCX 段落、格式、表格、目录、图片、页眉页脚链接及脚注编辑；XLSX 单元格、行列、工作表、数据、格式及图片编辑。
- PDF/图片 OCR：语言、页码、DPI、旋转、增强、去噪、锐化、提亮及像素区域；逐页文本和表格单元格校正、服务端恢复、AI 整理及草稿文本导出。
- 管理员概览与按日趋势、用户/文件/任务管理、模型配置、模板及版本管理、审计时间筛选和存储回收。

工作台用户菜单对管理员展示「管理后台」。退出其他设备保留当前设备登录。OCR 校正不创建文件版本；重新识别会生成独立指纹，校正按文件、版本和指纹读取。同一弹窗会话重开可直接恢复，整页刷新后需显式识别一次以获得指纹。表格校正保留原行列及合并跨度，可编辑单元格文字；导出文本附带表格的制表符矩阵，合并范围仅锚点有文字。

## 检查与构建

```sh
npm run type-check
npm test
npm run build
npm run check:api -- /path/to/documenter
npm run preview
```

测试使用本机 API 替身和真实 Vue setup，需允许监听回环地址；它们不证明正式环境模型或转换引擎可用。接口扫描当前覆盖 125 个方法与路径。

浏览器验收使用虚构数据，不访问线上：

```sh
node scripts/local-ui-fixture.mjs
```

打开 `http://127.0.0.1:5174/docu_frontend/`，密码登录任意非空测试账号及符合表单规则的密码。测试身份为模拟管理员；API 仅监听 `127.0.0.1:8941`，关闭脚本后数据消失。该脚本独立于生产构建。

## 部署

构建产物为 `dist/`。API 地址由 `VITE_API_BASE_URL` 在构建时注入，变更后需重建。当前路由基路径为 `/docu_frontend/`；其他路径部署时修改 `vite.config.js` 的 `base`，服务端需将子路由回退到 `index.html`。GitHub Actions 会构建并复制 `404.html` 后发布 Pages。

统计趋势要求后端提供 `GET /admin/statistics/trend`，接受 `from/to=YYYY-MM-DD`，默认近 30 天，最多 93 天，包含首尾日期和无数据日期；按创建日归类，任务成功/失败是当前状态，时间口径为上海本地时间。后端应先部署并应用 Flyway V10 索引迁移，JVM、数据库会话和历史 `create_time` 应使用一致的上海时间口径。

UI 组件和样式按需导入，字体仅加载两种字体的常规字重及 WOFF2 Unicode 分片，标题字重由浏览器合成。桌面保留可拖拽侧栏，窄屏改为上下布局，操作按钮自动换行。

历史审计与阶段说明见 `docs/`；当前完成情况以 [P2 交付说明](docs/p2-completion-2026-10-20.md) 为准。正式环境登录、跨域、模型/OCR、字体及 Office 转换仍需部署后验收。
