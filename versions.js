// 版本存储层：负责版本历史、本地存档读写和旧数据迁移，不接触 DOM。
(function () {
  const storageKey = "zfl18-boardgame-rule-cards";

  function nowText() {
    return new Date().toISOString();
  }

  // 版本只记录规则内容；game 元信息（人数、时长等）不属于规则修订范围。
  function buildVersion(game, number, entry) {
    return {
      id: crypto.randomUUID(),
      number,
      action: entry.action,
      editor: entry.editor || "",
      reason: entry.reason || "",
      createdAt: entry.createdAt || nowText(),
      ruleKey: entry.ruleKey || "",
      ruleIndex: entry.ruleIndex ?? null,
      rules: RuleLogic.snapshot(entry.rules || game)
    };
  }

  function initHistory(game, number, entry) {
    game.versions = [buildVersion(game, number, entry)];
    return game.versions[0];
  }

  function seedGames() {
    return [
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
    ];
  }

  function defaultState() {
    const games = seedGames();
    games.forEach((game) =>
      initHistory(game, 1, { action: "create", reason: "创建桌游并录入初始规则" })
    );
    return { selectedId: games[0]?.id || "", lastEditor: "", games };
  }

  // 旧版本存档没有版本历史，按当前规则补一条初始版本，历史规则不丢。
  function migrateGame(game, index) {
    RuleLogic.RULE_KEYS.forEach((key) => {
      if (!Array.isArray(game[key])) game[key] = [];
    });
    if (!Array.isArray(game.versions) || game.versions.length === 0) {
      initHistory(game, 1, {
        action: "create",
        reason: "本地存档升级，补录规则初始版本",
        createdAt: nowText()
      });
    } else {
      game.versions.forEach((version) => {
        version.rules = RuleLogic.snapshot(version.rules || game);
      });
    }
    return game;
  }

  function loadState() {
    const saved = localStorage.getItem(storageKey);
    let base;
    try {
      base = saved ? JSON.parse(saved) : null;
    } catch {
      base = null;
    }
    if (!base || !Array.isArray(base.games)) return defaultState();

    base.games = base.games.map(migrateGame);
    if (!base.games.some((game) => game.id === base.selectedId)) {
      base.selectedId = base.games[0]?.id || "";
    }
    if (typeof base.lastEditor !== "string") base.lastEditor = "";
    return base;
  }

  function saveState(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function getVersions(game) {
    return [...(game.versions || [])].sort((a, b) => b.number - a.number);
  }

  function currentVersion(game) {
    if (!game.versions || game.versions.length === 0) return null;
    return game.versions.reduce((latest, version) =>
      version.number > latest.number ? version : latest
    );
  }

  // 新增 / 移除 / 改正成功后追加新版本；校验失败由 RuleLogic 提前拦截，这里兜底不写入。
  function commitRuleRevision(game, draft, editor, reason) {
    const planned = RuleLogic.planRevision(game, draft, editor, reason);
    if (planned.error) return planned;

    const number = currentVersion(game).number + 1;
    const version = buildVersion(game, number, {
      action: draft.action,
      editor: planned.editor,
      reason: planned.reason,
      rules: planned.rules,
      ruleKey: draft.key,
      ruleIndex: draft.index ?? null
    });
    game.versions.push(version);
    RuleLogic.restoreSnapshot(game, planned.rules);
    return { version };
  }

  // 回滚只恢复指定版本的规则内容，并生成新的回滚版本，目标旧版本继续保留。
  function rollbackToVersion(game, targetNumber, editor, reason) {
    const metaError = RuleLogic.validateMeta(editor, reason);
    if (metaError) return { error: metaError };

    const target = (game.versions || []).find((version) => version.number === targetNumber);
    if (!target) return { error: "要回滚的版本不存在" };

    const current = currentVersion(game);
    if (current && current.number === target.number) {
      return { error: "该版本就是当前版本，无需回滚" };
    }

    const number = current.number + 1;
    const version = buildVersion(game, number, {
      action: "rollback",
      editor: String(editor).trim(),
      reason: String(reason).trim(),
      rules: target.rules
    });
    game.versions.push(version);
    RuleLogic.restoreSnapshot(game, target.rules);
    return { version };
  }

  window.RuleVersions = {
    loadState,
    saveState,
    defaultState,
    initHistory,
    getVersions,
    currentVersion,
    commitRuleRevision,
    rollbackToVersion
  };
})();
