// 规则处理层：只负责规则内容的校验与变更计算，不接触 DOM 和本地存档。
(function () {
  const RULE_SECTIONS = [
    { key: "forgets", title: "容易忘的规则" },
    { key: "disputes", title: "常见争议" },
    { key: "setup", title: "开局准备" },
    { key: "scoring", title: "计分提醒" }
  ];
  const RULE_KEYS = RULE_SECTIONS.map((section) => section.key);

  // 取一份独立的规则快照，后续修改不会污染历史版本。
  function snapshot(source) {
    return Object.fromEntries(RULE_KEYS.map((key) => [key, [...(source[key] || [])]]));
  }

  function restoreSnapshot(game, rules) {
    RULE_KEYS.forEach((key) => {
      game[key] = [...(rules[key] || [])];
    });
  }

  function getAllRules(game) {
    return RULE_KEYS.flatMap((key) => game[key] || []);
  }

  function countAllRules(games) {
    return games.reduce((total, game) => total + getAllRules(game).length, 0);
  }

  // 修订人、修订原因缺一不可。
  function validateMeta(editor, reason) {
    if (!String(editor || "").trim()) return "请填写修订人";
    if (!String(reason || "").trim()) return "请填写修订原因";
    return "";
  }

  // 校验一次新增 / 移除 / 改正草稿是否可执行。
  function validateDraft(rules, draft) {
    if (!RULE_KEYS.includes(draft.key)) return "规则分类无效";
    if (draft.action === "add") {
      if (!String(draft.text || "").trim()) return "规则内容不能为空";
      return "";
    }
    if (draft.action === "correct" || draft.action === "remove") {
      const list = rules[draft.key] || [];
      if (!Number.isInteger(draft.index) || draft.index < 0 || draft.index >= list.length) {
        return "要修订的规则不存在或已被改动，请刷新后重试";
      }
      if (draft.action === "correct" && !String(draft.text || "").trim()) {
        return "改正后的规则内容不能为空";
      }
      return "";
    }
    return "不支持的修订类型";
  }

  // 在快照上计算新规则，原对象保持不变。
  function applyDraft(rules, draft) {
    const next = snapshot(rules);
    const list = next[draft.key];
    if (draft.action === "add") {
      list.push(draft.text.trim());
    } else if (draft.action === "correct") {
      list[draft.index] = draft.text.trim();
    } else if (draft.action === "remove") {
      list.splice(draft.index, 1);
    }
    return next;
  }

  // 整次修订入口：修订信息或规则草稿任一不通过都返回 error，规则内容维持原样。
  function planRevision(game, draft, editor, reason) {
    const metaError = validateMeta(editor, reason);
    if (metaError) return { error: metaError };

    const current = snapshot(game);
    const draftError = validateDraft(current, draft);
    if (draftError) return { error: draftError };

    return {
      rules: applyDraft(current, draft),
      editor: String(editor).trim(),
      reason: String(reason).trim()
    };
  }

  window.RuleLogic = {
    RULE_SECTIONS,
    RULE_KEYS,
    snapshot,
    restoreSnapshot,
    getAllRules,
    countAllRules,
    validateMeta,
    planRevision
  };
})();
