/**
 * Fairy HDD —— Pi agent 扩展（运行在 agent sidecar 里）。
 *
 * 只做一件事：把会话当前在干什么写成 state.json，给插件进程和浮窗页面读。
 * 档位沿用 pi-pet 已验证的约定（0..5）：
 *   0 thinking / 1 working / 2 result / 3 waiting / 4 success / 5 error
 *
 * 审批另走 cue 通道（与档位分开，避免被状态切换覆盖）：
 *   permission → 确认框弹出；approved / denied → 用户点了允许或拒绝。
 * 判定办法：宿主不把工具审批结果透传给扩展，所以以「确认框关闭后工具是否
 * 紧接着真的开跑」为准——跑起来了算允许，没跑算拒绝。
 *
 * 写盘节流 400ms，避免工具密集调用时反复落盘。
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** 与 main.js 里 pi.plugin.getDataPath() 指向同一处。 */
const DATA_DIR = path.join(os.homedir(), ".pi-desktop", "plugins", "data", "local.fairy-hdd");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const WRITE_INTERVAL_MS = 400;
/** 确认框关闭后等工具开跑的宽限；超过仍没开跑就当用户拒绝了。 */
const APPROVAL_SETTLE_MS = 400;

/** 常驻人格文本：插件开着就注进 system prompt。 */
const PERSONA_FILE = path.join(__dirname, "..", "persona", "fairy.md");
/** 完整台词库，不常驻，交给模型需要时自己读。 */
const PERSONA_VOICE_FILE = path.join(__dirname, "..", "persona", "fairy-voice.md");
/** 读到的常驻人格，进程内只读一次。 */
let personaText = null;

let lastWriteAt = 0;
let pending = null;
let flushTimer = null;
/** 最近一次成功落盘的内容，写 cue 时沿用它的档位。 */
let lastWritten = { status: -1, label: "idle", detail: "", at: 0 };
/** 最近一次一次性提示音，随每次落盘带给页面（页面按 at 去重）。 */
let lastCue = null;
/** 正在等待结果的确认框：{ timer }，timer 为 null 表示还在等 tool_execution_start。 */
let awaitingApproval = null;


/**
 * 取常驻人格文本；文件缺失就当没有，不影响桌宠本身。
 *
 * @returns {string}
 */
function loadPersona() {
  if (personaText !== null) return personaText;
  try {
    personaText = fs.readFileSync(PERSONA_FILE, "utf8").trim();
  } catch {
    personaText = "";
  }
  return personaText;
}
/** 落盘（原子写：先写临时文件再改名）。 */
function writePayload(payload) {
  lastWritten = payload;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ ...payload, cue: lastCue }) + "\n", "utf8");
    fs.renameSync(tmp, STATE_FILE);
  } catch {
    /* 状态写入失败不该影响 agent 本身 */
  }
}

/** 立即落盘（节流窗口已到时调用）。 */
function flush() {
  if (!pending) return;
  const payload = pending;
  pending = null;
  lastWriteAt = Date.now();
  writePayload(payload);
}

/**
 * 记录一次状态。
 *
 * @param {number} status - 档位 0..5。
 * @param {string} label - 档位名，便于人读与排查。
 * @param {string} [detail] - 附加信息（例如工具名）。
 */
function writeState(status, label, detail) {
  pending = { status, label, detail: detail || "", at: Date.now() };
  const wait = WRITE_INTERVAL_MS - (Date.now() - lastWriteAt);
  if (wait <= 0) {
    flush();
    return;
  }
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, wait);
  }
}

/**
 * 记一次一次性提示音，立刻落盘（审批音晚到就没意义了）。
 *
 * @param {"permission"|"approved"|"denied"} name - 声音键，与页面 SOUNDS 对应。
 */
function writeCue(name) {
  lastCue = { name, at: Date.now() };
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const payload = pending ?? lastWritten;
  pending = null;
  lastWriteAt = Date.now();
  writePayload(payload);
}

/**
 * 给当前确认框定一个结果，只认第一次。
 *
 * @param {"approved"|"denied"} name - 结果音。
 * @returns {boolean} 是否真的定下了结果。
 */
function settleApproval(name) {
  if (!awaitingApproval || awaitingApproval.decided) return false;
  awaitingApproval.decided = true;
  if (awaitingApproval.timer !== null) {
    clearTimeout(awaitingApproval.timer);
    awaitingApproval.timer = null;
  }
  writeCue(name);
  return true;
}

/**
 * 扩展入口：宿主调用本函数并注入 pi。
 *
 * @param {object} pi - agent 侧扩展 API。
 */
function fairyHddExtension(pi) {
  // 人格常驻：每次开跑前把人格写进 system prompt 的结构化段落。
  // 插件被禁用后这个 handler 不再注册，语气自动回到默认。
  pi.on("before_agent_start", (event) => {
    const persona = loadPersona();
    if (!persona) return;
    const options = event && event.systemPromptOptions;
    if (!options || !options.sections) return;
    options.sections.fairyPersona = persona + "\n\n需要更多原版台词范例时，读取：" + PERSONA_VOICE_FILE;
  });

  pi.on("agent_start", () => writeState(0, "thinking"));
  pi.on("tool_call", (event) => writeState(1, "working", event && event.toolName));
  pi.on("tool_execution_end", (event) => writeState(2, "result", event && event.toolName));

  // 确认框弹出：kind 为 confirm 的才算「要不要执行」的审批。
  pi.on("ui_prompt_start", (event) => {
    const kind = event && event.kind;
    writeState(3, "waiting", typeof kind === "string" ? kind : "");
    if (kind !== "confirm") return;
    awaitingApproval = { timer: null, decided: false };
    writeCue("permission");
  });

  // 确认框关闭：给工具一点时间开跑，跑不起来就按拒绝处理。
  pi.on("ui_prompt_end", () => {
    if (!awaitingApproval || awaitingApproval.decided || awaitingApproval.timer !== null) return;
    awaitingApproval.timer = setTimeout(() => {
      if (!awaitingApproval) return;
      awaitingApproval.timer = null;
      settleApproval("denied");
      awaitingApproval = null;
    }, APPROVAL_SETTLE_MS);
  });

  // 工具真的开跑了：说明刚才那次确认被放行。
  pi.on("tool_execution_start", () => {
    if (settleApproval("approved")) awaitingApproval = null;
  });

  // 宿主转发 turn_end 时不带 outcome，而且每轮工具往返都会触发；
  // 整轮结束时 agent_end 会带全部 messages，用最后一条 assistant 消息判成败，
  // 与 pi-fairy 的 classifyTerminalOutcome 同一套判定。
  pi.on("agent_end", (event) => {
    awaitingApproval = null;
    const messages = (event && event.messages) || [];
    const last = [...messages].reverse().find((m) => m && m.role === "assistant") || {};
    if (last.stopReason === "error" || last.errorMessage) {
      writeState(5, "error");
      return;
    }
    // 工具往返结束（还要继续跑）不落结果档，避免完成音提前响
    if (last.stopReason === "aborted" || last.stopReason === "toolUse" || last.stopReason === "tool_use") return;
    writeState(4, "success");
  });
}

module.exports = fairyHddExtension;
module.exports.default = fairyHddExtension;
