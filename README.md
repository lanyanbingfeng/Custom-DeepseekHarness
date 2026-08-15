# Custom DeepSeek Harness

把 DSH（DeepSeek Harness）的 Web 界面定制成 **背景图 + 楷体 + 深蓝主色 + 半透明磨砂**，并内置一个原生的「背景设置」标签，可在界面上实时调节背景、透明度、字体与字号。

核心实现是一个符合 DSH「一切皆插件」规范的插件包 `dsh-plugin-user-theme`。

## 成果

| 模块 | 说明 |
|------|------|
| **插件** | `dsh-plugin-user-theme/`，双端架构（Node 注入 CSS + Client 注册设置标签） |
| **预览地址** | http://127.0.0.1:3080/ |

## 插件结构

```
dsh-plugin-user-theme/
├── package.json            # 元数据 + dsh.bundle + dsh.client.web 声明
├── cordis.patch.yml        # 挂载入口（insert user-theme）
├── src/index.js            # Node 端：webServer.tapIndex 注入 CSS + 壁纸 base64
├── lib/client.js           # Client 端：settings.section slot 注册「背景设置」
├── assets/bg.jpg           # 默认背景图
├── README.md
└── LICENSE
```

## 工作原理

1. **Node 端**（`src/index.js`）：`apply(ctx)` 注入 `webServer` 服务，`webServer.tapIndex()` 向所有 HTML 响应注入 `<style>`（默认主题：背景图、楷体、深蓝主色、各层透明度）以及 `window.__USER_THEME_ASSETS__`（壁纸 base64）
2. **Client 端**（`lib/client.js`）：通过官方 `settings.section` slot 把「背景设置」注册为设置面板第 5 个原生标签；React 组件负责交互，用 `setProperty(prop, value, "important")` 覆盖 CSS 变量实现实时预览，并持久化到 `localStorage`

设置标签走 DSH 官方 client 插件机制，由 React 原生渲染切换，**不做 DOM hack**，因此不会卡死或内容叠加。

## 本地挂载（开发）

1. junction 链接（零拷贝）：

   ```powershell
   mklink /J "C:\Users\ZhuanZ\.dsh\profiles\node_modules\dsh-plugin-user-theme" "<本仓库>/dsh-plugin-user-theme"
   ```

2. 编辑 `C:\Users\ZhuanZ\.dsh\profiles\web\cordis.patch.yml`，追加：

   ```yaml
   - insert:
       - id: user-theme
         name: dsh-plugin-user-theme
   ```

3. 重启 DSH 后强刷浏览器

## 使用

打开 DSH 设置面板 → 点左侧「背景设置」标签：

- **背景图**：默认壁纸 / 上传自定义图片（≤ 2MB）
- **UI 透明度**：主区域 / 侧边栏 / 输入框 / 设置面板 四档独立调节
- **字体**：楷体 / 系统默认，字号 13–20px
- **重置默认**：一键恢复

## 其他目录

- `demo/`：早期静态 HTML 高保真 demo（设计阶段验证用）
- `backup_20260815_123700/`：最初改动前的配置文件备份

## License

MIT
