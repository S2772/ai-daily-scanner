const statusEl = document.getElementById("status");
const dateInput = document.getElementById("date-input");
const hotspotsContainer =
  document.getElementById("hotspots-grid") || document.getElementById("hotspots");
const opportunitiesContainer =
  document.getElementById("opportunities-content") || document.getElementById("opportunities");
const notesContainer = document.getElementById("notes-list") || document.getElementById("notes");
const sourceStatusContainer = document.getElementById("source-status-list");
const noteHotspotInput = document.getElementById("note-hotspot-id");
const noteContentInput = document.getElementById("note-content");
const noteTagsInput =
  document.getElementById("note-tags-input") || document.getElementById("note-tags");

// 热点详情模态框相关元素
const hotspotModal = document.getElementById("hotspot-modal");
const hotspotModalTitle = document.getElementById("hotspot-modal-title");
const hotspotModalContent = document.getElementById("hotspot-modal-content");
const hotspotModalClose = document.getElementById("hotspot-modal-close");
const hotspotModalOverlay = document.getElementById("hotspot-modal-overlay");

const state = {
  hotspots: [],
  allHotspots: [],
  opportunities: [], // 添加机会数据存储
  filters: {
    categories: [],
    tags: [],
    search: ''
  },
  sortBy: 'date', // 默认按最新发布排序
  sortOrder: 'desc', // 默认降序
  isLoading: false // 添加加载状态
};

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

// 显示加载状态
function showLoadingState() {
  const containers = [hotspotsContainer, opportunitiesContainer];
  containers.forEach(container => {
    if (container) {
      container.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      `;
    }
  });
}

// 隐藏加载状态
function hideLoadingState() {
  // 加载完成后会自动渲染内容，无需额外操作
}

// 显示错误状态
function showErrorState(message) {
  const containers = [hotspotsContainer, opportunitiesContainer];
  containers.forEach(container => {
    if (container) {
      container.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>加载失败：${escapeHtml(message)}</p>
          <button class="action-btn primary" onclick="loadData()">重试</button>
        </div>
      `;
    }
  });
}


function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 计算创新度分数
function calculateInnovationScore(hotspot) {
  let score = 5; // 基础分
  
  // 根据标签加分
  const tags = hotspot.tags || [];
  if (tags.includes('大语言模型') || tags.includes('多模态') || tags.includes('NLP')) {
    score += 2;
  }
  if (tags.includes('技术突破') || tags.includes('开源项目')) {
    score += 1.5;
  }
  if (tags.includes('硬件发布')) {
    score += 1;
  }
  
  // 根据分类调整
  if (hotspot.category === '技术突破') {
    score += 1.5;
  } else if (hotspot.category === '开源项目') {
    score += 1;
  }
  
  // 确保分数在0-10之间
  return Math.min(Math.max(score, 0), 10);
}

// 计算商业潜力分数
function calculateCommercialScore(hotspot) {
  let score = 5; // 基础分
  
  // 根据标签加分
  const tags = hotspot.tags || [];
  if (tags.includes('投资融资') || tags.includes('市场机会')) {
    score += 2;
  }
  if (tags.includes('产品发布')) {
    score += 1.5;
  }
  if (tags.includes('商业合作')) {
    score += 1;
  }
  
  // 根据分类调整
  if (hotspot.category === '投资融资') {
    score += 2;
  } else if (hotspot.category === '市场机会') {
    score += 1.5;
  } else if (hotspot.category === '产品发布') {
    score += 1;
  }
  
  // 确保分数在0-10之间
  return Math.min(Math.max(score, 0), 10);
}

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panes = document.querySelectorAll(".tab-pane");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach((b) => b.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const pane = document.getElementById(`${tab}-pane`);
      if (pane) {
        pane.classList.add("active");
      }
    });
  });
}

function updateBadges() {
  const hb = document.getElementById("hotspots-badge");
  const ob = document.getElementById("opportunities-badge");
  const nb = document.getElementById("notes-badge");
  if (hb) hb.textContent = String(document.getElementById("hotspot-count")?.textContent || "0");
  if (ob) ob.textContent = String(document.getElementById("opportunity-count")?.textContent || "0");
  if (nb) nb.textContent = String(document.getElementById("note-count")?.textContent || "0");
}

function renderSourceStatus(items) {
  if (!sourceStatusContainer) return;
  if (!items.length) {
    sourceStatusContainer.innerHTML = '<p class="status-placeholder">该日期无来源状态数据</p>';
    return;
  }
  sourceStatusContainer.innerHTML = items
    .map((item) => {
      const badgeClass = item.status === "success" ? "success" : item.status === "empty" ? "empty" : "error";
      const badgeText = item.status === "success" ? "成功" : item.status === "empty" ? "空结果" : "失败";
      const detail = item.error_message
        ? `错误: ${escapeHtml(item.error_message).slice(0, 140)}`
        : `采集条数: ${item.item_count}`;
      return `
        <div class="source-status-item">
          <div class="source-status-head">
            <span class="status-badge ${badgeClass}">${badgeText}</span>
            <span class="source-status-meta">${escapeHtml(item.created_at || "")}</span>
          </div>
          <div class="source-status-url">${escapeHtml(item.source)}</div>
          <div class="source-status-meta">${detail}</div>
        </div>
      `;
    })
    .join("");
}

function renderHotspots(items) {
  if (!hotspotsContainer) return;
  if (!items.length) {
    hotspotsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>该日期暂无热点数据</p>
        <button class="action-btn primary" onclick="document.getElementById('collect-btn').click()">
          <i class="fas fa-sync-alt"></i>
          <span>收集热点</span>
        </button>
      </div>
    `;
    return;
  }

  // 直接使用API返回的ai_summary（后端会自动生成并缓存）
  renderHotspotsWithSummaries(items);
}

function renderHotspotsWithSummaries(items) {
  if (!hotspotsContainer) return;

  hotspotsContainer.innerHTML = items
    .map((item) => {
      const tags = (item.tags || []).join(" / ");
      const action = item.url
        ? `<button class="nav-btn open-link-btn" type="button" data-url="${escapeHtml(item.url)}">查看原文</button>`
        : `<span class="meta">无可用链接</span>`;

      // AI摘要（从API返回的数据中获取）
      const aiSummary = item.ai_summary || '';

      const title = item.title || '';
      const titleZh = item.title_zh || '';

      return `
      <article class="content-card source-status-item hotspot-card" data-hotspot-id="${escapeHtml(item.id)}">
        <div class="source-status-head">
          <div class="title-section">
            <strong>${escapeHtml(title)}</strong>
            ${titleZh ? `<div class="chinese-translation">${escapeHtml(titleZh)}</div>` : ''}
          </div>
          <span class="status-badge success">${item.total_score}/10</span>
        </div>
        <p class="source-status-meta">ID: ${escapeHtml(item.id)} | 分类: ${escapeHtml(item.category)} | 标签: ${escapeHtml(tags)}</p>
        ${aiSummary ? `<p class="hotspot-summary" style="color: #2196F3; font-weight: bold;">🤖 ${escapeHtml(aiSummary)}</p>` : '<p class="hotspot-summary">暂无AI摘要，点击详情生成...</p>'}
        <p class="source-status-meta">来源: ${escapeHtml(item.source)} | ${action}</p>
      </article>`;
    })
    .join("");

  // 添加热点卡片点击事件
  hotspotsContainer.querySelectorAll(".hotspot-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // 防止点击按钮时触发卡片点击
      if (e.target.closest('.open-link-btn')) return;
      const hotspotId = card.getAttribute("data-hotspot-id");
      showHotspotDetail(hotspotId);
    });
  });

  hotspotsContainer.querySelectorAll(".open-link-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止事件冒泡到卡片
      const url = button.getAttribute("data-url");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

function renderOpportunities(items) {
  if (!opportunitiesContainer) return;
  if (!items.length) {
    opportunitiesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-gem"></i>
        <p>该日期暂无机会数据</p>
      </div>
    `;
    return;
  }
  opportunitiesContainer.innerHTML = items
    .map((item) => {
      const title = item.title || '';

      // 生成智能摘要
      const description = item.description || '';
      const summary = generateSmartSummary(description, 100);

      return `
      <article class="source-status-item opportunity-card" data-opportunity-id="${escapeHtml(item.id)}">
        <div class="source-status-head">
          <div class="title-section">
            <strong>${escapeHtml(title)}</strong>
          </div>
          <span class="status-badge success">${item.potential_score}/100</span>
        </div>
        <p class="source-status-meta">领域: ${escapeHtml(item.category)} | 竞争: ${escapeHtml(item.competition_level)}</p>
        <p class="opportunity-summary">${escapeHtml(summary)}</p>
        <div class="opportunity-actions">
          <button class="nav-btn small view-details-btn" data-opportunity-id="${escapeHtml(item.id)}">
            <i class="fas fa-eye"></i> 查看详情
          </button>
          ${item.hotspot_id ? `
          <button class="nav-btn small primary view-source-btn" data-hotspot-id="${escapeHtml(item.hotspot_id)}">
            <i class="fas fa-link"></i> 查看来源热点
          </button>
          ` : ''}
        </div>
      </article>`;
    })
    .join("");

  // 添加查看详情按钮事件
  opportunitiesContainer.querySelectorAll(".view-details-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const opportunityId = button.getAttribute("data-opportunity-id");
      showOpportunityDetail(opportunityId);
    });
  });

  // 添加查看来源热点按钮事件
  opportunitiesContainer.querySelectorAll(".view-source-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const hotspotId = button.getAttribute("data-hotspot-id");
      showHotspotDetail(hotspotId);
    });
  });
  
  // 添加机会卡片点击事件
  opportunitiesContainer.querySelectorAll(".view-details-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opportunityId = btn.getAttribute("data-opportunity-id");
      showOpportunityDetail(opportunityId);
    });
  });
  
  // 添加查看来源热点按钮点击事件
  opportunitiesContainer.querySelectorAll(".view-source-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const hotspotId = btn.getAttribute("data-hotspot-id");
      if (hotspotId) {
        showHotspotDetail(hotspotId);
      }
    });
  });
}

function renderNotes(items) {
  if (!notesContainer) return;
  if (!items.length) {
    notesContainer.innerHTML = '<p class="meta">该日期没有笔记。</p>';
    return;
  }
  notesContainer.innerHTML = items
    .map(
      (item) => `
      <article class="source-status-item">
        <div class="source-status-head">
          <strong>${escapeHtml(item.hotspot_title || item.hotspot_id)}</strong>
          <span class="source-status-meta">${escapeHtml(item.created_at)}</span>
        </div>
        <p>${escapeHtml(item.content)}</p>
        <p class="source-status-meta">标签: ${escapeHtml(item.tags || "-")}</p>
      </article>`
    )
    .join("");
}

function renderNoteHotspotOptions(items) {
  if (!noteHotspotInput || noteHotspotInput.tagName !== "SELECT") return;
  const current = noteHotspotInput.value;
  const options = ['<option value="">选择热点...</option>'].concat(
    items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title).slice(0, 80)}</option>`)
  );
  noteHotspotInput.innerHTML = options.join("");
  if (current) noteHotspotInput.value = current;
}

// 筛选器相关函数
function updateFilterOptions(hotspots) {
  // 提取所有唯一的分类
  const categories = [...new Set(hotspots.map(h => h.category).filter(Boolean))];
  renderCategoryFilters(categories);
  
  // 提取所有标签
  const allTags = [];
  hotspots.forEach(h => {
    if (h.tags && Array.isArray(h.tags)) {
      allTags.push(...h.tags);
    }
  });
  const uniqueTags = [...new Set(allTags)].filter(Boolean);
  renderTagFilters(uniqueTags);
}

function renderCategoryFilters(categories) {
  const container = document.getElementById('category-filters');
  if (!container) return;
  
  if (categories.length === 0) {
    container.innerHTML = '<p class="meta">暂无分类数据</p>';
    return;
  }
  
  const html = categories.map(category => `
    <label class="filter-option">
      <input type="checkbox" value="${escapeHtml(category)}" class="category-checkbox">
      <span>${escapeHtml(category)}</span>
    </label>
  `).join('');
  
  container.innerHTML = html;
  
  // 添加事件监听
  container.querySelectorAll('.category-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateCategoryFilters();
      applyFilters();
    });
  });
}

function renderTagFilters(tags) {
  const container = document.getElementById('tag-filters');
  if (!container) return;
  
  if (tags.length === 0) {
    container.innerHTML = '<p class="meta">暂无标签数据</p>';
    return;
  }
  
  const html = tags.map(tag => `
    <button type="button" class="tag-btn" data-tag="${escapeHtml(tag)}">
      ${escapeHtml(tag)}
    </button>
  `).join('');
  
  container.innerHTML = html;
  
  // 添加事件监听
  container.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.getAttribute('data-tag');
      toggleTagFilter(tag);
      applyFilters();
    });
  });
}

function updateCategoryFilters() {
  const checkboxes = document.querySelectorAll('.category-checkbox:checked');
  state.filters.categories = Array.from(checkboxes).map(cb => cb.value);
}

function toggleTagFilter(tag) {
  const index = state.filters.tags.indexOf(tag);
  if (index === -1) {
    state.filters.tags.push(tag);
  } else {
    state.filters.tags.splice(index, 1);
  }
  
  // 更新按钮状态
  const btn = document.querySelector(`.tag-btn[data-tag="${escapeHtml(tag)}"]`);
  if (btn) {
    if (state.filters.tags.includes(tag)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
}

function applyFilters() {
  let filtered = [...state.allHotspots];
  
  // 应用分类筛选
  if (state.filters.categories.length > 0) {
    filtered = filtered.filter(h => 
      state.filters.categories.includes(h.category)
    );
  }
  
  // 应用标签筛选
  if (state.filters.tags.length > 0) {
    filtered = filtered.filter(h => {
      if (!h.tags || !Array.isArray(h.tags)) return false;
      return state.filters.tags.some(tag => h.tags.includes(tag));
    });
  }
  
  // 应用搜索筛选
  if (state.filters.search) {
    const searchLower = state.filters.search.toLowerCase();
    filtered = filtered.filter(h => 
      (h.title && h.title.toLowerCase().includes(searchLower)) ||
      (h.content && h.content.toLowerCase().includes(searchLower)) ||
      (h.tags && Array.isArray(h.tags) && h.tags.some(tag => tag.toLowerCase().includes(searchLower)))
    );
  }
  
  // 应用排序
  filtered = sortHotspots(filtered);
  
  state.hotspots = filtered;
  renderHotspots(state.hotspots);
  updateFilterInfo();
}

function updateFilterInfo() {
  const infoEl = document.getElementById('hotspots-filter-info');
  if (!infoEl) return;
  
  const parts = [];
  
  if (state.filters.categories.length > 0) {
    parts.push(`分类: ${state.filters.categories.join(', ')}`);
  }
  
  if (state.filters.tags.length > 0) {
    parts.push(`标签: ${state.filters.tags.join(', ')}`);
  }
  
  if (state.filters.search) {
    parts.push(`搜索: ${state.filters.search}`);
  }
  
  if (parts.length === 0) {
    infoEl.textContent = '全部';
  } else {
    infoEl.textContent = parts.join(' | ');
  }
}

function setupFilterClearButtons() {
  // 分类清除按钮
  const categoryClearBtn = document.querySelector('.filter-group:nth-child(1) .filter-clear');
  if (categoryClearBtn) {
    categoryClearBtn.addEventListener('click', () => {
      document.querySelectorAll('.category-checkbox').forEach(cb => {
        cb.checked = false;
      });
      state.filters.categories = [];
      applyFilters();
    });
  }
  
  // 标签清除按钮
  const tagClearBtn = document.querySelector('.filter-group:nth-child(2) .filter-clear');
  if (tagClearBtn) {
    tagClearBtn.addEventListener('click', () => {
      state.filters.tags = [];
      document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      applyFilters();
    });
  }
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.search = searchInput.value.trim();
      applyFilters();
    }, 300);
  });
}

// 排序相关函数
function setupSorting() {
  const sortSelect = document.getElementById('sort-select');
  if (!sortSelect) return;
  
  // 设置默认值
  sortSelect.value = state.sortBy;
  
  sortSelect.addEventListener('change', () => {
    state.sortBy = sortSelect.value;
    applyFilters();
  });
}

function sortHotspots(items) {
  if (!items || items.length === 0) return items;

  const sortedItems = [...items];

  switch (state.sortBy) {
    case 'date':
      // 按创建时间排序（降序）
      sortedItems.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return state.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
      break;

    case 'score':
      // 按评分排序（降序）- 修复：使用 total_score 而不是 score
      sortedItems.sort((a, b) => {
        const scoreA = parseFloat(a.total_score) || 0;
        const scoreB = parseFloat(b.total_score) || 0;
        return state.sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
      break;

    case 'innovation':
      // 按创新度排序（基于标签和内容分析）
      sortedItems.sort((a, b) => {
        const innovationA = calculateInnovationScore(a);
        const innovationB = calculateInnovationScore(b);
        return state.sortOrder === 'desc' ? innovationB - innovationA : innovationA - innovationB;
      });
      break;

    case 'commercial':
      // 按商业潜力排序
      sortedItems.sort((a, b) => {
        const commercialA = calculateCommercialScore(a);
        const commercialB = calculateCommercialScore(b);
        return state.sortOrder === 'desc' ? commercialB - commercialA : commercialA - commercialB;
      });
      break;

    default:
      // 默认按日期排序
      sortedItems.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
  }

  return sortedItems;
}

function calculateInnovationScore(item) {
  // 基于内容分析计算创新度分数
  let score = 5; // 基础分数
  
  // 检查标题和内容中的关键词
  const text = (item.title + ' ' + (item.content || '')).toLowerCase();
  
  // 创新相关关键词
  const innovationKeywords = [
    'breakthrough', 'revolutionary', 'novel', 'innovative', 'new approach',
    'first', 'pioneering', 'groundbreaking', 'state-of-the-art', 'cutting-edge',
    '突破', '革命性', '新颖', '创新', '首创', '前沿', '领先'
  ];
  
  innovationKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      score += 1;
    }
  });
  
  // 检查标签
  if (item.tags && Array.isArray(item.tags)) {
    const innovationTags = ['research', 'paper', 'algorithm', 'model', 'framework'];
    item.tags.forEach(tag => {
      if (innovationTags.includes(tag.toLowerCase())) {
        score += 0.5;
      }
    });
  }
  
  return Math.min(score, 10); // 限制在0-10之间
}

function calculateCommercialScore(item) {
  // 基于内容分析计算商业潜力分数
  let score = 5; // 基础分数
  
  // 检查标题和内容中的关键词
  const text = (item.title + ' ' + (item.content || '')).toLowerCase();
  
  // 商业相关关键词
  const commercialKeywords = [
    'funding', 'investment', 'series', 'raise', 'valuation', 'investor',
    'market', 'revenue', 'profit', 'business', 'commercial', 'product',
    'launch', 'release', 'customer', 'user', 'growth', 'scale',
    '融资', '投资', '估值', '市场', '收入', '利润', '商业', '产品',
    '发布', '客户', '用户', '增长', '规模化'
  ];
  
  commercialKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      score += 0.5;
    }
  });
  
  // 检查分类
  const commercialCategories = ['产品发布', '投资融资', '商业合作'];
  if (commercialCategories.includes(item.category)) {
    score += 2;
  }
  
  // 检查标签
  if (item.tags && Array.isArray(item.tags)) {
    const commercialTags = ['startup', 'funding', 'investment', 'business', 'commercial'];
    item.tags.forEach(tag => {
      if (commercialTags.includes(tag.toLowerCase())) {
        score += 0.5;
      }
    });
  }
  
  return Math.min(score, 10); // 限制在0-10之间
}

async function loadData() {
  if (state.isLoading) return; // 防止重复加载

  const date = dateInput?.value || new Date().toISOString().slice(0, 10);
  state.isLoading = true;
  setStatus(`加载 ${date} 数据中...`);

  // 显示加载状态
  showLoadingState();

  try {
    const safeFetch = async (url, fallback) => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Failed to fetch ${url}: ${res.status}`);
          return fallback;
        }
        return await res.json();
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return fallback;
      }
    };
    const [summary, hotspotsData, opportunities, notes, sourceStatus] = await Promise.all([
      safeFetch(`/api/summary?date=${encodeURIComponent(date)}`, { hotspot_count: 0, opportunity_count: 0, note_count: 0 }),
      safeFetch(`/api/hotspots?date=${encodeURIComponent(date)}`, { hotspots: [] }),
      safeFetch(`/api/opportunities?date=${encodeURIComponent(date)}`, { opportunities: [] }),
      safeFetch(`/api/notes?date=${encodeURIComponent(date)}`, { notes: [] }),
      safeFetch(`/api/source-status?date=${encodeURIComponent(date)}`, { source_status: [] }),
    ]);

    state.hotspots = hotspotsData.hotspots || [];
    state.allHotspots = [...state.hotspots]; // 保存所有热点用于筛选
    state.opportunities = opportunities.opportunities || []; // 保存机会数据

    const hc = document.getElementById("hotspot-count");
    const oc = document.getElementById("opportunity-count");
    const nc = document.getElementById("note-count");
    if (hc) hc.textContent = String(summary.hotspot_count || 0);
    if (oc) oc.textContent = String(summary.opportunity_count || 0);
    if (nc) nc.textContent = String(summary.note_count || 0);

    // 更新筛选器选项
    updateFilterOptions(state.hotspots);

    // 应用当前筛选
    applyFilters();

    renderOpportunities(opportunities.opportunities || []);
    renderNotes(notes.notes || []);
    renderSourceStatus(sourceStatus.source_status || []);
    renderNoteHotspotOptions(state.hotspots);
    updateBadges();
    setStatus(`已加载 ${date} 数据 (${state.hotspots.length} 个热点)`);
  } catch (err) {
    console.error('Load data error:', err);
    setStatus(`加载失败：${err.message}`);
    showErrorState(err.message);
  } finally {
    state.isLoading = false;
    hideLoadingState();
  }
}

async function ensureDateHasData() {
  if (!dateInput) return;
  const today = new Date().toISOString().slice(0, 10);
  if (dateInput.value !== today) return;
  try {
    const summaryRes = await fetch(`/api/summary?date=${encodeURIComponent(today)}`);
    const summary = await summaryRes.json();
    if ((summary.hotspot_count || 0) > 0) return;
    const latestRes = await fetch("/api/latest-date");
    const latest = await latestRes.json();
    if (latest.latest_date && latest.latest_date !== today) {
      dateInput.value = latest.latest_date;
      setStatus(`今日暂无数据，已切换到 ${latest.latest_date}`);
    }
  } catch (err) {
    setStatus(`日期自动切换失败：${err.message}`);
  }
}

async function collect() {
  const collectBtn = document.getElementById("collect-btn");
  if (state.isLoading) return; // 防止重复点击

  state.isLoading = true;
  setStatus("正在抓取，请稍候...");

  // 禁用按钮
  if (collectBtn) {
    collectBtn.disabled = true;
    collectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>抓取中...</span>';
  }

  try {
    const res = await fetch("/api/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "抓取失败");

    setStatus(`抓取完成：热点 ${data.hotspots_count} 条，机会 ${data.opportunities_count} 条`);
    await ensureDateHasData();
    await loadData();
  } catch (err) {
    console.error('Collect error:', err);
    setStatus(`抓取失败：${err.message}`);
    alert(`抓取失败：${err.message}`);
  } finally {
    state.isLoading = false;
    // 恢复按钮
    if (collectBtn) {
      collectBtn.disabled = false;
      collectBtn.innerHTML = '<i class="fas fa-sync-alt"></i><span>收集热点</span>';
    }
  }
}

async function submitNote(event) {
  event.preventDefault();
  const hotspotId = (noteHotspotInput?.value || "").trim();
  const content = (noteContentInput?.value || "").trim();
  const tags = (noteTagsInput?.value || "").trim();
  if (!hotspotId || !content) {
    setStatus("保存失败：热点和内容必填");
    return;
  }
  setStatus("保存笔记中...");
  try {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotspot_id: hotspotId, content, tags }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "保存失败");
    if (noteContentInput) noteContentInput.value = "";
    if (noteTagsInput) noteTagsInput.value = "";
    setStatus(`笔记已保存（${data.note_id}）`);
    await loadData();
  } catch (err) {
    setStatus(`保存失败：${err.message}`);
  }
}

document.getElementById("collect-btn")?.addEventListener("click", collect);
document.getElementById("refresh-btn")?.addEventListener("click", async () => {
  await ensureDateHasData();
  await loadData();
});
dateInput?.addEventListener("change", loadData);
document.getElementById("note-form")?.addEventListener("submit", submitNote);

// 导出功能
function setupExport() {
  const exportHotspotsBtn = document.getElementById('export-hotspots-csv');
  const exportOpportunitiesBtn = document.getElementById('export-opportunities-csv');
  
  if (exportHotspotsBtn) {
    exportHotspotsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportData('hotspots');
    });
  }
  
  if (exportOpportunitiesBtn) {
    exportOpportunitiesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportData('opportunities');
    });
  }
}

function exportData(type) {
  const date = dateInput?.value;
  if (!date) {
    setStatus('请先选择日期');
    alert('请先选择日期');
    return;
  }

  setStatus(`正在导出${type === 'hotspots' ? '热点' : '机会'}数据...`);

  try {
    // 构建导出URL
    const url = `/api/export?date=${encodeURIComponent(date)}&type=${encodeURIComponent(type)}`;

    // 创建隐藏的链接并触发下载
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type === 'hotspots' ? 'ai_hotspots' : 'ai_opportunities'}_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatus(`${type === 'hotspots' ? '热点' : '机会'}数据导出完成`);
  } catch (err) {
    console.error('Export error:', err);
    setStatus(`导出失败：${err.message}`);
    alert(`导出失败：${err.message}`);
  }
}

// 热点详情相关函数
function showHotspotDetail(hotspotId) {
  if (!hotspotId) return;
  
  // 从当前显示的热点中查找
  const hotspot = state.hotspots.find(h => h.id === hotspotId);
  if (!hotspot) {
    // 如果不在当前显示的热点中，尝试从所有热点中查找
    const allHotspot = state.allHotspots.find(h => h.id === hotspotId);
    if (!allHotspot) {
      setStatus('未找到热点详情');
      return;
    }
    renderHotspotDetail(allHotspot);
  } else {
    renderHotspotDetail(hotspot);
  }
}

function renderHotspotDetail(hotspot) {
  if (!hotspotModal || !hotspotModalTitle || !hotspotModalContent) {
    console.error('热点详情模态框元素未找到');
    return;
  }
  
  const tags = (hotspot.tags || []).join(', ');
  const content = hotspot.content || '暂无详细内容';
  const url = hotspot.url || '';
  const createdDate = hotspot.created_at ? new Date(hotspot.created_at).toLocaleString('zh-CN') : '未知时间';
  
  // 计算详细评分
  const innovationScore = calculateInnovationScore(hotspot);
  const commercialScore = calculateCommercialScore(hotspot);
  const totalScore = hotspot.total_score || 5;
  
  // 检查标题是否为中文
  const title = hotspot.title || '';
  const titleZh = hotspot.title_zh || '';

  // 生成智能摘要
  const summary = generateSmartSummary(content, 200);

  // 先显示基本信息，AI摘要异步加载
  const detailHtml = `
    <div class="hotspot-detail">
      <div class="detail-header">
        <div class="title-section">
          <h3>${escapeHtml(title)}</h3>
          ${titleZh ? `<div class="chinese-translation">${escapeHtml(titleZh)}</div>` : ''}
        </div>
        <div class="detail-scores">
          <div class="score-item">
            <span class="score-label">综合评分</span>
            <span class="score-value total">${totalScore}/10</span>
          </div>
          <div class="score-item">
            <span class="score-label">创新度</span>
            <span class="score-value innovation">${innovationScore.toFixed(1)}/10</span>
          </div>
          <div class="score-item">
            <span class="score-label">商业潜力</span>
            <span class="score-value commercial">${commercialScore.toFixed(1)}/10</span>
          </div>
        </div>
      </div>
      
      <div class="detail-meta">
        <div class="meta-item">
          <strong>ID:</strong> ${escapeHtml(hotspot.id)}
        </div>
        <div class="meta-item">
          <strong>分类:</strong> ${escapeHtml(hotspot.category || '未分类')}
        </div>
        <div class="meta-item">
          <strong>标签:</strong> ${escapeHtml(tags || '无标签')}
        </div>
        <div class="meta-item">
          <strong>来源:</strong> ${escapeHtml(hotspot.source || '未知来源')}
        </div>
        <div class="meta-item">
          <strong>发布时间:</strong> ${escapeHtml(createdDate)}
        </div>
      </div>
      
      <div class="detail-content" id="detail-ai-summary">
        <p><em>🤖 正在生成AI摘要...</em></p>
      </div>
      
      ${url ? `
      <div class="detail-actions">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="action-btn primary">
          <i class="fas fa-external-link-alt"></i>
          <span>查看原文</span>
        </a>
      </div>
      ` : ''}
    </div>
  `;
  
  hotspotModalTitle.textContent = '热点详情';
  hotspotModalContent.innerHTML = detailHtml;
  
  // 异步加载AI摘要
  getAISummary(content, title).then(aiSummary => {
    const summaryContainer = document.getElementById('detail-ai-summary');
    if (summaryContainer && aiSummary) {
      summaryContainer.innerHTML = `
        <h4>🤖 AI中文摘要</h4>
        <div class="content-summary" style="color: #2196F3; font-weight: bold;">${escapeHtml(aiSummary)}</div>
      `;
    } else if (summaryContainer) {
      summaryContainer.innerHTML = '';
    }
  });
  
  // 为底部按钮添加事件监听器（每次渲染时重新绑定）
  const closeBtn = document.getElementById('hotspot-modal-close-btn');
  if (closeBtn) {
    closeBtn.onclick = closeHotspotModal;
  }
  
  // 为右上角X按钮添加事件监听器
  const closeXBtn = document.getElementById('hotspot-modal-close');
  if (closeXBtn) {
    closeXBtn.onclick = closeHotspotModal;
  }

  const addNoteBtn = document.getElementById('hotspot-modal-add-note');
  if (addNoteBtn) {
    addNoteBtn.onclick = () => {
      const notesTab = document.querySelector('.tab-btn[data-tab="notes"]');
      if (notesTab) {
        notesTab.click();
      }
      closeHotspotModal();
    };
  }

  // 显示模态框
  hotspotModal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

// 模态框事件监听器标记，防止重复绑定
let hotspotModalEventsSetup = false;

function setupHotspotModalEvents() {
  if (hotspotModalEventsSetup) return; // 防止重复绑定

  // 关闭按钮
  if (hotspotModalClose) {
    hotspotModalClose.addEventListener('click', closeHotspotModal);
  }

  // 点击遮罩层关闭
  if (hotspotModalOverlay) {
    hotspotModalOverlay.addEventListener('click', closeHotspotModal);
  }

  // ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hotspotModal && hotspotModal.style.display === 'block') {
      closeHotspotModal();
    }
  });

  hotspotModalEventsSetup = true;
}

function closeHotspotModal() {
  if (hotspotModal) {
    hotspotModal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
}

// 机会详情功能
function showOpportunityDetail(opportunityId) {
  if (!opportunityId) return;
  
  // 从当前显示的机会中查找
  const opportunity = state.opportunities.find(o => o.id === opportunityId);
  if (!opportunity) {
    setStatus('未找到机会详情');
    return;
  }
  
  renderOpportunityDetail(opportunity);
}

function renderOpportunityDetail(opportunity) {
  // 创建机会详情模态框
  let opportunityModal = document.getElementById('opportunity-modal');
  if (!opportunityModal) {
    opportunityModal = document.createElement('div');
    opportunityModal.id = 'opportunity-modal';
    opportunityModal.className = 'modal';
    opportunityModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">机会详情</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" id="opportunity-modal-content"></div>
      </div>
    `;
    document.body.appendChild(opportunityModal);
    
    // 添加关闭事件
    opportunityModal.querySelector('.modal-close').addEventListener('click', () => {
      opportunityModal.style.display = 'none';
      document.body.style.overflow = 'auto';
    });
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && opportunityModal.style.display === 'block') {
        opportunityModal.style.display = 'none';
        document.body.style.overflow = 'auto';
      }
    });
    
    // 点击背景关闭
    opportunityModal.addEventListener('click', (e) => {
      if (e.target === opportunityModal) {
        opportunityModal.style.display = 'none';
        document.body.style.overflow = 'auto';
      }
    });
  }
  
  const modalContent = document.getElementById('opportunity-modal-content');
  if (!modalContent) return;
  
  // 检查标题是否为中文
  const title = opportunity.title || '';

  const detailHtml = `
    <div class="opportunity-detail">
      <div class="detail-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="detail-scores">
          <div class="score-item">
            <span class="score-label">潜力评分</span>
            <span class="score-value total">${opportunity.potential_score || 0}/100</span>
          </div>
        </div>
      </div>
      
      <div class="detail-meta">
        <div class="meta-item">
          <strong>ID:</strong> ${escapeHtml(opportunity.id)}
        </div>
        <div class="meta-item">
          <strong>领域:</strong> ${escapeHtml(opportunity.category || '未分类')}
        </div>
        <div class="meta-item">
          <strong>竞争程度:</strong> ${escapeHtml(opportunity.competition_level || '未知')}
        </div>
        <div class="meta-item">
          <strong>所需资源:</strong> ${escapeHtml(opportunity.resources_needed || '未指定')}
        </div>
        <div class="meta-item">
          <strong>时间线:</strong> ${escapeHtml(opportunity.timeline || '未指定')}
        </div>
        ${opportunity.created_at ? `
        <div class="meta-item">
          <strong>创建时间:</strong> ${escapeHtml(new Date(opportunity.created_at).toLocaleString('zh-CN'))}
        </div>
        ` : ''}
      </div>
      
      <div class="detail-content">
        <h4>详细描述</h4>
        <div class="content-text">${escapeHtml(opportunity.description || '暂无详细描述')}</div>
      </div>
      
      ${opportunity.hotspot_id ? `
      <div class="detail-actions">
        <button class="action-btn primary view-source-btn" data-hotspot-id="${escapeHtml(opportunity.hotspot_id)}">
          <i class="fas fa-link"></i>
          <span>查看来源热点</span>
        </button>
      </div>
      ` : ''}
    </div>
  `;
  
  modalContent.innerHTML = detailHtml;
  
  // 添加查看来源热点按钮事件
  const viewSourceBtn = modalContent.querySelector('.view-source-btn');
  if (viewSourceBtn) {
    viewSourceBtn.addEventListener('click', () => {
      const hotspotId = viewSourceBtn.getAttribute('data-hotspot-id');
      opportunityModal.style.display = 'none';
      document.body.style.overflow = 'auto';
      if (hotspotId) {
        showHotspotDetail(hotspotId);
      }
    });
  }
  
  // 显示模态框
  opportunityModal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

// 初始化热点详情模态框
function initHotspotModal() {
  if (hotspotModal) {
    // 确保模态框初始状态是隐藏的
    hotspotModal.style.display = 'none';
  }
}

// 获取中文翻译（简化版本，实际应用中应该调用翻译API）
function getChineseTranslation(text) {
  if (!text) return '暂无翻译';
  
  // 如果已经是中文，不需要翻译
  if (/[\u4e00-\u9fff]/.test(text)) {
    return text; // 返回原文本，因为已经是中文
  }
  
  // 简单的翻译映射表（实际应用中应该使用翻译API）
  const translations = {
    'GPT-5': 'GPT-5（第五代生成式预训练模型）',
    'OpenAI': 'OpenAI（人工智能研究公司）',
    'AI': '人工智能',
    'machine learning': '机器学习',
    'deep learning': '深度学习',
    'neural network': '神经网络',
    'computer vision': '计算机视觉',
    'natural language processing': '自然语言处理',
    'NLP': '自然语言处理',
    'LLM': '大语言模型',
    'multimodal': '多模态',
    'startup': '初创公司',
    'funding': '融资',
    'investment': '投资',
    'venture capital': '风险投资',
    'product launch': '产品发布',
    'technology breakthrough': '技术突破',
    'open source': '开源',
    'hardware': '硬件',
    'market opportunity': '市场机会',
    'Google': '谷歌',
    'Microsoft': '微软',
    'Meta': 'Meta（原Facebook）',
    'NVIDIA': '英伟达',
    'DeepMind': 'DeepMind（谷歌旗下AI公司）',
    'reinforcement learning': '强化学习',
    'generative AI': '生成式人工智能',
    'transformer': 'Transformer模型',
    'diffusion model': '扩散模型',
    'autonomous driving': '自动驾驶',
    'robotics': '机器人技术',
    'quantum computing': '量子计算',
    'edge computing': '边缘计算',
    'cloud computing': '云计算',
    'big data': '大数据',
    'data mining': '数据挖掘',
    'computer science': '计算机科学',
    'software engineering': '软件工程',
    'algorithm': '算法',
    'optimization': '优化',
    'benchmark': '基准测试',
    'performance': '性能',
    'efficiency': '效率',
    'accuracy': '准确率',
    'precision': '精确率',
    'recall': '召回率',
    'F1 score': 'F1分数',
    'forecasting': '预测',
    'scientific': '科学',
    'contributions': '贡献',
    'benchmark': '基准测试',
    'arxiv': 'arXiv预印本',
    'announce': '宣布',
    'type': '类型',
    'abstract': '摘要',
    'systems': '系统',
    'trained': '训练',
    'record': '记录',
    'can': '能够',
    'predict': '预测',
    'future': '未来',
    'impact': '影响',
    'research': '研究',
    'papers': '论文',
    'introduce': '介绍',
    'prescience': '预科学',
    'first': '首个',
    'large-scale': '大规模',
    'evaluation': '评估',
    'framework': '框架',
    'designed': '设计',
    'specifically': '专门',
    'task': '任务',
    'paper': '论文',
    'will': '将',
    'have': '有',
    'on': '在',
    'the': '',
    'a': '一个',
    'an': '一个',
    'and': '和',
    'or': '或',
    'for': '为',
    'to': '到',
    'in': '在',
    'of': '的',
    'with': '具有',
    'by': '通过',
    'at': '在',
    'from': '从',
    'as': '作为',
    'into': '进入',
    'through': '通过',
    'during': '在...期间',
    'including': '包括',
    'within': '在...内',
    'without': '没有',
    'under': '在...下',
    'over': '超过',
    'between': '在...之间',
    'among': '在...之中',
    'throughout': '贯穿',
    'against': '反对',
    'toward': '朝向',
    'upon': '在...上',
    'about': '关于',
    'like': '像',
    'through': '通过',
    'after': '之后',
    'before': '之前',
    'since': '自从',
    'while': '当...时',
    'where': '哪里',
    'why': '为什么',
    'how': '如何',
    'what': '什么',
    'which': '哪个',
    'who': '谁',
    'whom': '谁',
    'whose': '谁的',
    'when': '何时',
    'new': '新的',
    'old': '旧的',
    'good': '好的',
    'bad': '坏的',
    'big': '大的',
    'small': '小的',
    'high': '高的',
    'low': '低的',
    'long': '长的',
    'short': '短的',
    'fast': '快的',
    'slow': '慢的',
    'hard': '硬的',
    'soft': '软的',
    'hot': '热的',
    'cold': '冷的',
    'young': '年轻的',
    'old': '年老的',
    'rich': '富有的',
    'poor': '贫穷的',
    'strong': '强大的',
    'weak': '弱小的',
    'heavy': '重的',
    'light': '轻的',
    'dark': '黑暗的',
    'bright': '明亮的',
    'clean': '干净的',
    'dirty': '脏的',
    'dry': '干燥的',
    'wet': '湿润的',
    'sweet': '甜的',
    'sour': '酸的',
    'bitter': '苦的',
    'salty': '咸的',
    'spicy': '辣的'
  };
  
  // 检查是否有直接匹配
  const lowerText = text.toLowerCase();
  let translatedText = text;
  
  // 首先尝试完整匹配
  for (const [key, value] of Object.entries(translations)) {
    const regex = new RegExp(`\\b${key.toLowerCase()}\\b`, 'gi');
    if (regex.test(lowerText)) {
      translatedText = translatedText.replace(regex, value);
    }
  }
  
  // 如果翻译后文本有变化，返回翻译结果
  if (translatedText !== text) {
    return translatedText;
  }
  
  // 如果没有匹配，尝试提取主要名词进行翻译
  const words = text.split(/[\s\-_]+/);
  let translatedWords = [];
  
  for (const word of words) {
    if (word.length > 1) { // 只处理长度大于1的单词
      const lowerWord = word.toLowerCase();
      let translated = false;
      
      for (const [key, value] of Object.entries(translations)) {
        if (lowerWord === key.toLowerCase()) {
          translatedWords.push(value);
          translated = true;
          break;
        }
      }
      
      if (!translated) {
        translatedWords.push(word);
      }
    } else {
      translatedWords.push(word);
    }
  }
  
  const result = translatedWords.join(' ');
  return result !== text ? result : '（中文翻译待完善）';
}

// 智能摘要函数：根据内容语言生成摘要
function generateSmartSummary(content, maxLength = 120) {
  if (!content) return '';
  
  // 检测内容语言（简单检测：是否包含中文字符）
  const isChinese = /[\u4e00-\u9fff]/.test(content);
  
  // 如果内容长度合适，直接返回
  if (content.length <= maxLength) {
    return content + (isChinese ? '' : ' (英文)');
  }
  
  if (isChinese) {
    // 中文内容：尝试找到句号、问号、感叹号等标点作为句子边界
    const sentenceEndings = /[。！？]/;
    const sentences = content.split(sentenceEndings).filter(s => s.trim().length > 0);
    
    if (sentences.length > 0) {
      // 返回第一个完整的句子
      const firstSentence = sentences[0].trim();
      if (firstSentence.length <= maxLength) {
        return firstSentence + (firstSentence.length < content.length ? '...' : '');
      }
    }
  } else {
    // 英文内容：尝试找到句号、问号、感叹号等标点作为句子边界
    const sentenceEndings = /[.!?]/;
    const sentences = content.split(sentenceEndings).filter(s => s.trim().length > 0);
    
    if (sentences.length > 0) {
      // 返回第一个完整的句子
      const firstSentence = sentences[0].trim();
      if (firstSentence.length <= maxLength) {
        return firstSentence + (firstSentence.length < content.length ? '...' : '') + ' (英文)';
      }
    }
  }
  
  // 如果没有找到合适的句子边界，简单截取
  const summary = content.slice(0, maxLength) + '...';
  return isChinese ? summary : summary + ' (英文)';
}

// AI摘要缓存
const aiSummaryCache = {};

// 调用AI API生成中文摘要
async function getAISummary(text, title) {
  if (!text || text.length < 10) return null;

  // 检查缓存
  const cacheKey = text.slice(0, 100);
  if (aiSummaryCache[cacheKey]) {
    return aiSummaryCache[cacheKey];
  }

  try {
    const encodedText = encodeURIComponent(text.slice(0, 3000));
    const encodedTitle = encodeURIComponent(title || '');
    const response = await fetch(`/api/generate-summary?text=${encodedText}&title=${encodedTitle}`);

    if (response.ok) {
      const data = await response.json();
      if (data.ok && data.summary) {
        aiSummaryCache[cacheKey] = data.summary;
        return data.summary;
      }
    }
  } catch (e) {
    console.error('获取AI摘要失败:', e);
  }
  return null;
}

// 批量获取AI摘要
async function batchGetAISummaries(items) {
  const promises = items.slice(0, 5).map(async (item) => {
    const text = item.content || '';
    const title = item.title || '';
    const summary = await getAISummary(text, title);
    return { id: item.id, summary };
  });
  return Promise.all(promises);
}

setupTabs();
setupFilterClearButtons();
setupSearch();
setupSorting();
setupExport();
initHotspotModal();
setupSourcesTab();
ensureDateHasData().then(loadData);

// ============================================================
// 信息源管理
// ============================================================

const SOURCE_TYPE_LABELS = {
  wechat: '微信公众号',
  rss: 'RSS订阅',
  twitter: 'Twitter博主',
  official_blog: '官方研究博客',
  cn_model_lab: '国内模型实验室',
  thought_leader: '思想领袖',
  investment: '投资机构',
  podcast: '播客/平台',
  industry: '产业分析',
};

const SOURCE_TYPE_COLORS = {
  wechat: '#07c160',
  rss: '#ff9500',
  twitter: '#1d9bf0',
  official_blog: '#5856d6',
  cn_model_lab: '#ff3b30',
  thought_leader: '#007aff',
  investment: '#34c759',
  podcast: '#af52de',
  industry: '#ff6b35',
};

const sourcesState = {
  all: [],
  filtered: [],
  filter: { type: '', search: '' },
};

async function loadSources() {
  const container = document.getElementById('sources-content');
  if (container) {
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>加载信息源...</p></div>';
  }
  try {
    const res = await fetch('/api/sources');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sourcesState.all = data.sources || [];
    applySourcesFilter();
    renderSourcesStats(data.sources || []);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>加载失败：${escapeHtml(err.message)}</p><button class="action-btn primary" onclick="loadSources()">重试</button></div>`;
    }
  }
}

function applySourcesFilter() {
  let filtered = [...sourcesState.all];
  if (sourcesState.filter.type) {
    filtered = filtered.filter(s => s.type === sourcesState.filter.type);
  }
  if (sourcesState.filter.search) {
    const q = sourcesState.filter.search.toLowerCase();
    filtered = filtered.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.note || '').toLowerCase().includes(q) ||
      (s.url || '').toLowerCase().includes(q)
    );
  }
  sourcesState.filtered = filtered;
  renderSources(filtered);
}

function renderSourcesStats(sources) {
  const statsEl = document.getElementById('sources-stats');
  if (!statsEl) return;
  const counts = {};
  sources.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });
  statsEl.innerHTML = Object.entries(counts).map(([cat, cnt]) => `
    <div class="source-stat-chip">
      <span class="source-stat-count">${cnt}</span>
      <span class="source-stat-label">${escapeHtml(cat)}</span>
    </div>
  `).join('');
}

function renderSources(sources) {
  const container = document.getElementById('sources-content');
  if (!container) return;
  if (!sources.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-satellite-dish"></i><p>没有找到匹配的信息源</p></div>';
    return;
  }

  // Group by category
  const groups = {};
  sources.forEach(s => { groups[s.category] = groups[s.category] || []; groups[s.category].push(s); });

  container.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="source-category-section">
      <div class="source-category-header">
        <h3>${escapeHtml(cat)}</h3>
        <span class="source-category-count">${items.length}</span>
      </div>
      <div class="source-cards-grid">
        ${items.map(s => renderSourceCard(s)).join('')}
      </div>
    </div>
  `).join('');

  // Bind events
  container.querySelectorAll('.source-status-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const src = sourcesState.all.find(s => s.id === id);
      if (!src) return;
      const newStatus = src.status === 'active' ? 'inactive' : 'active';
      await updateSource(id, { tags: src.tags || [], status: newStatus, notes: src.notes || '' });
      src.status = newStatus;
      btn.closest('.source-card').querySelector('.source-status-dot').className =
        `source-status-dot ${newStatus === 'active' ? 'active' : 'inactive'}`;
      btn.title = newStatus === 'active' ? '点击停用' : '点击启用';
    });
  });

  container.querySelectorAll('.source-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const src = sourcesState.all.find(s => s.id === id);
      if (!src) return;
      if (!confirm(`确认删除信息源「${src.name}」？`)) return;
      await deleteSource(id);
      sourcesState.all = sourcesState.all.filter(s => s.id !== id);
      applySourcesFilter();
      renderSourcesStats(sourcesState.all);
    });
  });

  container.querySelectorAll('.source-tag-add-input').forEach(input => {
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const id = input.dataset.id;
      const tag = input.value.trim();
      if (!tag) return;
      const src = sourcesState.all.find(s => s.id === id);
      if (!src) return;
      const tags = [...(src.tags || [])];
      if (!tags.includes(tag)) {
        tags.push(tag);
        await updateSource(id, { tags, status: src.status || 'active', notes: src.notes || '' });
        src.tags = tags;
        input.value = '';
        const tagsContainer = input.closest('.source-tags-row').querySelector('.source-tags-list');
        tagsContainer.innerHTML = renderTagsList(src);
        bindTagRemove(tagsContainer, src);
      }
    });
  });

  container.querySelectorAll('.source-tag-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const tag = btn.dataset.tag;
      const src = sourcesState.all.find(s => s.id === id);
      if (!src) return;
      const tags = (src.tags || []).filter(t => t !== tag);
      await updateSource(id, { tags, status: src.status || 'active', notes: src.notes || '' });
      src.tags = tags;
      btn.closest('.source-tag-item').remove();
    });
  });
}

function renderTagsList(src) {
  return (src.tags || []).map(tag => `
    <span class="source-tag-item">
      ${escapeHtml(tag)}
      <button class="source-tag-remove" data-id="${escapeHtml(src.id)}" data-tag="${escapeHtml(tag)}" title="删除标签">&times;</button>
    </span>
  `).join('');
}

function bindTagRemove(container, src) {
  container.querySelectorAll('.source-tag-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tag = btn.dataset.tag;
      const tags = (src.tags || []).filter(t => t !== tag);
      await updateSource(src.id, { tags, status: src.status || 'active', notes: src.notes || '' });
      src.tags = tags;
      btn.closest('.source-tag-item').remove();
    });
  });
}

function renderSourceCard(src) {
  const color = SOURCE_TYPE_COLORS[src.type] || '#86868b';
  const label = SOURCE_TYPE_LABELS[src.type] || src.type;
  const isActive = src.status !== 'inactive';
  const urlHtml = src.url
    ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="source-url" title="${escapeHtml(src.url)}">${escapeHtml(src.url.replace(/^https?:\/\//, '').split('/')[0])}</a>`
    : '';
  const noteHtml = src.note ? `<p class="source-note">${escapeHtml(src.note)}</p>` : '';

  return `
    <div class="source-card ${isActive ? '' : 'source-inactive'}">
      <div class="source-card-header">
        <div class="source-card-title-row">
          <span class="source-status-dot ${isActive ? 'active' : 'inactive'}" title="${isActive ? '活跃' : '停用'}"></span>
          <span class="source-name">${escapeHtml(src.name)}</span>
        </div>
        <div class="source-card-actions">
          <span class="source-type-badge" style="background:${color};">${escapeHtml(label)}</span>
          <button class="source-status-toggle icon-btn" data-id="${escapeHtml(src.id)}" title="${isActive ? '点击停用' : '点击启用'}">
            <i class="fas fa-${isActive ? 'toggle-on' : 'toggle-off'}"></i>
          </button>
          <button class="source-delete-btn icon-btn" data-id="${escapeHtml(src.id)}" title="删除">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
      ${urlHtml ? `<div class="source-url-row">${urlHtml}</div>` : ''}
      ${noteHtml}
      <div class="source-tags-row">
        <div class="source-tags-list">${renderTagsList(src)}</div>
        <input class="source-tag-add-input" data-id="${escapeHtml(src.id)}" placeholder="+ 添加标签 Enter" type="text">
      </div>
    </div>
  `;
}

async function updateSource(id, payload) {
  try {
    await fetch(`/api/sources/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('updateSource error:', err);
  }
}

async function deleteSource(id) {
  try {
    await fetch(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    console.error('deleteSource error:', err);
  }
}

function setupSourcesTab() {
  // Load sources when tab is clicked
  document.querySelector('.tab-btn[data-tab="sources"]')?.addEventListener('click', () => {
    if (!sourcesState.all.length) loadSources();
  });

  // Search
  document.getElementById('sources-search-input')?.addEventListener('input', (e) => {
    sourcesState.filter.search = e.target.value.trim();
    applySourcesFilter();
  });

  // Type filter
  document.getElementById('sources-type-filter')?.addEventListener('change', (e) => {
    sourcesState.filter.type = e.target.value;
    applySourcesFilter();
  });

  // Add source modal
  const modal = document.getElementById('add-source-modal');
  const openBtn = document.getElementById('add-source-btn');
  const closeBtn = document.getElementById('add-source-modal-close');
  const cancelBtn = document.getElementById('cancel-add-source');
  const overlay = document.getElementById('add-source-modal-overlay');

  openBtn?.addEventListener('click', () => { if (modal) modal.style.display = 'block'; });
  closeBtn?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
  cancelBtn?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
  overlay?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

  document.getElementById('add-source-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-source-name')?.value.trim();
    const type = document.getElementById('new-source-type')?.value;
    const url = document.getElementById('new-source-url')?.value.trim();
    const note = document.getElementById('new-source-note')?.value.trim();
    if (!name) { alert('请填写名称'); return; }
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, url, note }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '添加失败');
      if (modal) modal.style.display = 'none';
      document.getElementById('add-source-form')?.reset();
      await loadSources();
    } catch (err) {
      alert(`添加失败：${err.message}`);
    }
  });
}
