// 规则处理：规则分类、内容快照与新增/移除/改正的业务校验。
// 本文件不碰 localStorage，也不直接操作界面；修订留痕由 store.js 记录。
(function () {
  "use strict";

  const RULE_KEYS = ["forgets", "disputes", "setup", "scoring"];

  const RULE_LABELS = {
    forgets: "容易忘的规则",
    disputes: "常见争议",
    setup: "开局准备",
    scoring: "计分提醒"
  };

  const ACTION_LABELS = {
    init: "初始录入",
    add: "新增",
    remove: "移除",
    correct: "改正",
    rollback: "回滚"
  };

  function snapshot(game) {
    const rules = {};
    RULE_KEYS.forEach((key) => {
      rules[key] = Array.isArray(game[key]) ? game[key].map(String) : [];
    });
    return rules;
  }

  // 只恢复规则内容，游戏名称、人数、封面等信息保持不动。
  function restore(game, rules) {
    RULE_KEYS.forEach((key) => {
      game[key] = Array.isArray(rules && rules[key]) ? rules[key].map(String) : [];
    });
  }

  function allRules(game) {
    return RULE_KEYS.flatMap((key) => (Array.isArray(game[key]) ? game[key] : []));
  }

  // 核心约束：修订人与原因缺任一项，整次拒绝，规则维持原样。
  function revise(game, action, params) {
    const editor = String((params && params.editor) || "").trim();
    const reason = String((params && params.reason) || "").trim();
    const reject = (error) => ({ ok: false, error });

    if (!editor || !reason) {
      return reject("请同时填写修订人和修订原因，本次操作已拒绝，规则保持不变。");
    }

    const key = params && params.key;
    if (!RULE_KEYS.includes(key)) return reject("未知的规则分类。");
    if (!Array.isArray(game[key])) game[key] = [];
    const list = game[key];

    if (action === "add") {
      const text = String(params.text || "").trim();
      if (!text) return reject("规则内容不能为空。");
      list.push(text);
      return { ok: true, editor, reason, detail: { action, key, text } };
    }

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      return reject("目标规则不存在，可能已被其他修订改动，请刷新后重试。");
    }

    if (action === "remove") {
      const [text] = list.splice(index, 1);
      return { ok: true, editor, reason, detail: { action, key, text } };
    }

    if (action === "correct") {
      const text = String(params.text || "").trim();
      if (!text) return reject("改正后的规则内容不能为空。");
      const from = list[index];
      if (text === from) return reject("改正内容与原文完全一致，无需产生修订版本。");
      list[index] = text;
      return { ok: true, editor, reason, detail: { action, key, from, to: text } };
    }

    return reject("不支持的修订类型。");
  }

  window.RuleService = {
    RULE_KEYS,
    RULE_LABELS,
    ACTION_LABELS,
    snapshot,
    restore,
    allRules,
    revise
  };
})();
