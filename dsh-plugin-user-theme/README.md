# dsh-plugin-user-theme

DSH（DeepSeek Harness）定制主题插件：**背景图 + 楷体 + 深蓝主色 + 半透明磨砂**，并提供一个原生的「背景设置」标签，可随时在界面上调背景、透明度、字体与字号。

不修改任何 npm 包源码，完全基于 DSH 公开插件 API。

## 效果

- 整个 Web 界面（`http://127.0.0.1:3080/`）铺一张自定义背景图
- 聊天区各层半透明磨砂，图片透出但文字清晰
- 设置面板 / 弹窗 / 菜单调实（0.97），保证内容清晰不串层
- 字体改楷体，字号可调
- 主色调换成深蓝（`#3b6ea8` / `#4a8fd6`）
- 设置面板左侧多出第 5 个原生标签「背景设置」，与「通用设置 / 模型 / 插件 / Agent 预设」完全一致，点击切换右侧内容区

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
- **重置默认**：一键恢复

所有设置实时预览，并持久化到 `localStorage`（键 `user-theme-settings-v1`）。

## 工作原理

DSH 主题系统是 CSS 变量驱动（`--dsw-alias-*`、`--dsw-specific-*`），深色主题由 `body[data-ds-dark-theme]` 覆盖变量。

1. **Node 端**：`apply(ctx)` 注入 `webServer`，`webServer.tapIndex()` 向每个 HTML 响应注入 `<style>`（默认主题）与壁纸 base64
2. **Client 端**：`lib/client.js` 注册 `settings.section`，React 组件读取/写入设置，用 `setProperty(prop, value, "important")` 覆盖 CSS 变量实现实时预览

透明度变量设在 `body` 上、字体变量设在 `documentElement` 上，与 BASE_CSS 的定义位置一致，确保内联样式能覆盖样式表里的 `!important`。

## 目录结构

```
dsh-plugin-user-theme/
├── package.json           # npm 元数据 + dsh.bundle + dsh.client.web 声明
├── cordis.patch.yml       # bundle patch（挂载入口）
├── src/
│   └── index.js           # Node 端入口：注入 CSS + 壁纸 base64
├── lib/
│   └── client.js          # Client 端 bundle：注册「背景设置」section
├── assets/
│   └── bg.jpg             # 默认背景图
├── LICENSE
└── README.md
```

## 换背景图

替换 `assets/bg.jpg`（建议 < 500KB，保持 JS 模块加载速度）。默认壁纸会随插件重新构建注入。

## 卸载

1. 编辑 `cordis.patch.yml`，删掉 `user-theme` 那条 insert
2. 删除链接：`rmdir "C:\Users\<你>\.dsh\profiles\node_modules\dsh-plugin-user-theme"`
3. 重启 DSH

## 兼容性

- DSH 0.1.0-rc.6
- Node.js ≥ 18
- 基于 DSH 公开 API：`webServer.tapIndex` + `settings.section` slot

## License

MIT
