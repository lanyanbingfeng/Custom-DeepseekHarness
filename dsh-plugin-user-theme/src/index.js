// DSH 定制主题插件入口（Node 端）
//
// 职责：
//   1. 通过 webServer.tapIndex() 注入主题 CSS（背景图 + 楷体 + 深蓝主色 + 各层半透明）
//      以及"背景设置"section 的内容样式；
//   2. 注入 window.__USER_THEME_ASSETS__ 变量，携带默认壁纸的 base64，
//      供浏览器端 client bundle（lib/client.js）的 React 组件读取。
//
// "背景设置"本身作为 DSH 设置面板的第 5 个原生标签，由 lib/client.js 通过
// 官方 `settings.section` slot 注册，走 React 原生渲染通道，不做任何 DOM hack。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BG_PATH = join(__dirname, "..", "assets", "bg.jpg");

function buildCss() {
  const buf = readFileSync(BG_PATH);
  const b64 = buf.toString("base64");
  const bgUri = `data:image/jpeg;base64,${b64}`;

  const BASE_CSS = `
/* ===== DSH 用户主题（dsh-plugin-user-theme） ===== */

/* 字体：楷体 */
:root {
  --dsw-font-family: "KaiTi", "楷体", "STKaiti", "华文楷体", "Microsoft YaHei", sans-serif !important;
}

/* 背景图：html/body/#root 三层 */
html, body, #root {
  background-image: url("${bgUri}") !important;
  background-size: cover !important;
  background-position: center !important;
  background-attachment: fixed !important;
  background-repeat: no-repeat !important;
}

/* 各层背景半透明 + 主色调 + 面板调实 */
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: rgba(21, 21, 23, 0.45) !important;
  --dsw-alias-bg-layer-1: rgba(35, 35, 36, 0.40) !important;
  --dsw-alias-bg-layer-2: rgba(44, 44, 46, 0.38) !important;
  --dsw-alias-bg-layer-3: rgba(53, 54, 56, 0.36) !important;
  --dsw-specific-sidebar-fill: rgba(27, 27, 28, 0.48) !important;
  --dsw-specific-input-major: rgba(44, 44, 46, 0.42) !important;
  --dsw-specific-bubble: rgba(44, 44, 46, 0.40) !important;
  --dsw-specific-menu: rgba(35, 35, 36, 0.97) !important;
  --dsw-alias-bg-overlay: rgba(44, 44, 46, 0.97) !important;
  --dsw-alias-brand-primary: #6d9ed0 !important;
  --dsw-alias-state-business-primary: #4a8fd6 !important;
  --dsw-static-deepseek-400: #4a8fd6 !important;
  --dsw-static-deepseek-450: #4a8fd6 !important;
  --dsw-static-deepseek-500: #3b6ea8 !important;
}
body[data-ds-dark-theme] [class*="dialog"],
body[data-ds-dark-theme] [class*="Dialog"],
body[data-ds-dark-theme] [class*="modal"],
body[data-ds-dark-theme] [class*="Modal"] {
  background-color: rgba(27, 27, 28, 0.98) !important;
}

/* 设置面板：DSH 用 --dsw-alias-bg-layer-2 做面板背景，而主题把它调成了半透明，
   导致面板后的聊天内容透出、视觉叠加。这里单独把设置面板覆盖为不透明，
   让"设置面板"透明度滑块（--dsw-alias-bg-overlay）真正生效。 */
body[data-ds-dark-theme] .VOzbGW_panel {
  background: var(--dsw-alias-bg-overlay, rgba(44, 44, 46, 0.97)) !important;
}
body[data-ds-dark-theme] .VOzbGW_content,
body[data-ds-dark-theme] .VOzbGW_options {
  background: transparent !important;
}

/* ===== 背景设置 section 内容样式（由 client bundle 的 React 组件渲染） ===== */
.user-theme-root {
  color: var(--dsw-alias-label-primary, #e8f0ec);
  font-family: var(--dsw-font-family);
}
.user-theme-root * {
  font-family: var(--dsw-font-family);
}
.user-theme-root .ut-section {
  margin-bottom: 22px;
}
.user-theme-root h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
}
.user-theme-root .ut-row {
  margin-bottom: 12px;
}
.user-theme-root .ut-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
}
.user-theme-root .ut-value {
  color: var(--dsw-alias-label-primary, #e8f0ec);
}
.user-theme-root input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.user-theme-root input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #4a8fd6;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
}
.user-theme-root input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #4a8fd6;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
}
.user-theme-root .ut-select {
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.05));
  color: var(--dsw-alias-label-primary, #e8f0ec);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  outline: none;
  width: 100%;
}
.user-theme-root .ut-select:focus {
  border-color: #4a8fd6;
}
.user-theme-root .ut-bg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.user-theme-root .ut-bg-thumb {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  transition: border 0.15s ease;
  border: 2px solid rgba(255, 255, 255, 0.08);
}
.user-theme-root .ut-bg-thumb:hover {
  border-color: rgba(255, 255, 255, 0.25);
}
.user-theme-root .ut-bg-thumb-active {
  border-color: #4a8fd6;
}
.user-theme-root .ut-bg-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.user-theme-root .ut-custom-badge {
  margin-top: 10px;
  padding: 10px;
  background: rgba(74, 143, 214, 0.12);
  border: 1px solid rgba(74, 143, 214, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #6d9ed0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-theme-root .ut-btn {
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--dsw-font-family);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.user-theme-root .ut-btn-ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--dsw-alias-label-primary, #e8f0ec);
}
.user-theme-root .ut-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
}
.user-theme-root .ut-upload {
  width: 100%;
  margin-top: 10px;
  border-style: dashed;
}
.user-theme-root .ut-footer {
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
`;

  const assetsScript =
    `<script id="user-theme-assets">window.__USER_THEME_ASSETS__ = { defaultBg: ${JSON.stringify(bgUri)} };</script>`;

  return (
    '<style id="user-theme-base">' + BASE_CSS + "</style>" +
    assetsScript
  );
}

export function apply(ctx) {
  const injection = buildCss();

  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(
      () =>
        httpCtx.webServer.tapIndex((html) => {
          if (/<\/head>/i.test(html)) {
            return html.replace(/<\/head>/i, injection + "</head>");
          }
          return injection + html;
        }),
      "user-theme: custom css + assets"
    );
  });
}

export default apply;
