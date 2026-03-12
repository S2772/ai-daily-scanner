// AI热点日报 - 前端应用逻辑

const TAG_COLORS = ['blue', 'purple', 'pink', 'green', 'orange', 'red', 'cyan', 'yellow'];
let currentDate = new Date().toISOString().split('T')[0];
let currentDateField = 'published'; // 'published' | 'created'
let allHotspots = [];
let allOpportunities = [];
let customTags = JSON.parse(localStorage.getItem('customTags') || '[]');
let selectedTags = [];
let selectedCategories = [];
let selectedSource = 'all';
let allSourceGroups = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadData();
});

function initializeEventListeners() {
  // 导航
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);
    });
  });

  // 收集数据
  document.getElementById('collect-btn').addEventListener('click', collectData);

  // 日期选择
  document.getElementById('date-input').addEventListener('change', (e) => {
    currentDate = e.target.value;
    loadData();
  });

  // 日志页面
  const logDateInput = document.getElementById('log-date');
  const refreshLogsBtn = document.getElementById('refresh-logs');
  if (logDateInput && refreshLogsBtn) {
    logDateInput.addEventListener('change', loadCollectRuns);
    refreshLogsBtn.addEventListener('click', loadCollectRuns);
  }

  // 设置页面
  const saveBtn = document.getElementById('save-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }

  // 热点页面 - 来源筛选（动态重建时会重复绑定，所以用委托）
  const sourceFilters = document.getElementById('source-filters');
  if (sourceFilters) {
    sourceFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-tag');
      if (!btn) return;
      sourceFilters.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSource = btn.dataset.source;
      renderHotspots();
    });
  }

  // 热点页面 - 排序
  document.getElementById('sort-select').addEventListener('change', renderHotspots);

  // 热点页面 - 搜索
  document.getElementById('hotspots-search').addEventListener('input', renderHotspots);

  // 热点页面 - 导出
  document.getElementById('export-hotspots').addEventListener('click', exportHotspots);

  // 标签管理
  document.getElementById('manage-tags-btn').addEventListener('click', openTagsModal);
  document.getElementById('tags-modal-close').addEventListener('click', closeTagsModal);
  document.getElementById('add-tag-btn').addEventListener('click', addNewTag);
  document.getElementById('new-tag-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewTag();
  });

  // 模态框关闭
  document.getElementById('hotspot-modal-close').addEventListener('click', closeHotspotModal);
  document.getElementById('opportunity-modal-close').addEventListener('click', closeOpportunityModal);
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        e.target.closest('.modal').classList.remove('active');
      }
    });
  });

  // 机会页面
  document.getElementById('add-opportunity').addEventListener('click', openOpportunityModal);
  document.getElementById('opportunities-search').addEventListener('input', renderOpportunities);

  // 总览页面 - 日期口径切换
  document.getElementById('date-field-select').addEventListener('change', (e) => {
    currentDateField = e.target.value === 'created' ? 'created' : 'published';
    loadData();
  });

  // 总览页面 - 日期范围选择
  document.getElementById('date-range-select').addEventListener('change', (e) => {
    const val = e.target.value;
    const customRange = document.getElementById('custom-date-range');
    if (val === 'custom') {
      customRange.style.display = 'flex';
    } else {
      customRange.style.display = 'none';
      const today = new Date();
      if (val === 'today') {
        currentDate = today.toISOString().split('T')[0];
      } else if (val === 'yesterday') {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        currentDate = y.toISOString().split('T')[0];
      }
      // 7days/30days: keep currentDate as today but trend will show range
      loadData();
    }
  });

  document.getElementById('apply-date-range').addEventListener('click', () => {
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    if (start) { currentDate = end || start; loadData(); }
  });
}

function switchPage(page) {
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // 显示选中页面
  document.getElementById(`${page}-page`).classList.add('active');

  // 更新导航
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // 加载页面数据
  if (page === 'hotspots') {
    loadHotspots();
  } else if (page === 'opportunities') {
    loadOpportunities();
  } else if (page === 'logs') {
    loadCollectRuns();
  } else if (page === 'settings') {
    loadSettings();
  }
}

async function loadData() {
  await loadHotspots();
  await loadOpportunities();
  await renderOverview();
}

let trendChart = null;
let categoryChart = null;

async function renderOverview() {
  try {
    // 加载汇总数据
    const dateFieldParam = currentDateField === 'created' ? 'created_at' : 'published_at';
    const [summaryRes, trendRes] = await Promise.all([
      fetch(`/api/summary?date=${currentDate}&date_field=${dateFieldParam}`),
      fetch(`/api/trend?days=30&date_field=${dateFieldParam}`)
    ]);
    const summary = await summaryRes.json();
    const trendData = await trendRes.json();

    // 更新统计卡片
    document.getElementById('total-hotspots').textContent = summary.hotspot_count || 0;
    document.querySelector('#overview-page .stat-label').textContent = (currentDateField === 'created') ? '当日抓取' : '当日发布';
    document.getElementById('total-opportunities').textContent = summary.opportunity_count || 0;
    document.getElementById('total-sources').textContent = trendData.total_sources || 0;

    const avgScore = allHotspots.length > 0
      ? (allHotspots.reduce((s, h) => s + (h.total_score || 0), 0) / allHotspots.length).toFixed(1)
      : '0.0';
    document.getElementById('avg-score').textContent = avgScore;

    // 渲染趋势图
    const trend = trendData.trend || [];
    const trendLabels = trend.map(t => t.date.slice(5));
    const trendCounts = trend.map(t => t.count);

    const trendCtx = document.getElementById('trendCanvas').getContext('2d');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: '热点数量',
          data: trendCounts,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });

    // 渲染分类分布图
    const cats = trendData.categories || [];
    const catCtx = document.getElementById('categoryCanvas').getContext('2d');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => c.category),
        datasets: [{
          data: cats.map(c => c.count),
          backgroundColor: ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'],
          borderWidth: 2,
          borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 12 } } } }
      }
    });

    // 渲染热力图
    renderHeatmap(trend);

    // 渲染最新热点预览
    const latest = allHotspots.slice(0, 6);
    const previewContainer = document.getElementById('latest-hotspots');
    previewContainer.innerHTML = latest.map(h => `
      <div class="hotspot-card" data-id="${h.id}" style="cursor:pointer;" onclick="openHotspotModal(allHotspots.find(x=>x.id==='${h.id}'))">
        <div class="hotspot-title" style="font-size:14px; margin-bottom: var(--space-sm);">${escapeHtml(h.title)}</div>
        <div class="hotspot-meta">
          <div class="hotspot-category">${getCategoryEmoji(h.category)} ${h.category}</div>
          <div class="hotspot-score"><i class="fas fa-star"></i> ${(h.total_score||0).toFixed(1)}</div>
        </div>
        <div class="hotspot-summary">${escapeHtml(h.ai_summary || h.content || '暂无摘要')}</div>
        <div class="hotspot-time" style="font-size:12px; color: var(--color-text-tertiary);">${formatTime(h.created_at)}</div>
      </div>
    `).join('');

  } catch (e) {
    console.error('渲染总览失败:', e);
  }
}

function renderHeatmap(trend) {
  const container = document.getElementById('heatmap');
  if (!trend.length) { container.innerHTML = '<p style="color:var(--color-text-secondary);text-align:center;padding:2rem;">暂无数据</p>'; return; }
  const maxCount = Math.max(...trend.map(t => t.count), 1);
  container.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:4px; padding: var(--space-md);">
      ${trend.map(t => {
        const intensity = t.count / maxCount;
        const alpha = 0.1 + intensity * 0.9;
        return `<div title="${t.date}: ${t.count}条" style="width:28px;height:28px;border-radius:4px;background:rgba(59,130,246,${alpha.toFixed(2)});cursor:default;"></div>`;
      }).join('')}
    </div>
    <div style="padding: 0 var(--space-md) var(--space-sm); font-size:12px; color:var(--color-text-secondary);">
      共 ${trend.length} 天数据，最高单日 ${maxCount} 条
    </div>
  `;
}

async function loadHotspots() {
  try {
    const dateFieldParam = currentDateField === 'created' ? 'created_at' : 'published_at';
    const [hotRes, groupRes] = await Promise.all([
      fetch(`/api/hotspots?date=${currentDate}&date_field=${dateFieldParam}&limit=100&fill_missing=1`),
      fetch(`/api/hotspots-source-groups?date=${currentDate}&date_field=${dateFieldParam}`)
    ]);
    const data = await hotRes.json();
    const groups = await groupRes.json();
    allHotspots = data.hotspots || [];
    allSourceGroups = groups.sources || [];
    renderSourceFilters();
    renderTagFilters();
    renderHotspots();
  } catch (error) {
    console.error('加载热点失败:', error);
  }
}

async function loadOpportunities() {
  try {
    const response = await fetch(`/api/opportunities?date=${currentDate}&limit=50`);
    const data = await response.json();
    allOpportunities = data.opportunities || [];
    renderOpportunities();
  } catch (error) {
    console.error('加载机会失败:', error);
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    const input = document.getElementById('deadline-hour');
    if (input && data && data.ok) {
      input.value = data.daily_deadline_hour;
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
}

async function saveSettings() {
  const input = document.getElementById('deadline-hour');
  const status = document.getElementById('settings-status');
  if (!input) return;
  const hour = parseInt(input.value, 10);
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_deadline_hour: hour })
    });
    const data = await res.json();
    if (status) {
      status.textContent = data.ok ? `已保存：${data.daily_deadline_hour} 点` : (data.error || '保存失败');
      status.style.color = data.ok ? 'var(--color-success, #10b981)' : 'var(--color-danger, #ef4444)';
    }
  } catch (e) {
    if (status) {
      status.textContent = '保存失败';
      status.style.color = 'var(--color-danger, #ef4444)';
    }
  }
}

async function loadCollectRuns() {
  try {
    const input = document.getElementById('log-date');
    const date = input ? input.value : new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/collect-runs?limit=60`);
    const data = await res.json();
    const runs = data.runs || [];

    // Find latest run for that day (by started_at)
    const dayRuns = runs.filter(r => (r.started_at || '').slice(0, 10) === date);
    dayRuns.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
    const run = dayRuns[0];

    document.getElementById('log-items-total').textContent = run ? (run.hotspots_inserted || 0) : 0;
    document.getElementById('log-items-new').textContent = run ? (run.items_new || 0) : 0;
    document.getElementById('log-items-existing').textContent = run ? (run.items_existing || 0) : 0;

    const breakdown = (run && run.date_breakdown) ? run.date_breakdown : [];
    const container = document.getElementById('log-breakdown');
    if (!container) return;
    if (!run) {
      container.innerHTML = '<div style="color:var(--color-text-secondary);">该日没有抓取记录</div>';
      return;
    }

    container.innerHTML = breakdown.map(b => {
      const d = b.content_date || '';
      const c = b.item_count || 0;
      return `<div style="display:flex; justify-content:space-between; padding: var(--space-sm) var(--space-md); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
        <div style="font-weight:600;">${escapeHtml(d)}</div>
        <div style="color: var(--color-text-secondary);">${c} 篇</div>
      </div>`;
    }).join('');

  } catch (e) {
    console.error('加载抓取日志失败:', e);
  }
}

function renderSourceFilters() {
  const container = document.getElementById('source-filters');
  if (!container) return;

  const allCount = allSourceGroups.reduce((s, x) => s + (x.count || 0), 0);
  const findCnt = (key) => {
    if (key === 'twitter') return allSourceGroups.filter(x => (x.source || '').includes('twitter')).reduce((s,x)=>s+(x.count||0),0);
    if (key === 'rss') return allSourceGroups.filter(x => (x.source || '').includes('http')).reduce((s,x)=>s+(x.count||0),0);
    if (key === 'blog') return allSourceGroups.filter(x => (x.source || '').includes('blog')).reduce((s,x)=>s+(x.count||0),0);
    return 0;
  };

  const buttons = [
    { key: 'all', label: `全部 (${allCount})` },
    { key: 'twitter', label: `🐦 Twitter (${findCnt('twitter')})` },
    { key: 'rss', label: `📰 RSS (${findCnt('rss')})` },
    { key: 'blog', label: `📝 博客 (${findCnt('blog')})` },
  ];

  container.innerHTML = buttons.map(b => {
    const active = (selectedSource === b.key) ? 'active' : '';
    return `<button class="filter-tag ${active}" data-source="${b.key}">${b.label}</button>`;
  }).join('');
}

function renderHotspots() {
  const container = document.getElementById('hotspots-list');
  const searchTerm = document.getElementById('hotspots-search').value.toLowerCase();
  const sortBy = document.getElementById('sort-select').value;

  let filtered = allHotspots.filter(h => {
    // 来源筛选
    if (selectedSource !== 'all') {
      if (selectedSource === 'twitter' && !h.source.includes('twitter')) return false;
      if (selectedSource === 'rss' && !h.source.includes('http')) return false;
      if (selectedSource === 'blog' && !h.source.includes('blog')) return false;
    }

    // 分类筛选
    if (selectedCategories.length > 0 && !selectedCategories.includes(h.category)) return false;

    // 标签筛选
    if (selectedTags.length > 0) {
      const hotspoTags = h.tags || [];
      if (!selectedTags.some(t => hotspoTags.includes(t))) return false;
    }

    // 搜索
    if (searchTerm && !h.title.toLowerCase().includes(searchTerm)) return false;

    return true;
  });

  // 排序
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.total_score || 0) - (a.total_score || 0);
      case 'date':
        return new Date(b.created_at) - new Date(a.created_at);
      case 'innovation':
        return (b.innovation_score || 0) - (a.innovation_score || 0);
      case 'commercial':
        return (b.commercial_score || 0) - (a.commercial_score || 0);
      default:
        return 0;
    }
  });

  container.innerHTML = filtered.map(h => createHotspotCard(h)).join('');

  // 绑定事件
  container.querySelectorAll('.hotspot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hotspotId = btn.closest('.hotspot-card').dataset.id;
      const hotspot = allHotspots.find(h => h.id === hotspotId);
      if (btn.classList.contains('detail-btn')) {
        openHotspotModal(hotspot);
      }
    });
  });

  // 绑定标签点击事件
  container.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = tag.textContent.trim();
      toggleTagFilter(tagName);
    });
  });
}

function createHotspotCard(hotspot) {
  const tags = hotspot.tags || [];
  const categoryEmoji = getCategoryEmoji(hotspot.category);
  const sourceEmoji = getSourceEmoji(hotspot.source);

  return `
    <div class="hotspot-card" data-id="${hotspot.id}">
      <div class="hotspot-header">
        <div class="hotspot-title">${escapeHtml(hotspot.title)}</div>
        <div class="hotspot-source">${sourceEmoji} ${getSourceName(hotspot.source)}</div>
      </div>

      <div class="hotspot-meta">
        <div class="hotspot-category">
          ${categoryEmoji} ${hotspot.category}
        </div>
        <div class="hotspot-score">
          <i class="fas fa-star"></i>
          ${(hotspot.total_score || 0).toFixed(1)}
        </div>
      </div>

      <div class="hotspot-summary">
        ${escapeHtml(hotspot.ai_summary || hotspot.content || '暂无摘要')}
      </div>

      ${tags.length > 0 ? `
        <div class="hotspot-tags">
          ${tags.map((tag, idx) => `
            <span class="tag tag-${TAG_COLORS[idx % TAG_COLORS.length]}">
              ${escapeHtml(tag)}
            </span>
          `).join('')}
        </div>
      ` : ''}

      <div class="hotspot-footer">
        <div class="hotspot-time">${formatTime(hotspot.created_at)}</div>
        <div class="hotspot-actions">
          <button class="hotspot-btn detail-btn">
            <i class="fas fa-arrow-right"></i> 详情
          </button>
        </div>
      </div>
    </div>
  `;
}

function openHotspotModal(hotspot) {
  const modal = document.getElementById('hotspot-modal');
  const title = document.getElementById('hotspot-modal-title');
  const body = document.getElementById('hotspot-modal-body');

  title.textContent = hotspot.title;

  const tags = hotspot.tags || [];
  body.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
      <div>
        <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">基本信息</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div>
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">来源</div>
            <div style="color: var(--color-text-primary); font-weight: 500;">${getSourceName(hotspot.source)}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">分类</div>
            <div style="color: var(--color-text-primary); font-weight: 500;">${hotspot.category}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">发布时间</div>
            <div style="color: var(--color-text-primary); font-weight: 500;">${formatTime(hotspot.created_at)}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">综合评分</div>
            <div style="color: var(--color-primary); font-weight: 600; font-size: 16px;">${(hotspot.total_score || 0).toFixed(1)}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">评分详情</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">创新度</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--color-primary);">${hotspot.innovation_score || 0}</div>
          </div>
          <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">商业潜力</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--color-primary);">${hotspot.commercial_score || 0}</div>
          </div>
          <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">技术难度</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--color-primary);">${hotspot.tech_score || 0}</div>
          </div>
          <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">投资价值</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--color-primary);">${hotspot.investment_score || 0}</div>
          </div>
        </div>
      </div>

      ${hotspot.ai_summary ? `
        <div>
          <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">AI摘要</h3>
          <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md); line-height: 1.6;">
            ${escapeHtml(hotspot.ai_summary)}
          </div>
        </div>
      ` : ''}

      <div>
        <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">完整内容</h3>
        <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md); line-height: 1.6; max-height: 300px; overflow-y: auto;">
          ${escapeHtml(hotspot.content || '暂无内容')}
        </div>
      </div>

      ${hotspot.url ? `
        <div>
          <a href="${hotspot.url}" target="_blank" class="action-btn primary" style="display: inline-flex; text-decoration: none;">
            <i class="fas fa-external-link-alt"></i> 查看原文
          </a>
        </div>
      ` : ''}

      ${tags.length > 0 ? `
        <div>
          <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">标签</h3>
          <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm);">
            ${tags.map((tag, idx) => `
              <span class="tag tag-${TAG_COLORS[idx % TAG_COLORS.length]}">
                ${escapeHtml(tag)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  modal.classList.add('active');
}

function closeHotspotModal() {
  document.getElementById('hotspot-modal').classList.remove('active');
}

function renderOpportunities() {
  const container = document.getElementById('opportunities-list');
  const searchTerm = document.getElementById('opportunities-search').value.toLowerCase();

  let filtered = allOpportunities.filter(o => {
    if (searchTerm && !o.title.toLowerCase().includes(searchTerm)) return false;
    return true;
  });

  container.innerHTML = filtered.map(o => createOpportunityCard(o)).join('');

  container.querySelectorAll('.opportunity-card').forEach(card => {
    card.addEventListener('click', () => {
      const opportunityId = card.dataset.id;
      const opportunity = allOpportunities.find(o => o.id === opportunityId);
      openOpportunityModal(opportunity);
    });
  });
}

function createOpportunityCard(opportunity) {
  const domains = opportunity.domains || [];
  const priorityColor = opportunity.priority === '高' ? '#ef4444' : opportunity.priority === '中' ? '#f59e0b' : '#10b981';
  const priorityLabel = opportunity.priority === '高' ? '高优先级' : opportunity.priority === '中' ? '中优先级' : '低优先级';

  return `
    <div class="opportunity-card" data-id="${opportunity.id}">
      <div class="opportunity-header">
        <div class="opportunity-title">${escapeHtml(opportunity.title)}</div>
        <div class="opportunity-priority" style="display: inline-flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-md); background: ${priorityColor}20; color: ${priorityColor}; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; white-space: nowrap;">
          <i class="fas fa-flag"></i> ${priorityLabel}
        </div>
      </div>

      <div class="opportunity-tags" style="display: flex; flex-wrap: wrap; gap: var(--space-sm); margin-bottom: var(--space-md);">
        ${domains.map((domain, idx) => `
          <span class="tag tag-${['blue', 'purple', 'pink', 'green', 'orange'][idx % 5]}" style="font-size: 11px;">
            ${escapeHtml(domain)}
          </span>
        `).join('')}
      </div>

      <div class="opportunity-meta">
        <div class="opportunity-item">
          <span class="opportunity-label">分类</span>
          <span class="opportunity-value">${opportunity.category || '未分类'}</span>
        </div>
        <div class="opportunity-item">
          <span class="opportunity-label">潜力评分</span>
          <span class="opportunity-score">${opportunity.potential_score || 0}</span>
        </div>
        <div class="opportunity-item">
          <span class="opportunity-label">竞争程度</span>
          <span class="opportunity-value">${opportunity.competition_level || '未知'}</span>
        </div>
        <div class="opportunity-item">
          <span class="opportunity-label">发布时间</span>
          <span class="opportunity-value">${formatTime(opportunity.created_at)}</span>
        </div>
      </div>

      <div class="opportunity-footer">
        <button class="opportunity-btn" style="cursor: pointer;">
          <i class="fas fa-arrow-right"></i> 查看详情
        </button>
      </div>
    </div>
  `;
}

function openOpportunityModal(opportunity) {
  const modal = document.getElementById('opportunity-modal');
  const title = document.getElementById('opportunity-modal-title');
  const body = document.getElementById('opportunity-modal-body');

  title.textContent = opportunity ? opportunity.title : '新建机会';

  if (opportunity) {
    // 查找相关热点（基于分类和关键词）
    const relatedHotspots = allHotspots.filter(h =>
      h.category === opportunity.category ||
      h.title.toLowerCase().includes(opportunity.title.toLowerCase().split(' ')[0])
    ).slice(0, 5);

    const domains = opportunity.domains || [];
    const priorityColor = opportunity.priority === '高' ? '#ef4444' : opportunity.priority === '中' ? '#f59e0b' : '#10b981';

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
        <div>
          <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">基本信息</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
            <div>
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">分类</div>
              <div style="color: var(--color-text-primary); font-weight: 500;">${opportunity.category}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">潜力评分</div>
              <div style="color: var(--color-primary); font-weight: 600; font-size: 16px;">${opportunity.potential_score}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">竞争程度</div>
              <div style="color: var(--color-text-primary); font-weight: 500;">${opportunity.competition_level}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">优先级</div>
              <div style="display: inline-flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-md); background: ${priorityColor}20; color: ${priorityColor}; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600;">
                <i class="fas fa-flag"></i> ${opportunity.priority || '中'}
              </div>
            </div>
          </div>
        </div>

        ${domains.length > 0 ? `
          <div>
            <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">涉及领域</h3>
            <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm);">
              ${domains.map((domain, idx) => `
                <span class="tag tag-${['blue', 'purple', 'pink', 'green', 'orange'][idx % 5]}">
                  ${escapeHtml(domain)}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${opportunity.pain_points ? `
          <div>
            <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">当前痛点</h3>
            <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md); line-height: 1.6;">
              ${escapeHtml(opportunity.pain_points)}
            </div>
          </div>
        ` : ''}

        ${opportunity.blue_ocean_opportunity ? `
          <div>
            <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">蓝海机会</h3>
            <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md); line-height: 1.6;">
              ${escapeHtml(opportunity.blue_ocean_opportunity)}
            </div>
          </div>
        ` : ''}

        ${opportunity.monetization_potential ? `
          <div>
            <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">变现潜力</h3>
            <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md); line-height: 1.6;">
              ${escapeHtml(opportunity.monetization_potential)}
            </div>
          </div>
        ` : ''}

        <div>
          <h3 style="margin-bottom: var(--space-sm); color: var(--color-text-primary);">时间线与资源</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
            <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">时间线</div>
              <div style="color: var(--color-text-primary); font-weight: 500;">${opportunity.timeline}</div>
            </div>
            <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-xs);">所需资源</div>
              <div style="color: var(--color-text-primary); font-weight: 500;">${opportunity.resources_needed}</div>
            </div>
          </div>
        </div>

        ${relatedHotspots.length > 0 ? `
          <div>
            <h3 style="margin-bottom: var(--space-md); color: var(--color-text-primary);">相关热点</h3>
            <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
              ${relatedHotspots.map(h => `
                <div style="padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md); cursor: pointer; transition: all 0.3s ease;"
                     class="related-hotspot-item" data-id="${h.id}">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-md);">
                    <div style="flex: 1;">
                      <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: var(--space-xs);">
                        ${escapeHtml(h.title)}
                      </div>
                      <div style="font-size: 13px; color: var(--color-text-secondary); line-height: 1.4;">
                        ${escapeHtml((h.ai_summary || h.content || '').substring(0, 100))}...
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-md); background: var(--color-primary); color: white; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; white-space: nowrap;">
                      <i class="fas fa-star"></i> ${(h.total_score || 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // 绑定相关热点点击事件
    body.querySelectorAll('.related-hotspot-item').forEach(item => {
      item.addEventListener('click', () => {
        const hotspotId = item.dataset.id;
        const hotspot = allHotspots.find(h => h.id === hotspotId);
        if (hotspot) {
          closeOpportunityModal();
          openHotspotModal(hotspot);
        }
      });
      item.addEventListener('mouseover', () => {
        item.style.background = 'var(--color-surface-hover)';
        item.style.transform = 'translateX(4px)';
      });
      item.addEventListener('mouseout', () => {
        item.style.background = 'var(--color-surface)';
        item.style.transform = 'translateX(0)';
      });
    });
  } else {
    body.innerHTML = `
      <div style="padding: var(--space-lg); text-align: center; color: var(--color-text-secondary);">
        新建机会功能开发中...
      </div>
    `;
  }

  modal.classList.add('active');
}

function closeOpportunityModal() {
  document.getElementById('opportunity-modal').classList.remove('active');
}

function openTagsModal() {
  const modal = document.getElementById('tags-modal');
  renderExistingTags();
  modal.classList.add('active');
}

function closeTagsModal() {
  document.getElementById('tags-modal').classList.remove('active');
}

function renderExistingTags() {
  const container = document.getElementById('existing-tags');
  container.innerHTML = customTags.map(tag => `
    <div style="display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
      <span>${escapeHtml(tag)}</span>
      <button class="delete-tag-btn" data-tag="${tag}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 14px;">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.delete-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      customTags = customTags.filter(t => t !== tag);
      localStorage.setItem('customTags', JSON.stringify(customTags));
      renderExistingTags();
    });
  });
}

function addNewTag() {
  const input = document.getElementById('new-tag-input');
  const tag = input.value.trim();

  if (!tag) {
    alert('请输入标签名称');
    return;
  }

  if (customTags.includes(tag)) {
    alert('标签已存在');
    return;
  }

  customTags.push(tag);
  localStorage.setItem('customTags', JSON.stringify(customTags));
  input.value = '';
  renderExistingTags();
}

function toggleTagFilter(tag) {
  const index = selectedTags.indexOf(tag);
  if (index > -1) {
    selectedTags.splice(index, 1);
  } else {
    selectedTags.push(tag);
  }
  renderTagFilters();
  renderHotspots();
}

function renderTagFilters() {
  const container = document.getElementById('tag-filters');
  const allTags = [...new Set(allHotspots.flatMap(h => h.tags || []))];
  const allCustomTags = [...new Set(customTags)];
  const combinedTags = [...new Set([...allTags, ...allCustomTags])];

  container.innerHTML = combinedTags.map(tag => `
    <button class="filter-tag ${selectedTags.includes(tag) ? 'active' : ''}" data-tag="${tag}">
      ${escapeHtml(tag)}
    </button>
  `).join('');

  container.querySelectorAll('.filter-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      toggleTagFilter(tag);
    });
  });
}

async function collectData() {
  const btn = document.getElementById('collect-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>收集中...</span>';

  try {
    const response = await fetch('/api/collect', { method: 'POST' });
    const data = await response.json();

    if (data.ok) {
      alert(`成功收集 ${data.hotspots_count} 条热点，${data.opportunities_count} 个机会`);
      loadData();
    }
  } catch (error) {
    console.error('收集数据失败:', error);
    alert('收集数据失败');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync-alt"></i><span>收集数据</span>';
  }
}

function exportHotspots() {
  window.location.href = `/api/export?type=hotspots&date=${currentDate}`;
}

// 辅助函数
function getSourceEmoji(source) {
  if (source.includes('twitter')) return '🐦';
  if (source.includes('http')) return '📰';
  return '📝';
}

function getSourceName(source) {
  if (source.includes('twitter')) return 'Twitter';
  if (source.includes('arxiv')) return 'arXiv';
  if (source.includes('ycombinator')) return 'Hacker News';
  if (source.includes('reddit')) return 'Reddit';
  return source;
}

function getCategoryEmoji(category) {
  const emojis = {
    '技术突破': '🚀',
    '产品发布': '📦',
    '投资融资': '💰',
    '行业动态': '📰',
    '人才流动': '👥',
    '市场机会': '🎯'
  };
  return emojis[category] || '📌';
}

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
