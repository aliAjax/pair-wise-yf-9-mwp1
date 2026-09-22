// 版本存储：本地存档读写、规则版本追加、查看与回滚。
// 每个桌游的版本只增不删；回滚只恢复规则内容，并另生成一个回滚版本。
(function () {
  "use strict";

  const storageKey = "zfl18-boardgame-rule-cards";
  const RULE_KEYS = RuleService.RULE_KEYS;

  const defaultState = {
    selectedId: "",
    games: [
      {
        id: crypto.randomUUID(),
        name: "奥尔良",
        minPlayers: 2,
        maxPlayers: 4,
        duration: 90,
        complexity: "中",
        lastPlayed: "2025-11-20",
        cover: "",
        forgets: ["商站建造前先确认道路或水路连接", "袋中随从抽完后不是重洗弃堆，而是从已回袋内容继续抽"],
        disputes: ["事件顺序和玩家动作结算先后", "科技板是否能替代所有同类随从"],
        setup: ["按人数放置货物板块", "每位玩家拿起始随从、商人和个人板"],
        scoring: ["货物分数", "商站和市民乘区块", "金币和建筑剩余加分"]
      },
      {
        id: crypto.randomUUID(),
        name: "盖亚计划",
        minPlayers: 1,
        maxPlayers: 4,
        duration: 150,
        complexity: "重",
        lastPlayed: "2025-08-02",
        cover: "",
        forgets: ["联邦连接时卫星数量和能量消耗要一起核对", "研究升到顶必须拿对应科技板限制"],
        disputes: ["被动充能是否能拒绝", "星球改造费用受哪些能力影响"],
        setup: ["随机终局计分板和回合得分板", "按种族设置起始资源和母星"],
        scoring: ["终局计分板", "科技轨排名", "联邦和建筑分"]
      },
      {
        id: crypto.randomUUID(),
        name: "花砖物语",
        minPlayers: 2,
        maxPlayers: 4,
        duration: 45,
        complexity: "轻",
        lastPlayed: "2026-03-15",
        cover: "",
        forgets: ["每轮结束先铺墙再补工厂展示区", "地板线扣分后清空对应砖"],
        disputes: ["同色砖放置限制是否看整面墙", "中央区起始玩家标记是否必须拿"],
        setup: ["按人数放工厂圆盘", "每个圆盘补4块砖"],
        scoring: ["横竖相邻即时分", "完整行列和颜色终局加分"]
      }
    ]
  };

  let state = loadState();

  function now() {
    return new Date().toISOString();
  }

  function nextVersion(game) {
    return game.versions.length + 1;
  }

  // 为还没有版本记录的桌游（含初次安装与旧存档）补录初始版本。
  function seedVersions(game, editor, reason) {
    if (!Array.isArray(game.versions) || game.versions.length === 0) {
      game.versions = [
        {
          version: 1,
          action: "init",
          editor,
          reason,
          timestamp: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          detail: null,
          rules: RuleService.snapshot(game)
        }
      ];
    }
  }

  function normalizeGame(game) {
    RULE_KEYS.forEach((key) => {
      if (!Array.isArray(game[key])) game[key] = [];
    });
    seedVersions(game, "系统迁移", "升级留痕：补录当前规则为初始版本。");
    const latest = game.versions[game.versions.length - 1];
    RuleService.restore(game, latest.rules);
  }

  function loadState() {
    let loaded;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        loaded = JSON.parse(saved);
      } catch {
        loaded = null;
      }
    }
    if (!loaded || !Array.isArray(loaded.games)) {
      const fresh = structuredClone(defaultState);
      fresh.games.forEach((game) =>
        seedVersions(game, "初始录入", "建立收藏时自动生成的初始版本。")
      );
      return fresh;
    }
    loaded.games.forEach(normalizeGame);
    if (typeof loaded.selectedId !== "string") loaded.selectedId = "";
    return loaded;
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function getState() {
    return state;
  }

  function findGame(gameId) {
    return state.games.find((item) => item.id === gameId) || null;
  }

  // 新增/移除/改正：先过规则校验，通过后才追加版本并存档；
  // 被拒绝时不写版本、不改规则。
  function commitRuleChange(gameId, action, params) {
    const game = findGame(gameId);
    if (!game) return { ok: false, error: "桌游不存在。" };

    const result = RuleService.revise(game, action, params);
    if (!result.ok) return result;

    const record = {
      version: nextVersion(game),
      action,
      editor: result.editor,
      reason: result.reason,
      timestamp: now(),
      detail: result.detail,
      rules: RuleService.snapshot(game)
    };
    game.versions.push(record);
    saveState();
    return { ok: true, record };
  }

  // 回滚：复制目标版本的规则内容作为新版本，旧版本全部保留。
  function rollback(gameId, targetVersion, params) {
    const game = findGame(gameId);
    if (!game) return { ok: false, error: "桌游不存在。" };

    const editor = String(params.editor || "").trim();
    const reason = String(params.reason || "").trim();
    if (!editor || !reason) {
      return { ok: false, error: "请同时填写回滚操作人和回滚原因，本次回滚已取消。" };
    }

    const target = game.versions.find((item) => item.version === Number(targetVersion));
    if (!target) return { ok: false, error: "目标版本不存在。" };

    const current = game.versions[game.versions.length - 1];
    if (target.version === current.version) {
      return { ok: false, error: "该版本就是当前版本，无需回滚。" };
    }

    RuleService.restore(game, target.rules);
    const record = {
      version: nextVersion(game),
      action: "rollback",
      editor,
      reason,
      timestamp: now(),
      detail: { action: "rollback", from: current.version, to: target.version },
      rules: RuleService.snapshot(game)
    };
    game.versions.push(record);
    saveState();
    return { ok: true, record };
  }

  function addGame(game) {
    seedVersions(game, "初始录入", "新建收藏时自动生成的初始版本。");
    state.games.unshift(game);
    state.selectedId = game.id;
    saveState();
  }

  function removeGame(gameId) {
    state.games = state.games.filter((item) => item.id !== gameId);
    state.selectedId = state.games[0]?.id || "";
    saveState();
  }

  function markPlayedToday(gameId) {
    const game = findGame(gameId);
    if (!game) return;
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    saveState();
  }

  function setSelected(gameId) {
    state.selectedId = gameId;
  }

  window.RuleStore = {
    loadState,
    saveState,
    getState,
    findGame,
    commitRuleChange,
    rollback,
    addGame,
    removeGame,
    markPlayedToday,
    setSelected
  };
})();
