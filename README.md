# Fairy HDD

PI-Desktop 的 HDD 风格桌宠插件：透明浮窗里住着一只 Fairy（《绝区零》的 AI 管家），
带 10 秒 HDD 开场动画、随会话状态切换的表情与语音播报、一套 HDD 深色主题，
以及 Fairy 说话的人格注入。

| 项 | 值 |
| --- | --- |
| 插件 id | `local.fairy-hdd` |
| 版本 | `0.1.0` |
| 宿主要求 | PI-Desktop `>= 0.14.8` |
| 权限 | `ui.panel`、`agent.extension`、`agent.prompt.inject`、`ui.theme` |

## 功能

- **浮窗桌宠**：240×240 常置顶透明窗口，整窗透明只露出眼睛本体。表情由 Fairy-DSH 的原始
  mascot runtime 矢量绘制（非位图序列帧），三态 `normal` / `thinking` / `comforting`。
- **HDD 开场**：10 秒 Canvas 程序绘制时间线——静态噪声 → 三列数字时钟 → 水平错位滑移 →
  九个错误窗口斜排 → 底部挂载进度 0→100% → 蓝色过曝闪光 → 遮罩淡出露出眼睛。
  无位图、无外部依赖，随欢迎语音一起播放。
- **状态播报**：agent 扩展（`src/extension.js`）把会话当前在干什么写进 `state.json`，
  浮窗轮询后换表情、播语音。
- **审批提示**：确认框弹出时播「要不要执行」的提示音；用户点允许 / 拒绝后分别播对应的电子音。
  宿主不透传审批结果，所以在 `APPROVAL_SETTLE_MS`（400ms）内看工具是否真的开跑来判定。
- **HDD 主题**：通过宿主主题 API 注册 `plugin:local.fairy-hdd:hdd-dark`（base `dark`）：
  炭黑底 + 冷蓝强调 + 输入栏 3px 硬边，只覆盖与宿主默认值不同的 token。
- **Fairy 人格**：每次开跑前把 `persona/fairy.md` 注入 system prompt 的 `fairyPersona` 段落；
  完整台词库 `persona/fairy-voice.md` 不常驻，由模型按需读取。

## 状态对照

档位沿用 `pi-pet` 的约定（`0..5`），由 `src/extension.js` 写在
`~/.pi-desktop/plugins/data/local.fairy-hdd/state.json`：

| 档位 | label | 触发事件 | 表情 | 语音 |
| --- | --- | --- | --- | --- |
| 0 | `thinking` | `agent_start` | thinking | `task_start`（延迟 500ms，期间状态变了就取消） |
| 1 | `working` | `tool_call` | normal | 无 |
| 2 | `result` | `tool_execution_end` | normal | 无 |
| 3 | `waiting` | `ui_prompt_start` | thinking | 无（审批音走 cue 通道） |
| 4 | `success` | `agent_end`，末条 assistant 正常结束 | comforting | `success` |
| 5 | `error` | `agent_end`，末条 assistant 带 `stopReason: "error"` 或 `errorMessage` | comforting | `error` |

`agent_end` 里带 `aborted` / `toolUse` 的回合不落结果档，避免完成音提前响。

审批另走一次性 `cue` 通道（与档位分开，避免被状态切换覆盖）：
`permission`（确认框弹出）、`approved`（工具接着开跑）、`denied`（没开跑）。

语音规则：优先级抢占（3 打断一切、2 打断 1、1 只在不忙时播），同类变体不紧邻重复，
被抢占的声音不续播。

## 命令

| 命令 | id | 作用 |
| --- | --- | --- |
| 桌宠：显示 / 隐藏 | `fairy-hdd.toggle` | 打开或关闭浮窗 |
| 桌宠：重播开场动画 | `fairy-hdd.test-intro` | 写一次开场信号，让浮窗重播 10 秒开场 |
| 主题：应用 HDD 皮肤 | `fairy-hdd.apply-theme` | 重新注册并应用 HDD 主题 |
| 主题：恢复默认 | `fairy-hdd.reset-theme` | 切回宿主内置的 `dark` |

## 设置

| key | 默认 | 作用 |
| --- | --- | --- |
| `voiceEnabled` | `true` | 语音播报总开关 |
| `lowPower` | `false` | 低功耗：压掉高频动效与额外合成层开销 |
| `stateReactions` | `true` | 跟随会话状态换表情（当前版本已在 manifest 声明，代码尚未读取该值） |

## 安装

把本目录整体放到 PI-Desktop 的已安装插件目录下，目录名随意，但根目录必须包含 `manifest.json`：

```
Windows        %USERPROFILE%\.pi-desktop\plugins\installed\fairy-hdd\
macOS / Linux  ~/.pi-desktop/plugins/installed/fairy-hdd/
```

然后重载 PI-Desktop。插件在 `onStartup` 激活，约 1.2 秒后自动拉起浮窗；
若没出现，用命令面板执行「桌宠：显示 / 隐藏」。

依赖宿主提供 widget 形态面板与 `pi.themes` API；缺 `pi.themes` 时只跳过主题注册，
桌宠本身照常工作。

## 数据与隐私

- 只写自己的插件数据目录 `~/.pi-desktop/plugins/data/local.fairy-hdd/`：
  `state.json`（会话档位 + 一次性 cue）、`intro.json`（开场触发信号）。原子写（临时文件 + 改名），
  失败不影响 agent 本身。
- 不访问网络。所有 WAV 随包本地播放。
- 人格文本只进本地模型请求的 system prompt 分段，不外发、不写入别处；插件被禁用后
  handler 不再注册，语气自动回到默认。
- 状态写入节流 400ms，避免工具密集调用时反复落盘。

## 目录结构

```
manifest.json          插件清单（命令、设置、权限、agent 扩展、面板入口）
main.js                宿主半侧：浮窗生命周期、主题注册、面板通道 fairy.state
src/extension.js       agent 半侧：会话事件 → state.json，人格注入
renderer/index.html    浮窗页面
renderer/pet.js        轮询状态、驱动表情与语音、开场调度
renderer/intro.js      HDD 开场 Canvas 时间线
renderer/mascot-bundle.js  Fairy-DSH mascot runtime 的单文件浏览器 bundle
renderer/pet.css       透明窗口与开场遮罩样式
themes/hdd-dark.css    HDD 深色主题 token
persona/fairy.md       常驻人格（注入 system prompt）
persona/fairy-voice.md 完整台词库（按需读取）
assets/sounds/         44 个语音 WAV
assets/icon.png        插件图标
LICENSES/              Apache-2.0 与 fairy-persona MIT 许可全文
NOTICE.md              第三方来源与改编说明
```

## 第三方声明

本插件包含改编自第三方的代码与素材，来源、源提交、改编说明与许可逐项记录在
[NOTICE.md](NOTICE.md)：

- `renderer/mascot-bundle.js` — 改编自 [Fairy-DSH](https://github.com/PC2005-cloud/Fairy-DSH)（Apache-2.0）
- `assets/sounds/*.wav` — 来自 [pi-fairy](https://github.com/ymd-physics/pi-fairy)，代码许可不覆盖音频权利
- `persona/fairy.md`、`persona/fairy-voice.md` — 改编自 fairy-persona-skill（作者 NanYang，MIT）
- `assets/icon.png` — 取自 pi-fairy，美术归属 Fairy-DSH（Apache-2.0）

许可全文见 `LICENSES/Apache-2.0.txt` 与 `LICENSES/fairy-persona-MIT.txt`。

## 免责声明

本项目为个人本地使用的非官方插件，与米哈游 / HoYoverse 无关联，未获其授权或认可。
Fairy 角色、台词与相关商标属米哈游所有；本插件不转授任何角色、商标或合成声音相关权利，
相关素材仅供本地个人使用。请自行确认使用场景的合规性。
