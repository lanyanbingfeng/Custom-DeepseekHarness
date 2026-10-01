# dsh-plugin-user-theme

DSH（DeepSeek Harness）定制主题插件：**背景图 + 楷体 + 深蓝主色 + 半透明磨砂 + Q 版桌宠**，并提供一个原生的「背景设置」标签，可随时在界面上调背景、透明度、字体、字号与桌宠；侧边栏底部还内置一张 **DeepSeek 余额卡片**，直接读取你已登录的 **DeepSeek 账号**余额，并提供「用量明细 / 在线对话」快捷入口。

不修改任何 npm 包源码，完全基于 DSH 公开插件 API。

> **v0.4.0**：余额卡片改为走 **DeepSeek 账号登录态**（不再需要 API Key）。
> **v0.3.0**：已适配 DSH 桌面端（DeepSeek Harness 桌面应用 / `dsh-plugin-manager` 插件市场）。桌面端可以直接在「插件 → 添加插件」里安装本插件；安装说明见下方[安装](#安装桌面端插件市场)。

## 功能一览

- 🎨 **主题定制**：背景图、楷体、深蓝主色、各层半透明磨砂（见下）
- 🐾 **Q 版桌宠 + 任务完成提醒**：呼吸眨眼、拖拽互动、三级提醒（见下）
- 💰 **DeepSeek 余额卡片**：读取 DeepSeek 账号余额（v0.2.0 新增，v0.4.0 起改用账号登录态）

## 效果

- 整个界面铺一张自定义背景图
- 聊天区各层半透明磨砂，图片透出但文字清晰
- 设置面板 / 弹窗 / 菜单调实（0.97），保证内容清晰不串层
- 字体改楷体，字号可调
- 主色调换成深蓝（`#3b6ea8` / `#4a8fd6`）
- 设置面板左侧多出一个原生标签「背景设置」，与「通用设置 / 模型 / 插件 / Agent 预设」完全一致，点击切换右侧内容区
- **右上角一只 Q 版桌宠**（chibi 全身小人，黑长直 + 齐刘海 + 白色连衣裙）：
  - 待机呼吸浮动 + 每 2.5–5s 随机眨眼
  - 鼠标悬停时挥手打招呼（附淡蓝光晕）
  - 点击时在 wink / 跳跃动作间轮换，带弹跳感
  - 可拖拽到任意位置，位置持久化；窗口缩放自动钳回视口
  - 「背景设置」里可开关桌宠、调节大小（60–160px）、一键复位位置
- **任务完成提醒**：任务跑完（默认耗时 ≥ 30 秒）且你不在看页面时，三级通道同时就位：
  - 页签切走时播「叮-咚」提示音 + 可选 Windows 系统通知（带桌宠图标，点击聚焦回窗口）；切回时桌宠连跳三下并弹出气泡「主人，你的任务完成了哦」（6 秒自动消失）
  - 窗口整个关掉也能提醒：独立 **Python 桌面宠物**弹出真正 OS 级置顶透明窗口（右下角，跳跃 + 气泡 + 提示音，点击后收起）
  - 「背景设置」里可配置：总开关、最短提醒耗时（5–300 秒）、提示音、系统通知、桌面宠物

## 架构（双端）

本插件分两半，各司其职：

| 端 | 文件 | 职责 |
|----|------|------|
| **Host 端** | `src/index.js` | 通过 `webserver/index-inject` 贡献**结构化注入行**（主题样式 + 资源地址 + 壁纸 preload）；提供 `/plugins/dsh-plugin-user-theme/assets/*` 静态资源路由（壁纸与桌宠动作帧）；任务提醒 SSE 路由与 Python 桌宠托管；`/balance` 余额查询代理（凭据在服务端解析，浏览器不接触 API Key） |
| **Client 端** | `lib/client.js` | 启动时插入主题样式表；按需拉取壁纸/桌宠素材；通过官方 `settings.section` slot 把「背景设置」注册为设置面板原生标签；通过 `sidebar.footer.action` slot 在侧边栏底部渲染余额卡片；React 组件负责交互与实时预览 |

关键点：设置标签和余额卡片都走 **DSH 官方 client 插件机制**（`dsh.client.platform = "web"` + `ctx.slots.inject(...)`），由 React 原生渲染，**不做任何 DOM hack**。

### 为什么不再用 `webServer.tapIndex()`

桌面端窗口加载的是打包好的静态 `index.html`（`dsh-app://app/`），`tapIndex` 只在「Host 的 fallback 渲染 index」这条 Web 端路径上执行，所以桌面端拿不到它注入的 `<style>`。

本插件因此改用两条两端通用、也都是官方推荐的通道：

1. **`webserver/index-inject` 事件 → 结构化注入行**（`style` / `global` / `html`）。桌面外壳在页面启动阶段按序应用这些行，Web 端由 Host 渲染 index 时应用同一批行。
2. **`webServer.register()` 静态资源路由**。桌面外壳把 `dsh-app://app/plugins/**` 转发给 Host，因此浏览器按文档相对地址 `plugins/...` 就能取到壁纸与桌宠帧，不必再把图片 base64 塞进 HTML。

## 安装（桌面端插件市场）

DSH 桌面端：「插件」页 → 右上角 **添加插件** → 输入下面任一种地址 → **安装**。安装完按提示重启桌面端即可。

### 方式 A：GitHub 仓库（推荐分享用）

```
github:lanyanbingfeng/Custom-DeepseekHarness
```

或等价的 HTTPS 写法：

```
https://github.com/lanyanbingfeng/Custom-DeepseekHarness.git
```

> 本仓库**根目录就是插件包**（`package.json` 里声明了 `dsh.bundle.patch`），所以直接给仓库地址即可，不需要写子目录。
> 包名方式（如 `dsh-plugin-user-theme`）需要先发布到 npm 注册表；未发布时请用上面的 Git 地址或下面的本地目录。

### 方式 B：本地目录（自己改代码开发时用）

```
C:\Other\Custom-DeepseekHarness
```

安装源选「中国大陆镜像源」或默认源都可以；本地目录不会走注册表（pnpm 会建 junction，改完源码重启即生效）。

### 安装后

- 侧边栏「插件」页会出现 **定制主题 + 桌宠 + 余额卡片**（`dsh-plugin-user-theme`），可随时启停
- 重启后打开设置面板，左侧即可看到「背景设置」标签
- 插件安装、启停都写入 profile 的 `package.json` 与 `cordis.patch.yml`，无需手工编辑

### 卸载

在「插件」页点该插件 → 卸载。手工方式是 `dsh plugin --profile desktop remove dsh-plugin-user-theme`。

## 使用

打开 DSH 设置面板 → 点左侧「背景设置」：

- **背景图**：选默认壁纸，或上传自定义图片（≤ 2MB）
- **UI 透明度**：主区域 / 侧边栏 / 输入框 / 设置面板 四档独立调节
- **字体**：楷体 / 系统默认；字号 13–20px
- **桌宠**：显示开关、大小滑块（60–160px）、复位位置（拖拽过才出现）
- **任务完成提醒**：总开关、最短提醒耗时（5–300s）、提示音、系统通知（需授权）、桌面宠物，以及「测试提醒效果」按钮
- **重置默认**：一键恢复

所有设置实时预览，并持久化到 `localStorage`（键 `user-theme-settings-v1`）。

## 工作原理

DSH 主题系统是 CSS 变量驱动（`--dsw-alias-*`、`--dsw-specific-*`），深色主题由 `body[data-ds-dark-theme]` 覆盖变量。

1. **Host 端**：`apply(ctx)` 监听 `webserver/index-inject`，每次收集注入表时推入三行——主题 `<style>`、`__USER_THEME_ASSETS__`（壁纸与桌宠帧的文档相对地址）、壁纸 `<link rel="preload">`；同时注册资源路由与 SSE / 余额路由
2. **Client 端**：`apply()` 先插入主题样式表（把 `--ut-bg-url`、`--ut-font-family` 等变量挂到 `:root`），再按需 `fetch` 壁纸与桌宠帧（PNG 转 `blob:` URL，切换表情不闪）；React 组件读写设置，用 `setProperty(prop, value, "important")` 覆盖 CSS 变量实现实时预览

透明度变量设在 `body` 上、字体与壁纸变量设在 `documentElement` 上，与样式表里的定义位置一致，确保内联样式能覆盖样式表里的 `!important`。

字号只覆盖当前版本实际存在的排版变量（`--dsw-font-markdown-base`、`--dsw-font-xs-13`）；其余字号交给 DSH 自己的缩放逻辑，避免覆盖不存在的变量造成字号回退。

## 任务完成提醒（架构）

Host 端是唯一事件源，浏览器与 Python 桌宠都是 SSE 消费方：

```
agent/status 事件 ──► Host 插件（耗时统计 + 阈值过滤 + 子代理排除）
浏览器 visibilitychange 上报 ──► Host（可见页签集合）
                          │
                          ▼
              SSE: /plugins/dsh-plugin-user-theme/pet-events
                ┌─────────┴─────────┐
                ▼                   ▼
        浏览器页签            Python 桌面宠物
   （气泡+提示音+通知）   （置顶窗口+气泡+提示音）
```

- **检测**：`ctx.on("agent/status")` 记录每个 agent 的 idle→running→idle 周期，耗时 ≥ 阈值（默认 30s）才广播 `done` 事件；`session.header.origin === "subagent"` 的子代理会话直接跳过
- **不打扰原则**：你正在看 DSH 页面时（含只看其他浏览器页签的判定由 `document.visibilityState` 天然覆盖）三级通道全部静默；正在看页面时完成的短任务也不会提醒
- **可见性上报**：每个页签以唯一 clientId 经 `POST /pet-visibility` 上报（visibilitychange + 20s 心跳 + pagehide sendBeacon），Host 端 60 秒未上报自动剔除
- **配置**：`GET/POST /pet-config` 持久化到 `~/.dsh/user-theme-pet-notify.json`（不污染插件目录）；提醒总开关/阈值/桌面宠物三项由服务端权威存储、多页签共享；提示音/系统通知为每浏览器本地偏好
- **Python 桌宠托管**：`desktopPetEnabled` 时 Host 端 `spawn`（detached + windowsHide）拉起 `desktop_pet.py`（tkinter 透明置顶窗，纯标准库，提示音为 winsound 播放内存生成的 wav）；启动失败只记日志、不影响浏览器内功能；插件卸载/停用时回收进程
- **桌宠渲染（纯标准库）**：素材原始帧高 320px，显示区仅约 128px——有 Pillow 时 LANCZOS 缩放并预合成 alpha 到色键色；无 Pillow 时用 Tk PhotoImage 自带的 `zoom()/subsample()` 做整数有理逼近等比缩放（当前帧精确 2/5，误差 0），**绝不原图直读**（早期版本在此环境下会把头顶、脚、两侧头发裁掉 60%）。Label 宽度按缩放后最宽帧（jump/wave 比 idle 宽）自适应；进程启动即声明 Per-Monitor V2 DPI 感知（旧系统回退 shcore API），150% 缩放下按物理像素 1:1 渲染，不被 Windows 位图拉伸发虚
- **单实例保证**：桌宠是 detached 独立进程（DSH 关掉后仍要显示提醒），父进程退出后它会留存，因此启动前会先清理历史遗留的桌宠进程——只匹配命令行含本插件 `desktop_pet.py` 路径的 python，不误伤其它 python；停止时用 `taskkill /T /F` 结束整棵进程树（Windows 上 `python` 常先起一个 shim 再拉起真实解释器，只杀直接子进程会留下孤儿）。清理与启动串行化，不会出现「清理迟到杀掉新桌宠」的竞态
- **独立运行**：`python desktop_pet.py --sse http://127.0.0.1:19387/plugins/dsh-plugin-user-theme/pet-events --assets <插件目录>/assets/pet`
- **系统通知授权**：在「背景设置 → 任务完成提醒」里打开「系统通知」开关时会触发浏览器授权请求

## 目录结构

本仓库根目录**就是插件包**（这样 DSH 桌面端「添加插件」里直接填仓库地址即可安装）：

```
Custom-DeepseekHarness/          # = npm 包 dsh-plugin-user-theme
├── package.json           # npm 元数据 + dsh.manifestVersion + dsh.bundle + dsh.client
├── cordis.patch.yml       # 组合包 patch（挂载入口）
├── src/
│   └── index.js           # Host 端入口：结构化注入行 + 资源路由 + 提醒/余额路由 + 桌宠托管
├── lib/
│   └── client.js          # Client 端 bundle：主题样式注入 + 「背景设置」section + 桌宠 + 提醒 + 余额卡片
├── locale/
│   ├── en.json            # 插件市场展示用的标题 / 描述（英文回退）
│   └── zh.json            # 中文展示元数据
├── desktop_pet.py         # 独立桌面宠物：tkinter 置顶透明窗（Per-Monitor DPI 感知），SSE 订阅完成事件
├── assets/
│   ├── bg.jpg             # 默认背景图
│   └── pet/               # 桌宠动作帧（透明背景 PNG，高 320px）
│       ├── idle.png       # 待机睁眼（基准帧）
│       ├── blink.png      # 闭眼（眨眼用）
│       ├── wave.png       # 挥手（悬停打招呼）
│       ├── wink.png       # wink（点击互动之一）
│       └── jump.png       # 跳跃（点击互动轮换）
├── demo/                  # 静态高保真预览（不属于插件运行时）
├── Image/                 # 效果图
├── backup_20260815_123700/ # 最初改动前的配置备份
├── LICENSE
└── README.md
```

`package.json` 的 `files` 白名单只包含运行时真正需要的目录，`demo/`、`Image/`、`backup_*` 不会进入安装产物。

## 换背景图

替换 `assets/bg.jpg`（建议 < 500KB）。资源 URL 带 `mtime+size` 版本串，重新安装/重启后浏览器会取到新图。

## 换桌宠帧

替换 `assets/pet/` 下对应 PNG 即可（透明背景、高度约 320px 效果最佳）。各帧高度保持一致即可，**宽度允许不同**（如挥手/跳跃帧更宽）：脚本按统一高度等比缩放，显示宽度自动取最宽帧，窄帧水平居中。缺帧时自动回退 `idle.png`，重启 DSH 后生效。

## DeepSeek 余额卡片

侧边栏底部（设置按钮正上方）显示一张磨砂余额卡片，并在卡片内部右侧提供两个快捷入口按钮。

**卡片布局**

```
┌───────────────────────────────────────┐
│ ● DeepSeek 账号余额        ⟳ 刷新     │
│                    ┌────────────────┐ │
│  44.27 元          │ 📊 用量明细    │ │
│  更新于 20:10      │ 💬 在线对话    │ │
│  · 含赠送 3.47     └────────────────┘ │
└───────────────────────────────────────┘
              [ 设置 ]
```

- **左栏**：大号余额 + 「更新于 HH:MM」（有赠送额度时追加「· 含赠送 x.xx」）；**右栏**：刷新按钮正下方两个上下堆叠的小填充按钮（仿侧边栏按钮，无超链接外观）
- 状态圆点：🟢 正常 / 🟠 余额低于 ¥5（阈值写死在 client 端）/ 🔴 未登录或查询失败；首次加载显示骨架屏
- 「用量明细」→ `https://platform.deepseek.com/usage`，「在线对话」→ `https://chat.deepseek.com/`，均新窗口打开
- 进入页面自动拉取，此后每 5 分钟刷新，切回标签页立即刷新，点刷新图标强制拉取
- 侧边栏折叠为图标轨时，卡片收成一个状态圆点（hover 显示金额），按钮随卡片隐藏
- 静态高保真预览见仓库 `demo/balance-card-preview.html`（直接用浏览器打开即可；该预览是 API Key 时代的旧版样式）

**数据来源：DeepSeek 账号（不需要 API Key）**

```
浏览器 ──fetch──► /plugins/dsh-plugin-user-theme/balance
                          │
                  Host 插件（凭据不离开 Host）
                          │  ctx.deepseekAccount.getBalance({ version, locale, timezoneOffsetSeconds })
                          ▼
                  Platform 钱包余额（与「设置 → 账号」同一登录态）
```

- 数据来自 harness 的 **`deepseekAccount` 服务**，与设置面板「账号」页用的是**同一套登录态**：你登录过账号就能直接看到余额，**不需要配置 API Key**，也不再读取 `DEEPSEEK_API_KEY`
- 浏览器只请求插件自己的本机路由，**任何 token 都不会到浏览器**
- **未登录时**卡片红点显示「未登录 DeepSeek 账号 · 点此登录」，点击会尽力把你带到设置面板的「账号」页
- **多币种**：`getBalance` 返回的是钱包列表，插件按币种合并（余额 + 赠送额度），优先展示 CNY；`balance` 是合并后的总额，`bonus` 是其中赠送部分
- 服务端结果内存缓存 60 秒并合并并发请求；点刷新图标会强制绕过缓存
- 调用时按 harness 的约定带上客户端身份（`version` = 插件版本、`locale` = 当前 UI 语言、`timezoneOffsetSeconds`），Platform 据此返回本地化文案

**挂载位置**：Client 端通过官方 `sidebar.footer.action` list slot 注册（owner props 为 `{ wide }`，折叠态据此切换圆点）。由于该 slot 是横向 list，余额卡片内部的多块内容由单一 React 组件根承载。

## 兼容性

- **DSH ≥ 0.2.0-rc.2**（桌面端与 `dsh web` 均可），开发验证于 0.2.0-rc.2
- Node.js ≥ 20（随桌面端打包的运行时为 Node 24）
- 运行期**零第三方依赖**，只用 Node 内置模块；`peerDependencies` 里的 `@deepseek-ai/dsh` 用于版本兼容性预检
- 基于 DSH 公开 API：`webserver/index-inject` 事件 + `webServer.register` + `settings.section` slot + `sidebar.footer.action` slot + `agent/status` / `agent/disposed` / `tools/execute` 事件 + `deepseekAccount` 账号服务
- 余额卡片需要**已登录 DeepSeek 账号**（设置 → 账号）；未登录时卡片会提示并可点击跳转登录，不需要 API Key
- 独立桌面宠物（可选，默认开启）：Python 3 + tkinter（Tk 8.6，Windows 自带 winsound），**纯标准库即可完整运行**：未安装 Pillow 时自动改用 Tk PhotoImage 的 `zoom/subsample` 等比缩放；装有 Pillow 时获得 LANCZOS 高质量缩放与 alpha 预合成。缺 tkinter 时仅浏览器内提醒可用；系统 Python 若不带 tkinter，可用环境变量 `DSH_PET_PYTHON` 指定其它解释器。不想用可在「背景设置」里关掉
- 高 DPI 屏：桌宠进程声明 Per-Monitor V2 感知（Win10 1703+），旧系统回退 `SetProcessDpiAwareness`，均不支持时退回系统位图拉伸

## 本地开发

改完 `src/index.js` 或 `lib/client.js` 后重启桌面端（或 `dsh web`）生效；用本地目录安装时 pnpm 会建 junction，源码改动立刻反映到 profile。

手工挂载（不使用插件市场时）：

```yaml
# ~/.dsh/profiles/desktop/cordis.patch.yml
- insert:
    - id: user-theme
      name: dsh-plugin-user-theme
```

## 更新日志

### 0.4.0

- **余额卡片改用 DeepSeek 账号**：不再解析 `DEEPSEEK_API_KEY`、不再直连 `api.deepseek.com/user/balance`，改为调用 harness 的 **`deepseekAccount` 服务**（`getBalance(client)`），与「设置 → 账号」页共用同一登录态。删除了 `~/.dsh/user-theme-balance.json` 配置项与自定义 `baseURL` 支持
- **多币种合并**：`getBalance` 返回的是钱包列表（含 `bonusWallets` 赠送额度），现在按币种合并后展示，优先 CNY；卡片副行会显示「· 含赠送 x.xx」
- **未登录有明确出口**：账号未登录时卡片红点显示「未登录 DeepSeek 账号 · 点此登录」，点击尽力导航到设置面板的「账号」页；登录态失效另有单独文案
- 卡片标题改为「DeepSeek 账号余额」，快捷入口「API 平台」改为「用量明细」

### 0.3.1

- **修复启动失败（重要）**：`lib/client.js` 里的 `exports.inject` 写成了两个**包名**（`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-sidebar`）。Cordis loader 会把这个 inject 直接当作**服务名**（`Inject.resolve(fiber.entry.options.inject, fiber.inject)`），而没有任何服务注册在这些包名下，于是 fiber 永久 pending，浏览器启动审计以 `web boot: 1 entry did not activate` 让整个应用起不来。现在改为 `["slots"]`——61 个随发行版出货的客户端插件里，`slots` 出现在 `@deepseek-ai/dsh-client-resources`、`@deepseek-ai/dsh-client-ui-attachment` 等一批插件的合法服务清单中
- **同时移除** `package.json` 里的 `dsh.client.inject`：该字段在图里只用于模块到达顺序（`arriveGraphRow`），本插件不需要，且同样是我按错误理解添加的

### 0.3.0

- **桌面端适配（重要）**：DSH 桌面应用的页面来自打包好的静态 `index.html`，`webServer.tapIndex()` 在那边不会执行，主题样式与壁纸因此完全失效。现在改为通过官方 `webserver/index-inject` 事件贡献**结构化注入行**（`style` / `global` / `html`），桌面外壳与 Web 端 fallback 都会应用同一批行
- **资源改为路由提供**：新增 `/plugins/dsh-plugin-user-theme/assets/*`（白名单式路由，含目录约束与 `mtime+size` 版本串），壁纸与桌宠帧由客户端按需拉取。不再把 2.8MB base64 塞进每个 HTML 响应，首屏更轻；壁纸另有一行 `<link rel="preload">`
- **插件市场元数据**：补齐 `dsh.manifestVersion`、`engines.dsh`、`peerDependencies`（DSH 版本兼容性预检）、`locale/{en,zh}.json` 展示标题与描述
- **客户端样式自带**：主题样式表改为 client bundle 在启动时插入，桌面端与 Web 端表现一致
- **适配 0.2.0 主题变量**：字号只覆盖当前版本真实存在的 `--dsw-font-markdown-base` / `--dsw-font-xs-13`（原先覆盖的 `--dsw-font-base-16`、`--dsw-font-s-14` 已不存在，会造成字号回退）；余额卡片按钮补 `--dsw-alias-bg-layer-2` 回退；`agent/status`、`agent/disposed` 同时兼容作用域 `this` 与 payload 形态
- **设置面板透明度**：不再写死旧版本的哈希类名（`VOzbGW_panel` 在 0.2.0 已不存在），改为按构建产物里真实存在的 `*_dialog_*` / `*_panel_*` / `*_modal_*` 匹配，并把面板背景指向 `--dsw-alias-bg-overlay`
- **仓库布局调整**：插件包上移到仓库根目录，这样桌面端「添加插件」里直接填仓库地址即可安装，无需写子目录

### 0.2.2

- **修复**：Python 桌宠在运行环境未安装 Pillow 时，动作帧按原始尺寸 200×320 直接塞进 128px 的 Label，头顶、脚、两侧长发被裁掉约 60%。现在无 Pillow 时改用 Tk PhotoImage 自带的 `zoom()/subsample()` 整数有理逼近等比缩放到目标高度（当前素材精确 2/5，误差 0），纯标准库即可完整显示
- **修复**：Label 宽度从写死的 128px 改为按缩放后最宽帧自适应，宽动作帧不再被左右裁切
- **改进**：桌宠进程启动即声明 Per-Monitor V2 DPI 感知，高 DPI 屏按物理像素 1:1 渲染

### 0.2.1

- **修复**：每次重启都会多留一个 Python 桌宠窗口、逐次累积的问题。现在启动前先清理遗留桌宠，停止时用 `taskkill /T /F` 结束整棵进程树，并保证「清理 → 启动」串行

### 0.2.0

- **新增**：侧边栏 DeepSeek API 余额卡片（`sidebar.footer.action` slot），含状态点、骨架屏、自动/手动刷新、折叠态圆点
- **新增**：`/balance` 服务端代理，API Key 经 credentials seam 在 Host 端解析，浏览器不接触
- **新增**：卡片内部右侧「API 平台 / 在线对话」两个上下堆叠的快捷按钮

### 0.1.0

- 首个版本：主题定制（背景图 / 楷体 / 深蓝主色 / 半透明磨砂）、「背景设置」标签、Q 版桌宠、任务完成提醒（页签 / 系统通知 / Python 桌面宠物三级通道）

## License

MIT
