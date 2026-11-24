# SceneSpec 数据契约 v1.0

SceneSpec 是 AI、编辑器、存储和渲染引擎之间的核心接口。
Zod Schema 见 `src/contracts/scene-spec.ts`。

## 字段约束

| 字段 | 类型 | 范围 |
| --- | --- | --- |
| `schemaVersion` | 常量 `"1.0"` | — |
| `template` | 枚举 | `mountain_forest`（已注册模板，后续增加海岸/城市/抽象） |
| `palette.*` | `#RRGGBB` | primary / secondary / surface / accent |
| `environment.terrain.amplitude` | number | 0.1–1.2 |
| `environment.terrain.roughness` | number | 0.2–0.9 |
| `environment.water.level` | number | -0.3–0.45 |
| `environment.water.reflectionQuality` | 枚举 | off / low / medium |
| `environment.foliage.preset` | 枚举 | pine_grass / pine_flower / birch_grass |
| `environment.foliage.density` | 枚举 | low / medium / high |
| `environment.lighting.preset` | 枚举 | morning / noon / golden_hour / dusk / overcast |
| `environment.lighting.direction` | [x,y,z] | 各分量 -1..1，y ≥ 0.1 |
| `environment.lighting.fog` | number | 0–0.6 |
| `camera.default` | 枚举 | commercial / front / back / free |
| `camera.minPolarAngle` / `maxPolarAngle` | number | 0–π/2 与 π/2–π |
| `quality.target` | 枚举 | auto / low / medium / high |
| `quality.maxDrawCalls` | int | 30–300 |

## 硬性规则

- 模板名不映射为文件路径；
- 不允许 SceneSpec 携带任意 JavaScript / HTML / 着色器源码；
- AI 输出必须通过 `parseSceneSpec` 校验，非法时回退安全预设（用照片主色覆盖调色板）；
- Schema 升级必须提供迁移或版本兼容规则（当前 `schemaVersion` 常量守卫）。
