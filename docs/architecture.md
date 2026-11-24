# 架构说明（MVP v0.1）

## 总体形态

单个 Vite + React + TypeScript 应用（SPA，hash 路由），前端直连 WorkBuddy 云服务
（数据库 / 存储 / 免密钥大模型）。对应 PRD 的阶段 0 + 阶段 1 + 阶段 2 的纵切片。

## 与 PRD 架构的对应关系

| PRD 模块 | 当前实现 |
| --- | --- |
| Web Editor | `src/pages/Editor.tsx`（上传 / 表单 / 预览 / 调整 / 发布） |
| Public Viewer | `src/pages/CardViewer.tsx`（`#/card/:slug`，匿名可读） |
| Application API | 云服务数据面（SDK 直连），阶段 4 再拆独立 API |
| PostgreSQL | 云数据库：`cards` / `scene_versions` / `publications` 三表 + RLS |
| Object Storage | 云存储 `users/<uid>/photos/`（私有，签名 URL 访问） |
| Background Worker | 当前为浏览器端管线 `src/lib/generate.ts`；任务量大时再拆 Worker |
| Scene Engine | `src/scene-engine/`（SceneSpec → Three.js 解释器） |
| Contracts | `src/contracts/scene-spec.ts`（Zod Schema + 安全预设） |

## 数据流

```
照片(File) → 客户端校验/压缩 → 云存储上传（私有）
         ↘ 主色提取(客户端) → 视觉模型(云 LLM, JSON mode) → SceneSpec
SceneSpec → Zod 校验（失败回退安全预设）→ 场景版本表（保留 5 版）
         → 编辑器实时预览（本地参数更新，<500ms）
发布 → cards.published_* 不可变快照 + publications 记录 → #/card/:slug 公开页
```

## 安全要点

- RLS：`cards` 仅本人可写；已发布行匿名可读（`status='published'`）。
- 链接只放行 `http(s)` / `mailto`，禁止 `javascript:` / `data:`（FR-5）。
- 公开页只返回 `published_*` 快照字段，不含邮箱与原图路径（FR-38）。
- 原图仅存于签名 URL 可访问的私有目录，公开页不引用原图。

## 后续扩展点

- 独立 Worker（图片分析队列化、缩略图/深度图生成）
- 海岸 / 城市 / 抽象模板注册（`TEMPLATES` + `templatePresets`）
- 开放 API（API Key + 异步任务模型，PRD 阶段 4）
- 独立域名 SSR 以支持每张名片的 Open Graph 动态元数据（FR-27 当前为站点级）
