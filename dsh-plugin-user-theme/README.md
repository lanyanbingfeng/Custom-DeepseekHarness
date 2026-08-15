# dsh-plugin-user-theme

DSH（DeepSeek Harness）定制主题插件：**背景图 + 楷体 + 深蓝主色 + 半透明磨砂 + Q 版桌宠**，并提供一个原生的「背景设置」标签，可随时在界面上调背景、透明度、字体、字号与桌宠。

不修改任何 npm 包源码，完全基于 DSH 公开插件 API。

## 效果

- 整个 Web 界面（`http://127.0.0.1:3080/`）铺一张自定义背景图
- 聊天区各层半透明磨砂，图片透出但文字清晰
- 设置面板 / 弹窗 / 菜单调实（0.97），保证内容清晰不串层
- 字体改楷体，字号可调
- 主色调换成深蓝（`#3b6ea8` / `#4a8fd6`）
- 设置面板左侧多出第 5 个原生标签「背景设置」，与「通用设置 / 模型 / 插件 / Agent 预设」完全一致，点击切换右侧内容区
- **右上角一只 Q 版桌宠**（chibi 全身小人，黑长直 + 齐刘海 + 白色连衣裙）：
  - 待机呼吸浮动 + 每 2.5–5s 随机眨眼
  - 鼠标悬停时挥手打招呼（附淡蓝光晕）
  - 点击时在 wink / 跳跃动作间轮换，带弹跳感
  - 可拖拽到任意位置，位置持久化；窗口缩放自动钳回视口
  - 「背景设置」里可开关桌宠、调节大小（60–160px）、一键复位位置
- **任务完成提醒**：任务跑完（默认耗时 ≥ 30 秒）且你不在看 DSH 页面时，三级通道同时就位：
  - 页签切走时播「叮-咚」提示音 + 可选 Windows 系统通知（带桌宠图标，点击聚焦回页面）；切回页签时桌宠连跳三下并弹出气泡「主人，你的任务完成了哦」（6 秒自动消失）
  - 浏览器整个关掉也能提醒：独立 **Python 桌面宠物**弹出真正 OS 级置顶透明窗口（右下角，跳跃 + 气泡 + 提示音，15 秒或点击后收起）
  - 「背景设置」里可配置：总开关、最短提醒耗时（5–300 秒）、提示音、系统通知、桌面宠物

## 架构（双端）

本插件分两半，各司其职：

| 端 | 文件 | 职责 |
|----|------|------|
| **Node 端** | `src/index.js` | 通过 `webServer.tapIndex()` 注入主题 CSS 与 `window.__USER_THEME_ASSETS__`（壁纸 base64） |
| **Client 端** | `lib/client.js` | 通过官方 `settings.section` slot 把「背景设置」注册为设置面板第 5 个原生标签，React 组件负责交互与实时预览 |

关键点：设置标签走的是 **DSH 官方 client 插件机制**（`dsh.client.platform = "web"` + `ctx.slots.inject("settings.section", ...)`），由 React 原生渲染和切换，**不做任何 DOM hack**，因此不会出现卡死或内容叠加。

## 安装（本地 file: 引用，免发布）

### 1. 建立链接（零拷贝）

用管理员 PowerShell：

```powershell
mklink /J "C:\Users\<你>\.dsh\profiles\node_modules\dsh-plugin-user-theme" "<本插件目录的绝对路径>"
```

> macOS / Linux 用 `ln -s`。

### 2. 挂载插件

编辑 `C:\Users\<你>\.dsh\profiles\web\cordis.patch.yml`，在末尾追加：

```yaml
- insert:
    - id: user-theme
      name: dsh-plugin-user-theme
```

### 3. 重启 DSH

```powershell
# 停掉占用 3080 端口的进程
Get-NetTCPConnection -LocalPort 3080 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# 重启 DSH web（路径换成你自己的 dsh bin.js）
Start-Process node -ArgumentList "...\node_modules\@deepseek-ai\dsh\lib\bin.js","web" -WindowStyle Hidden
```

浏览器强刷（Ctrl+Shift+R）后，设置面板左下角即可看到第 5 个「背景设置」标签。

## 使用

打开 DSH 设置面板 → 点左侧「背景设置」：

- **背景图**：选默认壁纸，或上传自定义图片（≤ 2MB）
- **UI 透明度**：主区域 / 侧边栏 / 输入框 / 设置面板 四档独立调节
- **字体**：楷体 / 系统默认；字号 13–20px
- **桌宠**：显示开关、大小滑块（60–160px）、复位位置（拖拽过才出现）
- **重置默认**：一键恢复

所有设置实时预览，并持久化到 `localStorage`（键 `user-theme-settings-v1`）。

## 工作原理

DSH 主题系统是 CSS 变量驱动（`--dsw-alias-*`、`--dsw-specific-*`），深色主题由 `body[data-ds-dark-theme]` 覆盖变量。

1. **Node 端**：`apply(ctx)` 注入 `webServer`，`webServer.tapIndex()` 向每个 HTML 响应注入 `<style>`（默认主题 + 桌宠样式）、壁纸 base64 与 `__USER_THEME_ASSETS__.pet`（桌宠 5 帧 base64，缺帧自动回退 idle）
2. **Client 端**：`lib/client.js` 注册 `settings.section`，React 组件读取/写入设置，用 `setProperty(prop, value, "important")` 覆盖 CSS 变量实现实时预览；桌宠由 `setupDesktopPet()` 以 vanilla JS 挂到 `body`（fixed 容器），帧切换做表情、CSS transform 做浮动/拖拽，设置变更通过 `user-theme-settings-changed` 事件同步

透明度变量设在 `body` 上、字体变量设在 `documentElement` 上，与 BASE_CSS 的定义位置一致，确保内联样式能覆盖样式表里的 `!important`。

## 任务完成提醒（架构）

Node 端是唯一事件源，浏览器与 Python 桌宠都是 SSE 消费方：

```
agent/status 事件 ──► Node 插件（耗时统计 + 阈值过滤 + 子代理排除）
浏览器 visibilitychange 上报 ──► Node（可见页签集合）
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
- **可见性上报**：每个页签以唯一 clientId 经 `POST /pet-visibility` 上报（visibilitychange + 20s 心跳 + pagehide sendBeacon），Node 端 60 秒未上报自动剔除
- **配置**：`GET/POST /pet-config` 持久化到 `~/.dsh/user-theme-pet-notify.json`（不污染插件目录）；提醒总开关/阈值/桌面宠物三项由服务端权威存储、多页签共享；提示音/系统通知为每浏览器本地偏好
- **Python 桌宠托管**：`desktopPetEnabled` 时 Node 端 `spawn`（detached + windowsHide）拉起 `desktop_pet.py`（tkinter 透明置顶窗，纯标准库，提示音为 winsound 播放内存生成的 wav）；启动失败仅记日志、不影响浏览器功能；插件 dispose 时回收进程
- **独立运行**：`python desktop_pet.py --sse http://127.0.0.1:3080/plugins/dsh-plugin-user-theme/pet-events --assets <插件目录>/assets/pet`
- **系统通知授权**：在「背景设置 → 任务完成提醒」里打开「系统通知」开关时会触发浏览器授权请求

## 目录结构

```
dsh-plugin-user-theme/
├── package.json           # npm 元数据 + dsh.bundle + dsh.client.web 声明
├── cordis.patch.yml       # bundle patch（挂载入口）
├── src/
│   └── index.js           # Node 端入口：注入 CSS + 壁纸/桌宠帧 base64；agent/status 耗时检测、pet-events(SSE)/pet-visibility/pet-config 路由、Python 桌宠托管
├── lib/
│   └── client.js          # Client 端 bundle：注册「背景设置」section + 桌宠逻辑 + 任务完成提醒（SSE 消费/可见性上报/提示音/系统通知）
├── desktop_pet.py         # 独立桌面宠物：tkinter 置顶透明窗，SSE 订阅完成事件，跳跃+气泡+提示音
├── assets/
│   ├── bg.jpg             # 默认背景图
│   └── pet/               # 桌宠动作帧（透明背景 PNG，高 320px）
│       ├── idle.png       # 待机睁眼（基准帧）
│       ├── blink.png      # 闭眼（眨眼用，由 idle 合成）
│       ├── wave.png       # 挥手（悬停打招呼）
│       ├── wink.png       # wink（点击互动之一）
│       └── jump.png       # 跳跃（点击互动轮换）
├── LICENSE
└── README.md
```

## 换背景图

替换 `assets/bg.jpg`（建议 < 500KB，保持 JS 模块加载速度）。默认壁纸会随插件重新构建注入。

## 换桌宠帧

替换 `assets/pet/` 下对应 PNG 即可（保持透明背景、高度约 320px 效果最佳）；缺帧时自动回退 `idle.png`，重启 DSH 后生效。

## 卸载

1. 编辑 `cordis.patch.yml`，删掉 `user-theme` 那条 insert
2. 删除链接：`rmdir "C:\Users\<你>\.dsh\profiles\node_modules\dsh-plugin-user-theme"`
3. 重启 DSH

## 兼容性

- DSH 0.1.0-rc.6
- Node.js ≥ 18
- 基于 DSH 公开 API：`webServer.tapIndex` + `webServer.register` + `settings.section` slot + `agent/status` 事件
- 独立桌面宠物（可选）：Python 3（标准库 tkinter，Windows 自带 winsound）；缺失时仅浏览器内提醒可用

## License

MIT
