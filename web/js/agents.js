// ═══════════════════════════════════════════════════════════════
// AGENTS.JS — Вкладка "Агенты" DressCode Dashboard
// Карточки агентов из agents-config.json
// Для изменения агентов — редактировать только JSON, не этот файл
// ═══════════════════════════════════════════════════════════════

var agentsConfig = null;

function loadAgentsConfig(cb) {
  if (agentsConfig) { cb(agentsConfig); return; }
  fetch('agents-config.json?v=1')
    .then(function(r) { return r.json(); })
    .then(function(data) { agentsConfig = data; cb(data); })
    .catch(function() { cb(null); });
}

function getStatusInfo(status) {
  switch (status) {
    case 'active':  return { dot: 'ag-dot-green',  label: 'Работает' };
    case 'ready':   return { dot: 'ag-dot-blue',   label: 'Готов' };
    case 'waiting': return { dot: 'ag-dot-yellow',  label: 'Ждёт' };
    case 'frozen':  return { dot: 'ag-dot-gray',   label: 'Заморожен' };
    case 'error':   return { dot: 'ag-dot-red',    label: 'Ошибка' };
    default:        return { dot: 'ag-dot-gray',   label: status || '—' };
  }
}

function renderAgentsTab() {
  var el = document.getElementById('agentsContent');
  if (!el) return;

  loadAgentsConfig(function(config) {
    if (!config || !config.groups) {
      el.innerHTML = '<div class="pay-empty"><div style="font-size:40px;margin-bottom:12px;">&#x1F916;</div>' +
        '<div style="font-size:14px;font-weight:600;">Не удалось загрузить конфигурацию агентов</div></div>';
      return;
    }

    var html = '';

    // Summary
    var totalAgents = 0, activeCount = 0, readyCount = 0;
    config.groups.forEach(function(g) {
      g.agents.forEach(function(a) {
        totalAgents++;
        if (a.status === 'active') activeCount++;
        if (a.status === 'ready') readyCount++;
      });
    });

    html += '<div class="ag-summary">' +
      '<div class="ag-summary-item"><span class="ag-summary-num">' + totalAgents + '</span><span class="ag-summary-label">Всего</span></div>' +
      '<div class="ag-summary-item"><span class="ag-summary-num ag-num-green">' + activeCount + '</span><span class="ag-summary-label">Работают</span></div>' +
      '<div class="ag-summary-item"><span class="ag-summary-num ag-num-blue">' + readyCount + '</span><span class="ag-summary-label">Готовы</span></div>' +
    '</div>';

    // Groups
    config.groups.forEach(function(group) {
      html += '<div class="ag-group-header">' +
        '<span class="ag-group-icon">' + group.icon + '</span>' +
        '<span class="ag-group-name">' + group.name + '</span>' +
        '<span class="ag-group-count">' + group.agents.length + '</span>' +
      '</div>';

      group.agents.forEach(function(agent) {
        var si = getStatusInfo(agent.status);
        var radarHtml = '';
        if (agent.radar) {
          var radars = agent.radar.split(',');
          radars.forEach(function(r) {
            radarHtml += '<span class="ag-radar-badge">' + r.trim() + '</span>';
          });
        }

        html += '<div class="ag-card' + (agent.status === 'frozen' ? ' ag-card-frozen' : '') + '">' +
          '<div class="ag-card-top">' +
            '<div class="ag-card-left">' +
              '<div class="ag-card-name">' + agent.name + '</div>' +
              '<div class="ag-card-sub">' + agent.subtitle + '</div>' +
            '</div>' +
            '<div class="ag-status"><span class="ag-dot ' + si.dot + '"></span>' + si.label + '</div>' +
          '</div>' +
          '<div class="ag-card-desc">' + agent.description + '</div>' +
          (radarHtml ? '<div class="ag-radars">' + radarHtml + '</div>' : '') +
          (agent.action ? '<div class="ag-card-action"><button class="ag-action-btn" onclick="agentAction(\'' + agent.id + '\')">' + agent.action + '</button></div>' : '') +
        '</div>';
      });
    });

    el.innerHTML = html;
  });
}

function agentAction(agentId) {
  var btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Отправляю...';

  var url = typeof APPS_SCRIPT_URL !== 'undefined' ? APPS_SCRIPT_URL :
    'https://script.google.com/macros/s/AKfycbxfN2eYhdWamLmTuR6I4unWFpNA4iOD5QxzaKWASZmW6G8El_FWk3vOi1wE7x4AUNasVA/exec';

  fetch(url + '?action=queueAgent', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ agent: agentId })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) {
      btn.textContent = 'В очереди ✓';
      btn.classList.add('ag-btn-queued');
      showToast('Агент ' + agentId + ' добавлен в очередь');
    } else {
      btn.textContent = 'Ошибка';
      btn.disabled = false;
      showToast('Ошибка: ' + (data.error || 'неизвестная'));
    }
  })
  .catch(function(err) {
    btn.textContent = 'Ошибка сети';
    setTimeout(function() {
      btn.disabled = false;
      btn.textContent = 'Запустить радар';
    }, 3000);
  });
}
