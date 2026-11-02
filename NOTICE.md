# 第三方声明

本插件包含从 [Fairy-DSH](https://github.com/PC2005-cloud/Fairy-DSH) 改编的代码与素材。

## Fairy-DSH（Apache-2.0）

- **来源**：`fairy-visual/dsh-fairy-visual/src/client/`，源提交 `d639887a386b0de6fef2e61c97dc268631854591`
- **改编文件**（`renderer/mascot-bundle.js` 由以下 9 个模块打包而成，未改动逻辑语义）：
  - `mascot-runtime.js`
  - `mascot-assets.js`
  - `mascot-style.js`
  - `mascot-eye-svg.js`
  - `mascot-effects-svg.js`
  - `mascot-geometry.js`
  - `mascot-motion-clock.js`
  - `mascot-event-scheduler.js`
  - `dom-observer-manager.js`
- **修改说明**：
  1. 把 CommonJS 模块图打包成单文件浏览器 bundle（只做模块拼装）；
  2. 宿主容器从 DSH 的 `shell.overlay` 改为本插件的浮窗 `#stage`；
  3. 状态来源从 DSH 会话快照改为 Pi 会话事件（`status 0..5`）。
- **许可**：Apache License 2.0，全文见 `LICENSES/Apache-2.0.txt`。

原代码版权归 Fairy-DSH 作者所有，本插件不转授游戏角色、商标或合成声音相关权利。

## 语音素材

`assets/sounds/` 下 44 个 WAV 来自 [pi-fairy](https://github.com/ymd-physics/pi-fairy)
（原仓库 `modules/voice/sounds/`），其来源与哈希见原仓库的 `modules/voice/provenance.json` 与
`docs/AUDIO-PROVENANCE.md`。代码许可不覆盖音频权利。

## 人格设定（MIT）

`persona/fairy.md`、`persona/fairy-voice.md` 改编自 fairy-persona-skill（作者 NanYang），
MIT 许可全文见 `LICENSES/fairy-persona-MIT.txt`。

Fairy 角色、台词与相关商标属米哈游；本插件不转授任何角色权利，这两份文件仅供本地个人使用。

## 图标

`assets/icon.png` 取自 pi-fairy 的 `modules/animation/assets/frames/dark/000.png`，
该美术改编自 [Chengzhibense/Fairy-DSH](https://github.com/Chengzhibense/Fairy-DSH)，适用同一 Apache-2.0 归属。
