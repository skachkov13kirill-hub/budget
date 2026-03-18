// ═══════════════════════════════════════════════════════════════
// TASKS.JS — Вкладка "Задачи" DressCode Dashboard
// Дерево задач + Недельный календарь с синхронизацией через API
// ═══════════════════════════════════════════════════════════════

// ── CONFIG ──
var TASKS_COLORS = ['#5B4FE8','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316'];
var TASKS_DAY_CFG = [
  {name:'Пн',full:'Понедельник',group:'kb'},
  {name:'Вт',full:'Вторник',group:'my'},
  {name:'Ср',full:'Среда',group:'my'},
  {name:'Чт',full:'Четверг',group:'kb'},
  {name:'Пт',full:'Пятница',group:'family'},
  {name:'Сб',full:'Суббота',group:'family'},
  {name:'Вс',full:'Воскресенье',group:'plan'}
];
var TASKS_GROUP_LABELS = {kb:'КБ',my:'Мои',family:'Семья',plan:'План'};
var TASKS_HOURS_TARGET = 5;

// ── STATE ──
var tasksView = 'calendar';
var tasksWeekStart = tasksGetMonday(new Date());
var tasksSelDay = tasksTodayIdx();
var tasksAddParentId = null;
var tasksDB = tasksLoad();
var tasksApiLoading = false;

// ── HELPERS ──
function tasksGetMonday(d) {
  d = new Date(d);
  var day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function tasksTodayIdx() {
  var d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}
function tasksWeekKey() {
  return tasksWeekStart.toISOString().slice(0, 10);
}
function tasksUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function tasksDateStr(dayIdx) {
  var d = new Date(tasksWeekStart);
  d.setDate(d.getDate() + dayIdx);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── STORAGE ──
function tasksLoad() {
  try {
    var d = JSON.parse(localStorage.getItem('planner_v4') || 'null');
    if (d && d.tree) return d;
  } catch (e) {}
  return {
    tree: [
      {id:'kb',name:'Кирилл Богатырёв',color:'#5B4FE8',collapsed:false,children:[
        {id:'nedviga',name:'Недвижимость',color:'#5B4FE8',collapsed:true,children:[]},
        {id:'vesenniy',name:'Весенний проект',color:'#5B4FE8',collapsed:true,children:[]},
        {id:'razrabotka_kb',name:'Разработка (КБ)',color:'#5B4FE8',collapsed:true,children:[]},
        {id:'marketing',name:'Маркетинг',color:'#5B4FE8',collapsed:true,children:[]}
      ]},
      {id:'my',name:'Мои дела',color:'#10B981',collapsed:false,children:[
        {id:'health',name:'Здоровье',color:'#10B981',collapsed:true,children:[]},
        {id:'atelier',name:'Ателье',color:'#10B981',collapsed:true,children:[]},
        {id:'razrabotka_my',name:'Разработка (моя)',color:'#10B981',collapsed:true,children:[]}
      ]},
      {id:'family',name:'Семья',color:'#EC4899',collapsed:false,children:[
        {id:'family_time',name:'Время с семьёй',color:'#EC4899',collapsed:true,children:[]},
        {id:'family_plans',name:'Семейные дела',color:'#EC4899',collapsed:true,children:[]}
      ]},
      {id:'plan_root',name:'Планирование',color:'#F59E0B',collapsed:false,children:[
        {id:'week_review',name:'Обзор недели',color:'#F59E0B',collapsed:true,children:[]},
        {id:'next_week',name:'План на неделю',color:'#F59E0B',collapsed:true,children:[]}
      ]}
    ],
    schedule: {}
  };
}

function tasksSave() {
  localStorage.setItem('planner_v4', JSON.stringify(tasksDB));
}

function tasksGetSchedule(dayIdx) {
  var k = tasksWeekKey();
  if (!tasksDB.schedule[k]) tasksDB.schedule[k] = {};
  if (!tasksDB.schedule[k][dayIdx]) tasksDB.schedule[k][dayIdx] = [];
  return tasksDB.schedule[k][dayIdx];
}

// ── TREE HELPERS ──
function tasksFindNode(id, nodes) {
  nodes = nodes || tasksDB.tree;
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes[i];
    if (nodes[i].children) {
      var f = tasksFindNode(id, nodes[i].children);
      if (f) return f;
    }
  }
  return null;
}

function tasksIsLeaf(node) {
  return !node.children || node.children.length === 0;
}

function tasksGetAllLeaves(nodes) {
  nodes = nodes || tasksDB.tree;
  var leaves = [];
  for (var i = 0; i < nodes.length; i++) {
    if (tasksIsLeaf(nodes[i])) leaves.push(nodes[i]);
    else if (nodes[i].children) leaves = leaves.concat(tasksGetAllLeaves(nodes[i].children));
  }
  return leaves;
}

function tasksGetPath(id, nodes, path) {
  nodes = nodes || tasksDB.tree;
  path = path || [];
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return path.concat([nodes[i].name]);
    if (nodes[i].children) {
      var r = tasksGetPath(id, nodes[i].children, path.concat([nodes[i].name]));
      if (r) return r;
    }
  }
  return null;
}

function tasksCountLeaves(node) {
  if (tasksIsLeaf(node)) return 0;
  return tasksGetAllLeaves(node.children).length;
}

// ── API SYNC ──
function tasksLoadFromAPI() {
  if (tasksApiLoading) return;
  tasksApiLoading = true;
  var weekDate = tasksWeekKey();
  fetchWithTimeout(API_ATELIE + '?action=getScheduleWeek&weekStart=' + weekDate, 15000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      tasksApiLoading = false;
      if (data && data.success !== false && data.slots) {
        tasksApplyAPISlots(data.slots);
        tasksRenderAll();
      }
    })
    .catch(function() { tasksApiLoading = false; });
}

function tasksApplyAPISlots(slots) {
  var k = tasksWeekKey();
  if (!tasksDB.schedule[k]) tasksDB.schedule[k] = {};
  // Merge API slots into local schedule by day
  slots.forEach(function(slot) {
    if (!slot.date) return;
    var slotDate = new Date(slot.date);
    var dayIdx = Math.round((slotDate - tasksWeekStart) / 86400000);
    if (dayIdx < 0 || dayIdx > 6) return;
    if (!tasksDB.schedule[k][dayIdx]) tasksDB.schedule[k][dayIdx] = [];
    // Skip if already exists (by name + startTime)
    var exists = tasksDB.schedule[k][dayIdx].some(function(s) {
      return s.name === slot.name && s.startTime === slot.startTime;
    });
    if (!exists) {
      tasksDB.schedule[k][dayIdx].push({
        name: slot.name || '',
        category: slot.category || '',
        startTime: slot.startTime || '',
        endTime: slot.endTime || '',
        duration: parseInt(slot.duration) || 60,
        done: slot.done === true || slot.done === 'true',
        color: '#5B4FE8',
        apiRow: slot.row,
        source: 'api'
      });
    }
  });
  tasksSave();
}

function tasksAddSlotToAPI(dayIdx, slot) {
  var date = tasksDateStr(dayIdx);
  var body = JSON.stringify({
    action: 'addScheduleSlot',
    date: date,
    name: slot.name,
    startTime: slot.startTime || '',
    endTime: slot.endTime || '',
    duration: slot.duration || 60,
    category: slot.category || '',
    source: 'dashboard'
  });
  fetch(API_ATELIE, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: body,
    mode: 'no-cors'
  }).catch(function() {});
}

function tasksUpdateSlotAPI(row, action, field, value) {
  if (!row) return;
  var body = JSON.stringify({
    action: action,
    row: row,
    field: field || '',
    value: value || ''
  });
  fetch(API_ATELIE, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: body,
    mode: 'no-cors'
  }).catch(function() {});
}

// ── BRANCH NOTEPAD HELPERS ──
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── BRANCH NOTEPAD CONFIG ──
var BRANCH_NOTEPAD_ITEMS = [
  {id:'М16', name:'М16 · Мурино 16', icon:'🏠'},
  {id:'В8', name:'В8 · Воронцовская 8', icon:'🏠'},
  {id:'П14', name:'П14 · Петровская 14', icon:'🏠'},
  {id:'А6', name:'А6 · Арсенальная 6', icon:'🏠'},
  {id:'Г4', name:'Г4 · Гражданская 4', icon:'🏠'},
  {id:'В22', name:'В22 · Воронцовская 22', icon:'🏠'},
  {id:'Ек8', name:'Ек8 · Екатерининская 8', icon:'🏠'},
  {id:'В20', name:'В20 · Воронцовская 20', icon:'🏠'},
  {id:'Ек17', name:'Ек17 · Екатерининская 17', icon:'🏠'},
  {id:'Г11', name:'Г11 · Гражданская 11', icon:'🏠'},
  {id:'ХЧ', name:'Химчистка', icon:'🧹'},
  {id:'other', name:'Остальные задачи', icon:'📋'}
];
var tasksBranchExpanded = {};
var tasksBranchAddTarget = null;
var tasksBranchSyncStatus = 'idle'; // idle | loading | synced | offline

// ── STORAGE: localStorage cache + API sync ──
function tasksBranchLoad() {
  try {
    var d = JSON.parse(localStorage.getItem('branch_notepad_v2') || 'null');
    if (d) return d;
  } catch(e) {}
  // Fallback: try old v1 format
  try {
    var old = JSON.parse(localStorage.getItem('branch_notepad_v1') || 'null');
    if (old) return old;
  } catch(e) {}
  var empty = {};
  BRANCH_NOTEPAD_ITEMS.forEach(function(b) { empty[b.id] = []; });
  return empty;
}
var tasksBranchDB = tasksBranchLoad();

function tasksBranchSave() {
  localStorage.setItem('branch_notepad_v2', JSON.stringify(tasksBranchDB));
}

// Build tree from flat server data
function tasksBranchBuildTree(flatNotes) {
  var db = {};
  BRANCH_NOTEPAD_ITEMS.forEach(function(b) { db[b.id] = []; });

  // Separate parents and children
  var byId = {};
  var parents = [];
  var children = [];

  flatNotes.forEach(function(n) {
    byId[n.id] = {id: n.id, text: n.text, done: n.done, created: n.created, parent_id: n.parent_id || '', children: [], sort_order: n.sort_order || 0};
    if (n.parent_id) {
      children.push(n);
    } else {
      parents.push(n);
    }
  });

  // Attach children to parents
  children.forEach(function(c) {
    if (byId[c.parent_id]) {
      byId[c.parent_id].children.push(byId[c.id]);
    }
  });

  // Sort children by sort_order
  Object.keys(byId).forEach(function(id) {
    byId[id].children.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  });

  // Group parents by branch
  parents.forEach(function(p) {
    if (db[p.branch]) {
      db[p.branch].push(byId[p.id]);
    }
  });

  // Sort each branch by sort_order
  BRANCH_NOTEPAD_ITEMS.forEach(function(b) {
    db[b.id].sort(function(a, b2) { return (a.sort_order || 0) - (b2.sort_order || 0); });
  });

  return db;
}

// Fetch all notes from server
function tasksBranchLoadFromAPI() {
  tasksBranchSyncStatus = 'loading';
  tasksBranchRenderSyncBadge();

  fetchWithTimeout(API_ATELIE + '?action=getBranchNotes', 15000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.success && data.data) {
        tasksBranchDB = tasksBranchBuildTree(data.data);
        tasksBranchSave();
        tasksBranchSyncStatus = 'synced';

        // Mark migration done if old v1 data existed
        if (localStorage.getItem('branch_notepad_v1') && !localStorage.getItem('branch_notepad_migrated')) {
          tasksBranchMigrate();
        } else {
          tasksBranchRenderSyncBadge();
          if (tasksView === 'branch') tasksRenderBranch();
        }
      }
    })
    .catch(function() {
      tasksBranchSyncStatus = 'offline';
      tasksBranchRenderSyncBadge();
    });
}

// Migrate old localStorage data to server
function tasksBranchMigrate() {
  try {
    var old = JSON.parse(localStorage.getItem('branch_notepad_v1') || '{}');
    var tasks = [];
    Object.keys(old).forEach(function(branch) {
      (old[branch] || []).forEach(function(t) {
        if (t.text) tasks.push({branch: branch, text: t.text, done: t.done || false});
      });
    });
    if (tasks.length === 0) {
      localStorage.setItem('branch_notepad_migrated', 'true');
      return;
    }
    // Upload tasks one by one (simple approach)
    var uploaded = 0;
    tasks.forEach(function(t) {
      fetch(API_ATELIE + '?action=addBranchNote', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({branch: t.branch, text: t.text}),
        mode: 'no-cors'
      }).then(function() {
        uploaded++;
        if (uploaded === tasks.length) {
          localStorage.setItem('branch_notepad_migrated', 'true');
          showToast(tasks.length + ' задач перенесено в облако');
          // Reload from server to get IDs
          setTimeout(function() { tasksBranchLoadFromAPI(); }, 2000);
        }
      }).catch(function() {});
    });
  } catch(e) {
    localStorage.setItem('branch_notepad_migrated', 'true');
  }
}

// API helper for mutations
function tasksBranchAPI(action, data, onSuccess, onError) {
  fetchWithTimeout(API_ATELIE + '?action=' + action, 15000, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res && res.success) {
      if (onSuccess) onSuccess(res);
    } else {
      if (onError) onError(res);
    }
  })
  .catch(function(err) {
    if (onError) onError(err);
  });
}

function tasksBranchRenderSyncBadge() {
  var el = document.getElementById('branchSyncBadge');
  if (!el) return;
  if (tasksBranchSyncStatus === 'loading') el.textContent = '⟳';
  else if (tasksBranchSyncStatus === 'synced') el.textContent = '☁️';
  else if (tasksBranchSyncStatus === 'offline') el.textContent = '⚠️';
  else el.textContent = '';
}

// ── VIEW SWITCH ──
function tasksSetView(v) {
  tasksView = v;
  document.getElementById('tasksPanelCal').classList.toggle('active', v === 'calendar');
  document.getElementById('tasksPanelTree').classList.toggle('active', v === 'tree');
  document.getElementById('tasksPanelBranch').classList.toggle('active', v === 'branch');
  document.getElementById('btnViewCal').classList.toggle('active', v === 'calendar');
  document.getElementById('btnViewTree').classList.toggle('active', v === 'tree');
  document.getElementById('btnViewBranch').classList.toggle('active', v === 'branch');
  tasksRenderAll();
}

// ── WEEK NAVIGATION ──
function tasksChangeWeek(delta) {
  tasksWeekStart.setDate(tasksWeekStart.getDate() + delta * 7);
  tasksLoadFromAPI();
  tasksRenderAll();
}

// ── RENDER ALL ──
function tasksRenderAll() {
  tasksRenderWeekLabel();
  tasksRenderStats();
  if (tasksView === 'calendar') {
    tasksRenderDayTabs();
    tasksRenderDayContent();
  } else if (tasksView === 'tree') {
    tasksRenderTree();
  } else if (tasksView === 'branch') {
    tasksRenderBranch();
  }
}

// ── WEEK LABEL ──
function tasksRenderWeekLabel() {
  var end = new Date(tasksWeekStart);
  end.setDate(end.getDate() + 6);
  var el = document.getElementById('tasksWeekLabel');
  if (el) {
    el.textContent = tasksWeekStart.getDate() + ' ' + MONTH_NAMES_SHORT[tasksWeekStart.getMonth() + 1] +
      ' \u2014 ' + end.getDate() + ' ' + MONTH_NAMES_SHORT[end.getMonth() + 1];
  }
}

// ── STATS ──
function tasksRenderStats() {
  var total = 0, done = 0, totalMin = 0;
  for (var i = 0; i < 7; i++) {
    var s = tasksGetSchedule(i);
    total += s.length;
    for (var j = 0; j < s.length; j++) {
      if (s[j].done) done++;
      totalMin += (s[j].duration || 0);
    }
  }
  var pct = total ? Math.round(done / total * 100) : 0;
  var el = document.getElementById('tasksStats');
  if (!el) return;
  el.innerHTML =
    '<div class="tasks-stat">' +
      '<div class="tasks-stat-value" style="color:' + (pct > 70 ? 'var(--green)' : pct > 30 ? 'var(--orange)' : 'var(--red)') + '">' + pct + '%</div>' +
      '<div class="tasks-stat-label">' + done + '/' + total + '</div>' +
    '</div>' +
    '<div class="tasks-stat">' +
      '<div class="tasks-stat-value" style="color:var(--primary)">' + (totalMin / 60).toFixed(1) + 'ч</div>' +
      '<div class="tasks-stat-label">из ' + (TASKS_HOURS_TARGET * 7) + 'ч</div>' +
    '</div>' +
    '<div class="tasks-stat">' +
      '<div class="tasks-stat-value">' + tasksGetAllLeaves().length + '</div>' +
      '<div class="tasks-stat-label">в дереве</div>' +
    '</div>';
}

// ── DAY TABS ──
function tasksRenderDayTabs() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var el = document.getElementById('tasksDayTabs');
  if (!el) return;
  var html = '';
  for (var i = 0; i < 7; i++) {
    var cfg = TASKS_DAY_CFG[i];
    var date = new Date(tasksWeekStart);
    date.setDate(date.getDate() + i);
    var isToday = date.getTime() === today.getTime();
    var sched = tasksGetSchedule(i);
    var mins = 0;
    for (var j = 0; j < sched.length; j++) mins += (sched[j].duration || 0);
    html += '<div class="tasks-day-tab' + (i === tasksSelDay ? ' active' : '') + (isToday ? ' today' : '') + '" onclick="tasksSelDay=' + i + ';tasksRenderDayTabs();tasksRenderDayContent()">' +
      '<div class="tasks-dt-name">' + cfg.name + '</div>' +
      '<div class="tasks-dt-date">' + date.getDate() + '</div>' +
      '<div class="tasks-dt-group tasks-group-' + cfg.group + '">' + TASKS_GROUP_LABELS[cfg.group] + '</div>' +
      (sched.length ? '<div class="tasks-dt-hours">' + (mins / 60).toFixed(1) + 'ч</div>' : '') +
    '</div>';
  }
  el.innerHTML = html;
}

// ── DAY CONTENT ──
function tasksRenderDayContent() {
  var el = document.getElementById('tasksDayContent');
  if (!el) return;
  var cfg = TASKS_DAY_CFG[tasksSelDay];
  var sched = tasksGetSchedule(tasksSelDay);
  var totalMin = 0;
  for (var j = 0; j < sched.length; j++) totalMin += (sched[j].duration || 0);

  var html = '<div class="tasks-day-info">' +
    '<span class="tasks-day-title">' + cfg.full + '</span>' +
    '<span class="tasks-day-hours" style="color:' + (totalMin > TASKS_HOURS_TARGET * 60 ? 'var(--red)' : 'var(--primary)') + '">' +
      (totalMin / 60).toFixed(1) + 'ч / ' + TASKS_HOURS_TARGET + 'ч' +
    '</span>' +
  '</div>';

  if (!sched.length) {
    html += '<div class="tasks-empty">' +
      '<div style="font-size:36px;margin-bottom:8px;">&#x1F4ED;</div>' +
      '<div style="font-size:13px;">Нет задач на этот день</div>' +
      '<div style="font-size:11px;color:var(--text-3);margin-top:4px;">Нажмите + чтобы добавить</div>' +
    '</div>';
  } else {
    // Sort by start time
    var sorted = sched.slice().sort(function(a, b) {
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
    html += '<div class="tasks-slot-list">';
    sorted.forEach(function(slot) {
      var ri = sched.indexOf(slot);
      html += '<div class="tasks-slot' + (slot.done ? ' tasks-slot-done' : '') + '">' +
        '<div class="tasks-slot-check' + (slot.done ? ' done' : '') + '" onclick="tasksToggleSlot(' + ri + ')"></div>' +
        '<div class="tasks-slot-body">' +
          '<div class="tasks-slot-name">' + slot.name + '</div>' +
          '<div class="tasks-slot-meta">' +
            (slot.category ? slot.category + ' \u00b7 ' : '') +
            (slot.duration || 60) + ' мин' +
            (slot.path ? ' \u00b7 ' + slot.path : '') +
          '</div>' +
        '</div>' +
        (slot.startTime ? '<div class="tasks-slot-time">' + slot.startTime + (slot.endTime ? '\u2013' + slot.endTime : '') + '</div>' : '') +
        '<div class="tasks-slot-remove" onclick="tasksRemoveSlot(' + ri + ')">\u2715</div>' +
      '</div>';
    });
    html += '</div>';
  }

  if (totalMin > TASKS_HOURS_TARGET * 60) {
    html += '<div class="tasks-overload">&#x26A0;&#xFE0F; Перегрузка! Запланировано больше ' + TASKS_HOURS_TARGET + ' часов</div>';
  }

  el.innerHTML = html;
}

// ── SLOT ACTIONS ──
function tasksToggleSlot(idx) {
  var sched = tasksGetSchedule(tasksSelDay);
  if (!sched[idx]) return;
  sched[idx].done = !sched[idx].done;
  tasksSave();
  if (sched[idx].apiRow) {
    tasksUpdateSlotAPI(sched[idx].apiRow, sched[idx].done ? 'done' : 'undone');
  }
  tasksRenderDayContent();
  tasksRenderStats();
}

function tasksRemoveSlot(idx) {
  var sched = tasksGetSchedule(tasksSelDay);
  if (!sched[idx]) return;
  if (sched[idx].apiRow) {
    tasksUpdateSlotAPI(sched[idx].apiRow, 'delete');
  }
  sched.splice(idx, 1);
  tasksSave();
  tasksRenderAll();
}

// ── ADD SLOT MODAL ──
function tasksOpenAddSlot() {
  document.getElementById('tasksSlotName').value = '';
  document.getElementById('tasksSlotCategory').value = '';
  var sched = tasksGetSchedule(tasksSelDay);
  var lastEnd = sched.length ? sched[sched.length - 1].endTime : '10:00';
  document.getElementById('tasksSlotStart').value = lastEnd || '10:00';
  var parts = (lastEnd || '10:00').split(':').map(Number);
  var endM = parts[0] * 60 + parts[1] + 60;
  document.getElementById('tasksSlotEnd').value = String(Math.floor(endM / 60)).padStart(2, '0') + ':' + String(endM % 60).padStart(2, '0');
  document.getElementById('tasksAddSlotModal').style.display = 'flex';
  setTimeout(function() { document.getElementById('tasksSlotName').focus(); }, 100);
}

function tasksSaveSlot() {
  var name = document.getElementById('tasksSlotName').value.trim();
  if (!name) return;
  var category = document.getElementById('tasksSlotCategory').value;
  var startTime = document.getElementById('tasksSlotStart').value;
  var endTime = document.getElementById('tasksSlotEnd').value;
  var startParts = startTime.split(':').map(Number);
  var endParts = endTime.split(':').map(Number);
  var duration = (endParts[0] * 60 + endParts[1]) - (startParts[0] * 60 + startParts[1]);
  if (duration <= 0) duration = 60;

  var slot = {
    name: name,
    category: category,
    startTime: startTime,
    endTime: endTime,
    duration: duration,
    done: false,
    color: '#5B4FE8'
  };

  var sched = tasksGetSchedule(tasksSelDay);
  sched.push(slot);
  tasksSave();
  tasksAddSlotToAPI(tasksSelDay, slot);
  tasksCloseModal('tasksAddSlotModal');
  tasksRenderAll();
  showToast('Задача добавлена');
}

// ── TREE RENDERING ──
function tasksRenderTree() {
  var el = document.getElementById('tasksTreeView');
  if (!el) return;
  el.innerHTML = tasksRenderNodes(tasksDB.tree, 0);
}

function tasksRenderNodes(nodes, depth) {
  var html = '';
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var leaf = tasksIsLeaf(n);
    var leafCount = leaf ? 0 : tasksCountLeaves(n);
    var toggleIcon = leaf ? '\u00b7' : (n.collapsed ? '\u25B6' : '\u25BC');

    html += '<div class="tasks-tree-node tasks-depth-' + Math.min(depth, 3) + '">' +
      '<div class="tasks-tn-row">' +
        '<span class="tasks-tn-toggle' + (leaf ? ' leaf' : '') + '" onclick="tasksToggleCollapse(\'' + n.id + '\')">' + toggleIcon + '</span>' +
        '<span class="tasks-tn-dot" style="background:' + (n.color || 'var(--text-3)') + '"></span>' +
        '<span class="tasks-tn-name' + (leaf ? ' is-leaf' : '') + '">' + n.name + '</span>' +
        (!leaf ? '<span class="tasks-tn-meta">' + n.children.length + ' \u00b7 ' + leafCount + ' задач</span>' : '') +
        '<span class="tasks-tn-actions">' +
          '<button class="tasks-tn-act" onclick="tasksOpenAddNode(\'' + n.id + '\')">+</button>' +
          (leaf ? '<button class="tasks-tn-act tasks-tn-sched" onclick="tasksScheduleLeaf(\'' + n.id + '\')">&#x1F4C5;</button>' : '') +
          '<button class="tasks-tn-act tasks-tn-del" onclick="tasksDeleteNode(\'' + n.id + '\')">\u2715</button>' +
        '</span>' +
      '</div>' +
      (!leaf && !n.collapsed ? '<div class="tasks-tree-children" style="border-color:' + (n.color || '#eee') + '30">' + tasksRenderNodes(n.children, depth + 1) + '</div>' : '') +
    '</div>';
  }
  return html;
}

// ── TREE ACTIONS ──
function tasksToggleCollapse(id) {
  var n = tasksFindNode(id);
  if (n) { n.collapsed = !n.collapsed; tasksSave(); tasksRenderTree(); }
}

function tasksDeleteNode(id) {
  function removeFrom(nodes) {
    return nodes.filter(function(n) {
      if (n.id === id) return false;
      if (n.children) n.children = removeFrom(n.children);
      return true;
    });
  }
  tasksDB.tree = removeFrom(tasksDB.tree);
  tasksSave();
  tasksRenderAll();
}

function tasksOpenAddNode(parentId) {
  tasksAddParentId = parentId;
  var title = parentId ? 'Добавить в \u00ab' + (tasksFindNode(parentId) || {}).name + '\u00bb' : 'Новый блок';
  document.getElementById('tasksAddNodeTitle').textContent = title;
  document.getElementById('tasksNodeName').value = '';
  var parent = parentId ? tasksFindNode(parentId) : null;
  var defColor = parent ? parent.color : '#5B4FE8';
  var picker = document.getElementById('tasksColorPicker');
  picker.innerHTML = TASKS_COLORS.map(function(c) {
    return '<div class="tasks-color-dot' + (c === defColor ? ' active' : '') + '" style="background:' + c + '" onclick="tasksPickColor(this,\'' + c + '\')"></div>';
  }).join('');
  picker.dataset.color = defColor;
  document.getElementById('tasksAddNodeModal').style.display = 'flex';
  setTimeout(function() { document.getElementById('tasksNodeName').focus(); }, 100);
}

function tasksPickColor(el, c) {
  document.getElementById('tasksColorPicker').dataset.color = c;
  var dots = el.parentElement.querySelectorAll('.tasks-color-dot');
  for (var i = 0; i < dots.length; i++) dots[i].classList.remove('active');
  el.classList.add('active');
}

function tasksSaveNode() {
  var name = document.getElementById('tasksNodeName').value.trim();
  if (!name) return;
  var color = document.getElementById('tasksColorPicker').dataset.color || '#5B4FE8';
  var node = {id: tasksUid(), name: name, color: color, collapsed: false, children: []};
  if (tasksAddParentId) {
    var parent = tasksFindNode(tasksAddParentId);
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }
  } else {
    tasksDB.tree.push(node);
  }
  tasksSave();
  tasksCloseModal('tasksAddNodeModal');
  tasksRenderAll();
  showToast('Добавлено');
}

// Schedule a leaf from tree to current day
function tasksScheduleLeaf(leafId) {
  var node = tasksFindNode(leafId);
  if (!node) return;
  var path = tasksGetPath(leafId);
  var pathStr = path ? path.join(' \u2192 ') : '';
  var sched = tasksGetSchedule(tasksSelDay);
  var lastEnd = sched.length ? sched[sched.length - 1].endTime : '10:00';
  var dur = node.duration || 60;
  var parts = (lastEnd || '10:00').split(':').map(Number);
  var endM = parts[0] * 60 + parts[1] + dur;

  var slot = {
    leafId: leafId,
    name: node.name,
    path: pathStr,
    duration: dur,
    startTime: lastEnd || '10:00',
    endTime: String(Math.floor(endM / 60)).padStart(2, '0') + ':' + String(endM % 60).padStart(2, '0'),
    done: false,
    color: node.color || '#5B4FE8'
  };

  sched.push(slot);
  tasksSave();
  tasksAddSlotToAPI(tasksSelDay, slot);
  tasksSetView('calendar');
  tasksRenderAll();
  showToast(node.name + ' \u2192 ' + TASKS_DAY_CFG[tasksSelDay].full);
}

// ── BRANCH NOTEPAD RENDERING ──
var tasksBranchSubExpanded = {}; // track which tasks have subtasks expanded

function tasksRenderBranch() {
  var el = document.getElementById('tasksBranchView');
  if (!el) return;

  var totalTasks = 0;
  BRANCH_NOTEPAD_ITEMS.forEach(function(b) {
    totalTasks += (tasksBranchDB[b.id] || []).length;
  });

  var html = '<div class="branch-notepad-header">' +
    '<span class="branch-notepad-title">Блокнот по филиалам <span id="branchSyncBadge" class="branch-sync-badge">' +
      (tasksBranchSyncStatus === 'synced' ? '☁️' : tasksBranchSyncStatus === 'loading' ? '⟳' : tasksBranchSyncStatus === 'offline' ? '⚠️' : '') +
    '</span></span>' +
    '<span class="branch-notepad-count">' + totalTasks + ' задач</span>' +
  '</div>';

  BRANCH_NOTEPAD_ITEMS.forEach(function(b) {
    var tasks = tasksBranchDB[b.id] || [];
    var expanded = tasksBranchExpanded[b.id] || false;
    var doneCount = tasks.filter(function(t) { return t.done; }).length;

    html += '<div class="branch-card' + (expanded ? ' expanded' : '') + '">' +
      '<div class="branch-card-header" onclick="tasksBranchToggle(\'' + b.id + '\')">' +
        '<span class="branch-card-icon">' + b.icon + '</span>' +
        '<span class="branch-card-name">' + b.name + '</span>' +
        '<span class="branch-card-badge">' + tasks.length + '</span>' +
        (doneCount ? '<span class="branch-card-done-badge">' + doneCount + ' ✓</span>' : '') +
        '<span class="branch-card-arrow">' + (expanded ? '▼' : '▶') + '</span>' +
      '</div>';

    if (expanded) {
      html += '<div class="branch-card-body">';
      if (tasks.length) {
        tasks.forEach(function(t) {
          var hasChildren = t.children && t.children.length > 0;
          var childDone = hasChildren ? t.children.filter(function(c) { return c.done; }).length : 0;
          var subExpanded = tasksBranchSubExpanded[t.id] || false;

          html += '<div class="branch-task' + (t.done ? ' branch-task-done' : '') + '">' +
            '<div class="branch-task-check' + (t.done ? ' done' : '') + '" onclick="tasksBranchToggleTask(\'' + b.id + '\',\'' + t.id + '\',false,\'\')"></div>' +
            '<div class="branch-task-text">' + escHtml(t.text) +
              (hasChildren ? '<span class="branch-task-progress">(' + childDone + '/' + t.children.length + ')</span>' : '') +
            '</div>' +
            '<div class="branch-task-actions">' +
              '<button class="branch-task-expand' + (hasChildren || subExpanded ? '' : ' subtle') + '" onclick="tasksBranchToggleSub(\'' + t.id + '\')" title="Подзадачи">' + (subExpanded ? '▼' : '▶') + '</button>' +
              '<button class="branch-task-to-cal" onclick="tasksBranchToCal(\'' + b.id + '\',\'' + t.id + '\')" title="На календарь">📅</button>' +
              '<button class="branch-task-del" onclick="tasksBranchDeleteTask(\'' + b.id + '\',\'' + t.id + '\')">✕</button>' +
            '</div>' +
          '</div>';

          // Subtask list
          if (subExpanded) {
            html += '<div class="branch-subtask-list">';
            if (hasChildren) {
              t.children.forEach(function(c) {
                html += '<div class="branch-subtask' + (c.done ? ' branch-subtask-done' : '') + '">' +
                  '<div class="branch-task-check small' + (c.done ? ' done' : '') + '" onclick="tasksBranchToggleTask(\'' + b.id + '\',\'' + c.id + '\',true,\'' + t.id + '\')"></div>' +
                  '<div class="branch-task-text">' + escHtml(c.text) + '</div>' +
                  '<button class="branch-subtask-del" onclick="tasksBranchDeleteSubtask(\'' + b.id + '\',\'' + t.id + '\',\'' + c.id + '\')">✕</button>' +
                '</div>';
              });
            }
            html += '<div class="branch-subtask-add-row">' +
              '<input type="text" class="branch-subtask-input" id="branchSubInput_' + t.id + '" placeholder="+ Добавить шаг..." onkeydown="if(event.key===\'Enter\')tasksBranchQuickAdd(\'' + b.id + '\',\'' + t.id + '\')" />' +
            '</div>';
            html += '</div>';
          }
        });
      } else {
        html += '<div class="branch-empty">Нет задач</div>';
      }
      html += '<div class="branch-add-row">' +
        '<input type="text" class="branch-add-input" id="branchInput_' + b.id + '" placeholder="Добавить задачу..." onkeydown="if(event.key===\'Enter\')tasksBranchQuickAdd(\'' + b.id + '\')" />' +
        '<button class="branch-add-btn" onclick="tasksBranchQuickAdd(\'' + b.id + '\')">+</button>' +
      '</div>';
      html += '</div>';
    }
    html += '</div>';
  });

  el.innerHTML = html;
}

function tasksBranchToggleSub(taskId) {
  tasksBranchSubExpanded[taskId] = !tasksBranchSubExpanded[taskId];
  tasksRenderBranch();
}

function tasksBranchDeleteSubtask(branchId, parentId, childId) {
  var parent = tasksBranchFindById(branchId, parentId);
  if (!parent || !parent.children) return;
  parent.children = parent.children.filter(function(c) { return c.id !== childId; });
  tasksBranchSave();
  tasksRenderBranch();
  tasksBranchAPI('deleteBranchNote', {id: childId}, null,
    function() { showToast('Ошибка удаления'); }
  );
}

function tasksBranchToggle(branchId) {
  tasksBranchExpanded[branchId] = !tasksBranchExpanded[branchId];
  tasksRenderBranch();
}

function tasksBranchQuickAdd(branchId, parentId) {
  var inputId = parentId ? 'branchSubInput_' + parentId : 'branchInput_' + branchId;
  var input = document.getElementById(inputId);
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;

  // Optimistic local update
  var tempId = 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  var newTask = {id: tempId, text: text, done: false, created: new Date().toISOString(), parent_id: parentId || '', children: [], sort_order: 999};

  if (parentId) {
    // Add as subtask
    var parent = tasksBranchFindById(branchId, parentId);
    if (parent) {
      newTask.sort_order = parent.children.length;
      parent.children.push(newTask);
    }
  } else {
    if (!tasksBranchDB[branchId]) tasksBranchDB[branchId] = [];
    newTask.sort_order = tasksBranchDB[branchId].length;
    tasksBranchDB[branchId].push(newTask);
  }
  tasksBranchSave();
  input.value = '';
  tasksRenderBranch();
  setTimeout(function() {
    var el = document.getElementById(inputId);
    if (el) el.focus();
  }, 50);

  // Sync to server
  tasksBranchAPI('addBranchNote', {branch: branchId, text: text, parent_id: parentId || ''},
    function(res) {
      // Replace temp ID with server ID
      var task = tasksBranchFindById(branchId, tempId);
      if (task && res.id) task.id = res.id;
      tasksBranchSave();
    },
    function() { showToast('Ошибка сохранения'); }
  );
}

// Find task by id in branch (including in children)
function tasksBranchFindById(branchId, taskId) {
  var tasks = tasksBranchDB[branchId] || [];
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === taskId) return tasks[i];
    for (var j = 0; j < (tasks[i].children || []).length; j++) {
      if (tasks[i].children[j].id === taskId) return tasks[i].children[j];
    }
  }
  return null;
}

function tasksBranchToggleTask(branchId, taskId, isSubtask, parentId) {
  var task;
  if (isSubtask && parentId) {
    var parent = tasksBranchFindById(branchId, parentId);
    if (parent) task = parent.children.filter(function(c) { return c.id === taskId; })[0];
  } else {
    task = tasksBranchFindById(branchId, taskId);
  }
  if (!task) return;

  task.done = !task.done;
  tasksBranchSave();
  tasksRenderBranch();

  // Sync to server
  tasksBranchAPI('updateBranchNote', {id: taskId, done: task.done}, null,
    function() { showToast('Ошибка синхронизации'); }
  );

  // If toggling subtask: check if all siblings done → offer to complete parent
  if (isSubtask && parentId && task.done) {
    var par = tasksBranchFindById(branchId, parentId);
    if (par && par.children.length > 0) {
      var allDone = par.children.every(function(c) { return c.done; });
      if (allDone && !par.done) {
        showToast('Все шаги выполнены!', function() {
          par.done = true;
          tasksBranchSave();
          tasksRenderBranch();
          tasksBranchAPI('updateBranchNote', {id: parentId, done: true});
        }, 'Отметить задачу ✓');
      }
    }
  }

  // If toggling parent done: mark all children done
  if (!isSubtask && task.done && task.children && task.children.length > 0) {
    task.children.forEach(function(c) {
      if (!c.done) {
        c.done = true;
        tasksBranchAPI('updateBranchNote', {id: c.id, done: true});
      }
    });
    tasksBranchSave();
    tasksRenderBranch();
  }
}

function tasksBranchDeleteTask(branchId, taskId) {
  var tasks = tasksBranchDB[branchId];
  if (!tasks) return;
  var idx = -1;
  for (var i = 0; i < tasks.length; i++) { if (tasks[i].id === taskId) { idx = i; break; } }
  if (idx === -1) return;
  tasks.splice(idx, 1);
  tasksBranchSave();
  tasksRenderBranch();

  // Sync to server (also deletes children)
  tasksBranchAPI('deleteBranchNote', {id: taskId}, null,
    function() { showToast('Ошибка удаления'); }
  );
}

function tasksBranchToCal(branchId, taskId) {
  var task = tasksBranchFindById(branchId, taskId);
  if (!task) return;
  var branchName = '';
  BRANCH_NOTEPAD_ITEMS.forEach(function(b) { if (b.id === branchId) branchName = b.name; });

  // Add to current selected day in calendar
  var sched = tasksGetSchedule(tasksSelDay);
  var lastEnd = sched.length ? sched[sched.length - 1].endTime : '10:00';
  var parts = (lastEnd || '10:00').split(':').map(Number);
  var endM = parts[0] * 60 + parts[1] + 60;

  sched.push({
    name: task.text,
    category: branchName,
    startTime: lastEnd || '10:00',
    endTime: String(Math.floor(endM / 60)).padStart(2, '0') + ':' + String(endM % 60).padStart(2, '0'),
    duration: 60,
    done: false,
    color: '#5B4FE8',
    fromBranch: branchId
  });
  tasksSave();
  tasksAddSlotToAPI(tasksSelDay, sched[sched.length - 1]);

  // Mark as done in branch notepad
  task.done = true;
  tasksBranchSave();
  tasksBranchAPI('updateBranchNote', {id: taskId, done: true});

  tasksSetView('calendar');
  showToast(task.text + ' → ' + TASKS_DAY_CFG[tasksSelDay].full);
}

function tasksBranchOpenAdd(branchId) {
  tasksBranchAddTarget = branchId;
  var branchName = '';
  BRANCH_NOTEPAD_ITEMS.forEach(function(b) { if (b.id === branchId) branchName = b.name; });
  document.getElementById('tasksBranchAddTitle').textContent = 'Добавить в «' + branchName + '»';
  document.getElementById('tasksBranchTaskText').value = '';
  document.getElementById('tasksBranchAddModal').style.display = 'flex';
  setTimeout(function() { document.getElementById('tasksBranchTaskText').focus(); }, 100);
}

function tasksBranchSaveTask() {
  var text = document.getElementById('tasksBranchTaskText').value.trim();
  if (!text || !tasksBranchAddTarget) return;
  if (!tasksBranchDB[tasksBranchAddTarget]) tasksBranchDB[tasksBranchAddTarget] = [];
  var tempId = 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  var newTask = {id: tempId, text: text, done: false, created: new Date().toISOString(), parent_id: '', children: [], sort_order: tasksBranchDB[tasksBranchAddTarget].length};
  tasksBranchDB[tasksBranchAddTarget].push(newTask);
  tasksBranchSave();
  tasksCloseModal('tasksBranchAddModal');
  tasksRenderBranch();
  showToast('Задача добавлена');

  // Sync to server
  tasksBranchAPI('addBranchNote', {branch: tasksBranchAddTarget, text: text},
    function(res) {
      var task = tasksBranchFindById(tasksBranchAddTarget, tempId);
      if (task && res.id) task.id = res.id;
      tasksBranchSave();
    },
    function() { showToast('Ошибка сохранения'); }
  );
}

// ── MODAL HELPERS ──
function tasksCloseModal(id) {
  document.getElementById(id).style.display = 'none';
}

// ── INIT ──
(function tasksInit() {
  tasksRenderAll();
  tasksLoadFromAPI();
  tasksBranchLoadFromAPI();
})();
