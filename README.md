# 虚拟眼镜试戴 Demo

浏览器端的实时眼镜试戴技术验证 Demo。打开摄像头后自动识别人脸，把镜框叠加到眼睛位置，
支持左右移动、远近缩放、歪头跟随，可切换 4 款镜框并保存试戴照片。

**所有识别与合成都在浏览器本地完成，摄像头画面不会上传到任何服务器，也不会被保存。**

---

## 3D 试戴实验版

当前工作区已用 Three.js / WebGL 将原来的 SVG 叠图替换为三款 GLB
模型（粉色心形框、黑色方框、深色太阳镜）。保留日语界面、镜像视频、
人脸跟踪、镜框切换和照片下载；缩略图由真实模型渲染生成。
头部方向从 MediaPipe 关键点估算，并用四元数平滑。3D 层与视频合成到同一张
Canvas，因此下载照片包含镜框。

模型来源及原始文件名见 [public/models/SOURCE.md](public/models/SOURCE.md)。
上游未声明许可证或真实毫米尺寸；此版本用于模型接入评估，公开或商业使用前
须确认授权。模型文件约 12MB，首次加载较旧 SVG 版本更慢，需要支持 WebGL。
目前不包含脸部遮挡、精确瞳距标定或真实尺寸适配，镜腿可能穿过脸部；
拟合效果仍需用真人摄像头验证。下方原版说明中的 SVG/2D 渲染实现介绍仅供历史参考。

## 快速开始

```bash
npm install
npm run dev
```

打开终端输出的地址（默认 `http://localhost:5173`），点击「开启摄像头」并允许权限。

其它命令：

```bash
npm run build      # 类型检查 + 生产构建，产物在 dist/
npm run preview    # 本地预览构建产物
npm run typecheck  # 只做类型检查
```

Node.js 建议 20 LTS 或更高（开发环境使用 v22 验证通过）。

### 关于摄像头权限

浏览器只在**安全环境**下开放摄像头：`https://` 或 `localhost`。
用局域网 IP（如 `http://192.168.x.x:5173`）在手机上直接打开会拿不到权限，需要：

- 用 `npm run preview` 配合任意 HTTPS 隧道工具，或
- 部署到任意静态托管（本项目是纯前端，`dist/` 直接丢上去即可）。

---

## 技术栈

| 用途 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript |
| 构建 | Vite |
| 人脸识别 | `@mediapipe/tasks-vision` — Face Landmarker（VIDEO 模式，478 关键点，含虹膜） |
| 渲染 | HTML5 Canvas 2D |
| 样式 | 原生 CSS（未使用 Tailwind） |

无后端、无数据库、无登录、无付费 API。WASM 运行时和模型文件从 MediaPipe 官方 CDN 加载，
地址集中在 `src/constants.ts`。

---

## 目录结构

```
virtual-glasses-demo/
├─ public/glasses/              # 4 款眼镜素材（项目内 SVG，不依赖外部图片）
│  ├─ black-square.svg          # 黑色方框
│  ├─ gold-round.svg            # 金色圆框
│  ├─ clear-frame.svg           # 透明框
│  └─ sunglasses.svg            # 墨镜
├─ src/
│  ├─ components/
│  │  ├─ VirtualTryOn.tsx       # 取景区：渲染循环、检测、画布合成、各类提示
│  │  ├─ GlassesSelector.tsx    # 镜框选择（radiogroup 语义）
│  │  └─ CameraControls.tsx     # 开启 / 关闭摄像头、拍摄照片
│  ├─ data/glasses.ts           # 眼镜配置表（统一在这里调参）
│  ├─ hooks/
│  │  ├─ useFaceLandmarker.ts   # 模型加载（模块级单例）+ 加载中/成功/失败状态
│  │  ├─ useCamera.ts           # getUserMedia、错误翻译、轨道清理
│  │  └─ useGlassesImages.ts    # 素材预加载
│  ├─ utils/
│  │  ├─ faceGeometry.ts        # 关键点编号常量 + 眼镜变换计算
│  │  ├─ smoothing.ts           # 指数平滑（含角度专用、突变吸附）
│  │  ├─ canvasRender.ts        # 镜像视频 + 眼镜图层的绘制
│  │  └─ screenshot.ts          # PNG 导出与文件名生成
│  ├─ constants.ts              # CDN 地址、平滑系数、摄像头参数、文案
│  ├─ types/index.ts            # GlassesConfig / GlassesTransform 等类型
│  ├─ App.tsx / main.tsx / styles.css
└─ index.html / vite.config.ts / tsconfig.json / package.json
```

---

## 实现说明

### 坐标系与镜像

整幅画面只做**一次**水平镜像变换，视频帧和眼镜都绘制在这个变换里：

```ts
ctx.translate(width, 0);
ctx.scale(-1, 1);
ctx.drawImage(video, 0, 0, width, height);  // 视频
// …在同一变换下绘制眼镜
```

因此两者天然共用同一套坐标系，页面缩放、设备像素比变化都不会错位；
截图直接导出 canvas，结果与用户所见完全一致（同样是镜像的）。

Canvas 的分辨率始终等于视频的原始分辨率（`videoWidth × videoHeight`），
CSS 层用 `aspect-ratio` 跟随真实比例，画面不会被拉伸。

### 人脸几何

关键点编号集中定义在 `src/utils/faceGeometry.ts` 的 `FACE_LANDMARKS`，其它文件不出现裸数字：

| 常量 | 编号 | 用途 |
| --- | --- | --- |
| `LEFT_EYE_OUTER` / `RIGHT_EYE_OUTER` | 33 / 263 | 外眼角，测量镜架总宽与倾斜角 |
| `LEFT_EYE_INNER` / `RIGHT_EYE_INNER` | 133 / 362 | 内眼角，虹膜点缺失时的兜底 |
| `LEFT_IRIS_CENTER` / `RIGHT_IRIS_CENTER` | 468 / 473 | 虹膜中心，用于确定镜片中心 |
| `NOSE_BRIDGE_TOP` | 168 | 鼻梁顶端，用于校验人脸有效性 |

> 编号是「图像坐标系」下的左右，`LEFT_*` 出现在画面左侧。由于最终整体镜像，用户看到的是对的。

`computeGlassesTransform()` 输出：

- `centerX` / `centerY`：双眼中心的中点，再沿**头部本地向下方向**施加垂直偏移（歪头时偏移方向也跟着转）
- `width`：外眼角距离 × `widthScale`
- `height`：由素材宽高比（400 : 140）推导，保证不变形
- `rotation`：外眼角连线的 `atan2` 角度 + 素材修正角
- `visible`：关键点齐全且双眼距离有效时为 `true`

### 防抖

`src/utils/smoothing.ts` 对四个参数分别做一阶指数平滑：

```
smoothed = previous * factor + current * (1 - factor)
```

- 位置与宽度：`SMOOTHING_FACTOR = 0.78`
- 旋转角：`ROTATION_SMOOTHING_FACTOR = 0.82`（角度上的抖动最明显，给稍大的系数）

两点额外处理：

1. **角度跨越 ±π** 时先把差值折算到 `[-π, π]`，避免眼镜「转一整圈」。
2. **突变吸附**：位移超过画面宽度的 25%（`SMOOTHING_SNAP_RATIO`）判定为重新入画，直接跳到新位置，
   不会让眼镜从画面一端慢慢飘过来。

用合成关键点实测：小幅移动约 6 帧（≈100ms）收敛到位，跟随感和稳定性平衡良好。

调参就改 `src/constants.ts` 里的两个系数，建议区间 0.70 ~ 0.85，越大越稳、越迟钝。

### 性能与生命周期

- 渲染循环只有一处 `requestAnimationFrame` 入口，切换眼镜**不会**重启循环、摄像头或模型。
- 同一帧视频不重复推理（比较 `video.currentTime`）。
- `document.hidden` 为真时（切到别的标签页）暂停识别与绘制。
- 模型走模块级 Promise 缓存，React StrictMode 的双次 effect 不会重复下载或创建两个实例。
- 摄像头用 token 机制防重，组件卸载时停止所有轨道。
- GPU delegate 初始化失败时自动回退到 CPU。

### 眼镜配置

`src/data/glasses.ts`：

```ts
interface GlassesConfig {
  id: string;
  name: string;
  caption: string;
  assetUrl: string;
  widthScale: number;      // 镜架总宽 ÷ 外眼角距离，基准 ≈1.55
  verticalOffset: number;  // 正数向下，单位是眼镜自身高度的倍数
  rotationOffset: number;  // 度，修正素材本身的倾斜
  opacity: number;
}
```

新增一款眼镜：把 SVG 放进 `public/glasses/`（沿用 `400 × 140` viewBox、镜片中心线 `y = 70`），
在 `GLASSES_CATALOG` 里加一条配置即可，其余代码无需改动。

### 截图

`拍摄照片` 直接把 canvas 导出为 PNG 下载，文件名格式：

```
virtual-glasses-YYYYMMDD-HHmmss.png
```

摄像头未开启时按钮不可用。

---

## 状态与提示

| 场景 | 界面表现 |
| --- | --- |
| 模型加载中 | 正在加载人脸识别模型…… |
| 模型加载失败 | 人脸识别模型加载失败，请刷新页面重试。（附「重新加载模型」按钮） |
| 摄像头未开启 | 摄像头未开启 + 引导文案 |
| 权限被拒绝 | 提示到地址栏权限设置里放行 |
| 无可用设备 / 被占用 / 非安全环境 | 分别给出对应提示 |
| 未检测到人脸 | 请将脸移入画面（眼镜隐藏） |

---

## 当前限制

- 纯 2D 贴图，只使用 roll（歪头）角度；侧脸转头（yaw）时眼镜不会跟着透视变形。
- 眼镜绘制在最上层，没有遮挡关系，镜腿不会被脸颊挡住。
- 无光照匹配与阴影，透明镜片不会折射背景。
- 只识别一张人脸（`MAX_FACES = 1`）。
- 首次使用需从 CDN 下载约 4MB 模型；离线部署需自行托管 WASM 与 `.task` 文件，并改 `src/constants.ts`。
- 贴合参数按平均脸型标定，极端脸型可能需要微调 `widthScale` / `verticalOffset`。

## 升级为 3D 试戴

主要改动集中在三处，其余可原样保留：

1. `src/utils/faceGeometry.ts` — 开启 `outputFacialTransformationMatrixes: true`，
   直接使用 4×4 头部姿态矩阵，输出六自由度位姿替代 `GlassesTransform`。
2. `src/utils/canvasRender.ts` — 换成 WebGL / Three.js 渲染层：用 MediaPipe 的相机内参构建透视相机，
   视频作背景纹理，加载 glTF 眼镜模型，并用人脸网格做遮挡剔除实现镜腿被脸挡住的效果。
3. `src/data/glasses.ts` — `assetUrl` 指向 `.glb`，配置项换成模型锚点、材质与缩放基准。

`useCamera`、`useFaceLandmarker`、UI 组件与截图逻辑基本无需重写；
`smoothing.ts` 改为对位置做指数平滑、对旋转做四元数球面插值即可。
