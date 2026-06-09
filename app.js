/* 美学背诵复习 — 交互逻辑（纯本地，无外部依赖） */
(function () {
"use strict";
var DATA = window.DATA || { chapters: [], quiz: {} };
var LSKEY = "meixue_review_v1";

/* ---------------- 状态 ---------------- */
var state = load();
function load() {
  try {
    var s = JSON.parse(localStorage.getItem(LSKEY) || "{}");
    s.done = s.done || {};   // leafId -> "YYYY-MM-DD"
    s.star = s.star || {};   // nodeId -> 1
    s.quiz = s.quiz || {};   // qid -> "ok"|"bad"
    return s;
  } catch (e) { return { done: {}, star: {}, quiz: {} }; }
}
function save() {
  try { localStorage.setItem(LSKEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------------- 索引 ---------------- */
var nodeMap = {};      // id -> node
var parentMap = {};    // id -> parentId (node or chapter id)
var chapterOf = {};    // id -> chapter id
var allLeaves = [];    // leaf ids in DFS order
var chapterLeaves = {};// cid -> [leaf ids]

(function buildIndex() {
  DATA.chapters.forEach(function (ch) {
    nodeMap[ch.id] = ch;
    chapterLeaves[ch.id] = [];
    (ch.nodes || []).forEach(function (n) { walk(n, ch.id, ch.id); });
  });
  function walk(n, parentId, cid) {
    nodeMap[n.id] = n;
    parentMap[n.id] = parentId;
    chapterOf[n.id] = cid;
    if (n.c && n.c.length) {
      n.c.forEach(function (k) { walk(k, n.id, cid); });
    } else {
      allLeaves.push(n.id);
      chapterLeaves[cid].push(n.id);
    }
  }
})();

function isLeaf(n) { return !n.c || n.c.length === 0; }

/* ---------------- 视图状态 ---------------- */
var openSet = {};         // 展开的章/节点 id
var onlyUnread = false;
var onlyStar = false;
var query = "";
var currentLeaf = null;

/* ---------------- 工具 ---------------- */
function el(tag, cls, txt) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  if (txt != null) d.textContent = txt;
  return d;
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function mwidth(s) { // 视觉宽度(em)
  var w = 0;
  for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) < 128 ? 0.6 : 1;
  return w;
}
function teaser(t) {
  if (t.indexOf("【助记】") === 0) {
    var rest = t.slice(4);
    return "【助记】" + cut(rest, 14);
  }
  return cut(t, 20);
}
function cut(t, n) {
  var stop = -1, marks = "：，。；";
  for (var i = 0; i < t.length && i < n; i++) {
    if (marks.indexOf(t[i]) >= 0) { stop = i; break; }
  }
  if (stop > 4) return t.slice(0, stop);
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/* ---------------- 进度统计 ---------------- */
function doneCount() {
  var n = 0;
  for (var i = 0; i < allLeaves.length; i++) if (state.done[allLeaves[i]]) n++;
  return n;
}
function chapterDone(cid) {
  var arr = chapterLeaves[cid], n = 0;
  for (var i = 0; i < arr.length; i++) if (state.done[arr[i]]) n++;
  return n;
}
function updateProgress() {
  var total = allLeaves.length, done = doneCount();
  var pct = total ? Math.round(done * 1000 / total) / 10 : 0;
  document.getElementById("barfill").style.width = pct + "%";
  document.getElementById("pcttext").textContent = pct + "%";
  // 每日打卡
  var today = todayStr(), todayN = 0, dates = {};
  for (var k in state.done) {
    if (!state.done.hasOwnProperty(k)) continue;
    var dt = state.done[k];
    dates[dt] = 1;
    if (dt === today) todayN++;
  }
  document.getElementById("daily").innerHTML =
    "今日新背 <b>" + todayN + "</b> 条 ｜ 连续打卡 <b>" + streak(dates) +
    "</b> 天 ｜ 已背 <b>" + done + "/" + total + "</b>";
}
function streak(dates) {
  // 从今天或昨天起向前数连续天数
  var d = new Date(), cnt = 0;
  function s(x){return x.getFullYear()+"-"+pad(x.getMonth()+1)+"-"+pad(x.getDate());}
  if (!dates[s(d)]) { d.setDate(d.getDate() - 1); if (!dates[s(d)]) return 0; }
  while (dates[s(d)]) { cnt++; d.setDate(d.getDate() - 1); }
  return cnt;
}

/* ---------------- 渲染 ---------------- */
var app = document.getElementById("app");
function render() {
  app.innerHTML = "";
  if (query) { renderSearch(); updateProgress(); return; }
  var starShow = onlyStar ? computeStarShow() : null;
  var any = false;
  DATA.chapters.forEach(function (ch) {
    var box = el("div", "chapter");
    box.style.setProperty("--cc", ch.color);
    box.style.borderLeftColor = ch.color;
    var open = !!openSet[ch.id];
    // 章头
    var head = el("div", "ch-head");
    head.appendChild(el("span", "twist", open ? "▾" : "▸"));
    head.appendChild(el("span", "ch-title", ch.title));
    head.appendChild(el("span", "ch-count",
      chapterDone(ch.id) + "/" + chapterLeaves[ch.id].length));
    head.onclick = function () { toggle(ch.id); };
    box.appendChild(head);
    if (open) {
      var tree = el("div", "tree");
      var shown = 0;
      (ch.nodes || []).forEach(function (n) {
        var dom = renderNode(n, 1, ch.color, starShow);
        if (dom) { tree.appendChild(dom); shown++; }
      });
      if (!shown) tree.appendChild(el("div", "qstat", "（无符合条件的知识点）"));
      box.appendChild(tree);
      // 练习
      box.appendChild(renderQuiz(ch));
    }
    app.appendChild(box);
    any = true;
  });
  if (!any) app.appendChild(el("div", "empty", "暂无数据"));
  updateProgress();
}

function renderNode(n, level, color, starShow) {
  var leaf = isLeaf(n);
  // 过滤
  if (leaf) {
    if (onlyUnread && state.done[n.id]) return null;
    if (starShow && !starShow[n.id]) return null;
  }
  var childDoms = [];
  if (!leaf) {
    (n.c || []).forEach(function (k) {
      var d = renderNode(k, level + 1, color, starShow);
      if (d) childDoms.push(d);
    });
    if (onlyUnread || starShow) {
      // 无可见子节点且自身不在★显示集 -> 隐藏
      if (childDoms.length === 0 && !(starShow && starShow[n.id])) return null;
    }
  }
  var open = !!openSet[n.id];
  var node = el("div", "node" + (open ? " open" : ""));
  node.setAttribute("data-id", n.id);
  var row = el("div", "row" + (leaf && state.done[n.id] ? " is-done" : ""));
  row.id = "row-" + n.id;

  var tw = el("span", "twist", leaf ? "·" : (open ? "▾" : "▸"));
  row.appendChild(tw);

  var label = el("div", "label");
  var w = mwidth(n.m);
  label.style.setProperty("--ind", w + "em");
  label.style.setProperty("--hang", w + "em");
  label.style.paddingLeft = w + "em";
  label.style.textIndent = "-" + w + "em";
  var mk = el("span", "marker", n.m);
  label.appendChild(mk);
  if (leaf) {
    label.appendChild(el("span", "leaf-title", teaser(n.t)));
    var body = el("div", "leaf-body" + (open ? " show" : ""));
    body.innerHTML = textToHtml(n.t) + (n.tb ? n.tb.join("") : "");
    label.appendChild(body);
    var act1 = function () { toggle(n.id); };
    tw.onclick = act1; mk.onclick = act1;
    label.querySelector(".leaf-title").onclick = act1;
  } else {
    label.appendChild(el("span", "leaf-title", n.t));
    var act2 = function () { toggle(n.id); };
    tw.onclick = act2; label.onclick = act2;
  }
  row.appendChild(label);

  var act = el("div", "act");
  var star = el("span", "star" + (state.star[n.id] ? " on" : ""), "★");
  star.onclick = function (e) {
    e.stopPropagation();
    if (state.star[n.id]) delete state.star[n.id]; else state.star[n.id] = 1;
    save();
    if (onlyStar) render(); else star.className = "star" + (state.star[n.id] ? " on" : "");
  };
  act.appendChild(star);
  if (leaf) {
    var chk = el("span", "chk" + (state.done[n.id] ? " done" : ""),
      state.done[n.id] ? "✓" : "");
    chk.onclick = function (e) { e.stopPropagation(); toggleDone(n.id, chk, row); };
    act.appendChild(chk);
  }
  row.appendChild(act);
  node.appendChild(row);

  if (!leaf && open) {
    var kids = el("div", "kids");
    kids.style.paddingLeft = "1.1em";
    childDoms.forEach(function (d) { kids.appendChild(d); });
    node.appendChild(kids);
  }
  return node;
}

function textToHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function computeStarShow() {
  var show = {};
  for (var id in state.star) {
    if (!state.star.hasOwnProperty(id) || !nodeMap[id]) continue;
    show[id] = 1;
    // 祖先
    var p = parentMap[id];
    while (p) { show[p] = 1; p = parentMap[p]; }
    // 后代
    markDesc(nodeMap[id], show);
  }
  return show;
}
function markDesc(n, show) {
  if (!n.c) return;
  n.c.forEach(function (k) { show[k.id] = 1; markDesc(k, show); });
}

/* ---------------- 搜索 ---------------- */
function renderSearch() {
  var q = query.toLowerCase();
  var hits = allLeaves.filter(function (id) {
    return nodeMap[id].t.toLowerCase().indexOf(q) >= 0;
  });
  var head = el("div", "qstat", "搜索“" + query + "”：命中 " + hits.length + " 条知识点");
  app.appendChild(head);
  hits.forEach(function (id) {
    var n = nodeMap[id], cid = chapterOf[id];
    var box = el("div", "chapter");
    box.style.borderLeftColor = nodeMap[cid].color;
    var row = el("div", "row" + (state.done[id] ? " is-done" : ""));
    row.id = "row-" + id;
    row.appendChild(el("span", "twist", "·"));
    var label = el("div", "label");
    label.appendChild(el("span", "ch-count", nodeMap[cid].title + " "));
    label.appendChild(el("span", "marker", n.m));
    var body = el("div", "leaf-body show");
    body.innerHTML = textToHtml(n.t) + (n.tb ? n.tb.join("") : "");
    label.appendChild(body);
    row.appendChild(label);
    var act = el("div", "act");
    var chk = el("span", "chk" + (state.done[id] ? " done" : ""), state.done[id] ? "✓" : "");
    chk.onclick = function () { toggleDone(id, chk, row); };
    act.appendChild(chk);
    row.appendChild(act);
    box.appendChild(row);
    app.appendChild(box);
  });
  if (!hits.length) app.appendChild(el("div", "empty", "没有匹配的知识点"));
}

/* ---------------- 练习 ---------------- */
var quizFilter = {};   // cid -> type ("全部" or type)
function renderQuiz(ch) {
  var wrap = el("div");
  var qs = DATA.quiz[ch.id] || [];
  var head = el("div", "quiz-head",
    "▶ 巩固练习（" + qs.length + " 题）");
  var panel = el("div", "quiz-panel" + (openSet["quiz-" + ch.id] ? " show" : ""));
  head.onclick = function () {
    openSet["quiz-" + ch.id] = !openSet["quiz-" + ch.id];
    if (openSet["quiz-" + ch.id]) fillQuiz(panel, ch, qs);
    else panel.innerHTML = "";
    panel.className = "quiz-panel" + (openSet["quiz-" + ch.id] ? " show" : "");
  };
  if (openSet["quiz-" + ch.id]) fillQuiz(panel, ch, qs);
  wrap.appendChild(head); wrap.appendChild(panel);
  return wrap;
}
function fillQuiz(panel, ch, qs) {
  panel.innerHTML = "";
  if (!qs.length) { panel.appendChild(el("div", "qstat", "本章暂无题目")); return; }
  var types = ["全部"];
  qs.forEach(function (q) { if (types.indexOf(q.type) < 0) types.push(q.type); });
  var cur = quizFilter[ch.id] || "全部";
  var fbar = el("div", "qfilter");
  types.forEach(function (tp) {
    var b = el("button", cur === tp ? "on" : "", tp);
    b.onclick = function () { quizFilter[ch.id] = tp; fillQuiz(panel, ch, qs); };
    fbar.appendChild(b);
  });
  panel.appendChild(fbar);
  // 统计
  var ok = 0, bad = 0;
  qs.forEach(function (q) {
    if (state.quiz[q.id] === "ok") ok++;
    else if (state.quiz[q.id] === "bad") bad++;
  });
  panel.appendChild(el("div", "qstat",
    "答对 " + ok + " ｜ 答错 " + bad + " ｜ 共 " + qs.length + " 题"));
  // 列表
  qs.filter(function (q) { return cur === "全部" || q.type === cur; })
    .forEach(function (q) { panel.appendChild(qItem(q, panel, ch, qs)); });
}
function qItem(q, panel, ch, qs) {
  var item = el("div", "q-item");
  var qline = el("div", "q-q");
  var badge = el("span", "q-type", q.type);
  qline.appendChild(badge);
  qline.appendChild(document.createTextNode(q.q));
  item.appendChild(qline);
  var ans = el("div", "q-ans");
  ans.textContent = q.a;
  var show = el("button", "", "显示答案");
  var grade = el("div", "q-grade");
  var bOk = el("button", state.quiz[q.id] === "ok" ? "picked-ok" : "", "答对");
  var bBad = el("button", state.quiz[q.id] === "bad" ? "picked-bad" : "", "答错");
  grade.style.display = "none";
  bOk.onclick = function () {
    state.quiz[q.id] = "ok"; save(); fillQuiz(panel, ch, qs);
  };
  bBad.onclick = function () {
    state.quiz[q.id] = "bad"; save(); fillQuiz(panel, ch, qs);
  };
  grade.appendChild(bOk); grade.appendChild(bBad);
  show.onclick = function () {
    var on = ans.classList.toggle("show");
    show.textContent = on ? "隐藏答案" : "显示答案";
    grade.style.display = on ? "flex" : "none";
  };
  item.appendChild(show);
  item.appendChild(ans);
  item.appendChild(grade);
  return item;
}

/* ---------------- 交互动作 ---------------- */
function toggle(id) { openSet[id] = !openSet[id]; render(); }

function toggleDone(id, chk, row) {
  if (state.done[id]) { delete state.done[id]; }
  else { state.done[id] = todayStr(); }
  save();
  if (chk) {
    var on = !!state.done[id];
    chk.className = "chk" + (on ? " done" : "");
    chk.textContent = on ? "✓" : "";
    if (row) row.className = row.className.replace(" is-done", "") + (on ? " is-done" : "");
  }
  updateProgress();
  // 更新所在章计数
  refreshCounts();
}
function refreshCounts() {
  var heads = app.querySelectorAll(".chapter");
  // 简化：重算所有章头计数
  var i = 0;
  DATA.chapters.forEach(function (ch) {
    var c = app.querySelector('.chapter [data-cc]'); // noop placeholder
  });
  // 直接遍历 ch-count 节点按顺序更新
  var counts = app.querySelectorAll(".ch-count");
  // 当未搜索时与章顺序一致
  if (!query) {
    var idx = 0;
    DATA.chapters.forEach(function (ch) {
      if (counts[idx]) {
        counts[idx].textContent = chapterDone(ch.id) + "/" + chapterLeaves[ch.id].length;
        idx++;
      }
    });
  }
}

/* ---------------- 展开控制 ---------------- */
function expandAll() {
  openSet = {};
  DATA.chapters.forEach(function (ch) {
    openSet[ch.id] = 1;
    (ch.nodes || []).forEach(function (n) { openNonLeaf(n); });
  });
  render();
}
function openNonLeaf(n) {
  if (n.c && n.c.length) { openSet[n.id] = 1; n.c.forEach(openNonLeaf); }
}
function collapseAll() { openSet = {}; render(); }
function expandToDepth(N) {
  openSet = {};
  DATA.chapters.forEach(function (ch) {
    openSet[ch.id] = 1;
    (ch.nodes || []).forEach(function (n) { depthOpen(n, 1, N); });
  });
  render();
}
function depthOpen(n, level, N) {
  if (n.c && n.c.length && level < N) {
    openSet[n.id] = 1;
    n.c.forEach(function (k) { depthOpen(k, level + 1, N); });
  }
}

/* ---------------- 导航：逐条 ---------------- */
function navLeaves() {
  if (query) {
    var q = query.toLowerCase();
    return allLeaves.filter(function (id) {
      return nodeMap[id].t.toLowerCase().indexOf(q) >= 0;
    });
  }
  return allLeaves.filter(function (id) {
    if (onlyUnread && state.done[id]) return false;
    if (onlyStar && !state.star[id]) return false;
    return true;
  });
}
function gotoLeaf(id) {
  currentLeaf = id;
  if (!query) {
    // 展开章 + 所有祖先 + 叶
    var cid = chapterOf[id];
    openSet[cid] = 1;
    var p = parentMap[id];
    while (p) { openSet[p] = 1; p = parentMap[p]; }
    openSet[id] = 1;
    render();
  }
  var row = document.getElementById("row-" + id);
  if (row) {
    row.scrollIntoView(true);
    var h = document.querySelector("header").offsetHeight + 6;
    window.scrollBy(0, -h);
    flash(row);
  }
}
function flash(row) {
  row.style.outline = "2px solid #1f5fbf";
  setTimeout(function () { row.style.outline = ""; }, 1200);
}
function step(dir) {
  var list = navLeaves();
  if (!list.length) return;
  var i = list.indexOf(currentLeaf);
  var ni = i < 0 ? (dir > 0 ? 0 : list.length - 1) : i + dir;
  if (ni < 0) ni = 0;
  if (ni >= list.length) ni = list.length - 1;
  gotoLeaf(list[ni]);
}
function doneAndNext() {
  if (currentLeaf == null) {
    var list0 = navLeaves();
    if (list0.length) currentLeaf = list0[0]; else return;
  }
  // 记录当前在过滤列表的位置（标记后若只看未背会移除当前项）
  var before = navLeaves();
  var idx = before.indexOf(currentLeaf);
  if (!state.done[currentLeaf]) { state.done[currentLeaf] = todayStr(); save(); }
  render();
  updateProgress();
  var after = navLeaves();
  var nextId;
  if (onlyUnread) {
    // 当前已被移除，原位置即下一条
    nextId = after[idx] || after[after.length - 1] || null;
  } else {
    var j = after.indexOf(currentLeaf);
    nextId = after[j + 1] || null;
  }
  if (nextId) gotoLeaf(nextId);
  else if (currentLeaf) gotoLeaf(currentLeaf);
}

/* ---------------- 导出/导入/清空 ---------------- */
function exportCode() {
  var code = b64encode(JSON.stringify(state));
  window.prompt("复制以下进度码，在新设备“导入进度”里粘贴：", code);
}
function importCode() {
  var code = window.prompt("粘贴进度码：", "");
  if (!code) return;
  try {
    var obj = JSON.parse(b64decode(code.trim()));
    state.done = obj.done || {};
    state.star = obj.star || {};
    state.quiz = obj.quiz || {};
    save(); render();
    alert("导入成功");
  } catch (e) { alert("进度码无效"); }
}
function clearAll() {
  if (!window.confirm("确定清空全部进度（已背/加星/练习记录）？此操作不可撤销")) return;
  state = { done: {}, star: {}, quiz: {} };
  save(); render();
}
function b64encode(s) {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s) {
  return decodeURIComponent(escape(atob(s)));
}

/* ---------------- 绑定 ---------------- */
function bind() {
  document.getElementById("title").textContent =
    (DATA.course || "美学") + " · 背诵复习";
  document.title = (DATA.course || "美学") + " · 背诵复习";
  var s = document.getElementById("search");
  s.oninput = function () { query = s.value.trim(); currentLeaf = null; render(); };
  document.getElementById("expandAll").onclick = expandAll;
  document.getElementById("collapseAll").onclick = collapseAll;
  document.getElementById("depth").onchange = function () {
    expandToDepth(parseInt(this.value, 10));
  };
  var bu = document.getElementById("onlyUnread");
  bu.onclick = function () { onlyUnread = !onlyUnread; bu.className = onlyUnread ? "on" : ""; render(); };
  var bs = document.getElementById("onlyStar");
  bs.onclick = function () { onlyStar = !onlyStar; bs.className = onlyStar ? "on" : ""; render(); };
  document.getElementById("btnExport").onclick = exportCode;
  document.getElementById("btnImport").onclick = importCode;
  document.getElementById("btnClear").onclick = clearAll;
  document.getElementById("navTop").onclick = function () { window.scrollTo(0, 0); };
  document.getElementById("navPrev").onclick = function () { step(-1); };
  document.getElementById("navNext").onclick = function () { step(1); };
  document.getElementById("navDoneNext").onclick = doneAndNext;
}

/* ---------------- 启动 ---------------- */
bind();
render();           // 默认只显示章
window.__MX = {     // 供测试调用
  state: state, render: render, toggle: toggle, gotoLeaf: gotoLeaf,
  step: step, doneAndNext: doneAndNext, navLeaves: navLeaves,
  expandAll: expandAll, collapseAll: collapseAll,
  expandToDepth: expandToDepth, allLeaves: allLeaves,
  nodeMap: nodeMap, openSet: function () { return openSet; },
  setQuery: function (q) { query = q; render(); },
  setOnlyUnread: function (v) { onlyUnread = v; render(); },
  exportCode: exportCode, importCode: importCode
};
})();
