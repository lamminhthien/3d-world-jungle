import { getBenchmarkHistory, clearBenchmarkHistory } from '../core/benchmark.js';

export function setupBenchmarkUI({ benchmarkManager, onStartBenchmark }) {
  // 1. Create live HUD banner (top center during test)
  let liveBanner = document.getElementById('benchmark-live-banner');
  if (!liveBanner) {
    liveBanner = document.createElement('div');
    liveBanner.id = 'benchmark-live-banner';
    liveBanner.className = 'bench-live-banner hidden';
    liveBanner.innerHTML = `
      <div class="bench-live-content">
        <div class="bench-live-title">
          <span class="pulse-dot"></span>
          <span id="bench-phase-name">Running Benchmark...</span>
        </div>
        <div class="bench-live-stats">
          <span id="bench-live-fps">60 FPS</span>
          <span id="bench-live-time">0s / 27s</span>
        </div>
        <div class="bench-progress-bar">
          <div id="bench-progress-fill" style="width: 0%"></div>
        </div>
      </div>
      <button id="bench-cancel-btn" class="bench-cancel-btn" title="Cancel benchmark">✕ Stop</button>
    `;
    document.body.appendChild(liveBanner);
  }

  // 2. Create results modal
  let modal = document.getElementById('benchmark-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'benchmark-modal';
    modal.className = 'bench-modal hidden';
    modal.innerHTML = `
      <div class="bench-modal-backdrop"></div>
      <div class="bench-modal-dialog">
        <div class="bench-modal-header">
          <h2>⚡ Benchmark Results</h2>
          <button id="bench-modal-close" class="bench-close-btn">&times;</button>
        </div>
        <div class="bench-modal-body" id="bench-modal-content">
          <!-- Content injected here -->
        </div>
        <div class="bench-modal-footer">
          <button id="bench-modal-history" class="bench-btn secondary">📜 Past Runs</button>
          <button id="bench-modal-rerun" class="bench-btn primary">🔄 Run Again</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const phaseNameEl = document.getElementById('bench-phase-name');
  const liveFpsEl = document.getElementById('bench-live-fps');
  const liveTimeEl = document.getElementById('bench-live-time');
  const progressFillEl = document.getElementById('bench-progress-fill');
  const cancelBtn = document.getElementById('bench-cancel-btn');

  const modalCloseBtn = document.getElementById('bench-modal-close');
  const modalHistoryBtn = document.getElementById('bench-modal-history');
  const modalRerunBtn = document.getElementById('bench-modal-rerun');
  const modalBackdrop = modal.querySelector('.bench-modal-backdrop');
  const modalContent = document.getElementById('bench-modal-content');

  // Cancel logic
  cancelBtn.onclick = () => {
    benchmarkManager.cancel();
    liveBanner.classList.add('hidden');
  };

  // Close modal logic
  const closeModal = () => modal.classList.add('hidden');
  modalCloseBtn.onclick = closeModal;
  modalBackdrop.onclick = closeModal;

  // Re-run
  modalRerunBtn.onclick = () => {
    closeModal();
    onStartBenchmark();
  };

  // View history
  modalHistoryBtn.onclick = () => {
    renderHistoryView();
  };

  // Benchmark manager event hooks
  benchmarkManager.onUpdate((status) => {
    liveBanner.classList.remove('hidden');
    if (phaseNameEl) phaseNameEl.textContent = status.phaseName;
    if (liveFpsEl) liveFpsEl.textContent = `${Math.round(status.currentFps)} FPS`;
    if (liveTimeEl) {
      liveTimeEl.textContent = `${Math.round(status.elapsedTime)}s / ${Math.round(status.totalDuration)}s`;
    }
    if (progressFillEl) {
      progressFillEl.style.width = `${Math.round(status.totalProgress * 100)}%`;
    }
  });

  benchmarkManager.onComplete((result) => {
    liveBanner.classList.add('hidden');
    showResultModal(result);
  });

  function showResultModal(result) {
    modal.classList.remove('hidden');
    renderResultView(result);
  }

  function renderResultView(result) {
    const o = result.overall;
    let gradeColor = '#43a047';
    if (result.grade === 'S') gradeColor = '#00c853';
    else if (result.grade === 'A') gradeColor = '#43a047';
    else if (result.grade === 'B') gradeColor = '#fbc02d';
    else if (result.grade === 'C') gradeColor = '#fb8c00';
    else gradeColor = '#e53935';

    let phasesHtml = result.phases
      .map(
        (p) => `
        <div class="bench-phase-row">
          <div class="bench-phase-info">
            <span class="name">${p.name}</span>
          </div>
          <div class="bench-phase-metrics">
            <span class="metric"><b>${p.stats.avgFps}</b> avg fps</span>
            <span class="metric-sub">1% low: ${p.stats.fps1PercentLow} | min: ${p.stats.minFps}</span>
          </div>
        </div>
      `
      )
      .join('');

    modalContent.innerHTML = `
      <div class="bench-summary-card">
        <div class="bench-score-circle" style="border-color: ${gradeColor}">
          <span class="bench-grade" style="color: ${gradeColor}">${result.grade}</span>
          <span class="bench-score">${result.score}</span>
          <span class="bench-tier">${result.tier}</span>
        </div>
        <div class="bench-stat-grid">
          <div class="bench-stat-box">
            <div class="label">Avg FPS</div>
            <div class="value">${o.avgFps}</div>
          </div>
          <div class="bench-stat-box">
            <div class="label">1% Low FPS</div>
            <div class="value">${o.fps1PercentLow}</div>
          </div>
          <div class="bench-stat-box">
            <div class="label">Min FPS</div>
            <div class="value">${o.minFps}</div>
          </div>
          <div class="bench-stat-box">
            <div class="label">Hitches (>50ms)</div>
            <div class="value">${o.hitches}</div>
          </div>
        </div>
      </div>

      <h3 class="bench-section-title">Phase Breakdown</h3>
      <div class="bench-phases-list">
        ${phasesHtml}
      </div>

      <div class="bench-device-info">
        <span>Device DPR: ${result.device.pixelRatio}x</span>
        <span>Resolution: ${result.device.screenWidth}×${result.device.screenHeight}</span>
      </div>
    `;
  }

  function renderHistoryView() {
    const list = getBenchmarkHistory();
    if (!list.length) {
      modalContent.innerHTML = `
        <div class="bench-empty-history">
          <p>No benchmark history yet.</p>
        </div>
      `;
      return;
    }

    const items = list
      .map((item, idx) => {
        const d = new Date(item.date);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString();
        return `
        <div class="bench-history-row" data-idx="${idx}">
          <div class="history-left">
            <span class="history-grade grade-${item.grade}">${item.grade}</span>
            <div>
              <div class="history-score">${item.score} pts &bull; <small>${item.tier}</small></div>
              <div class="history-date">${dateStr} ${timeStr}</div>
            </div>
          </div>
          <div class="history-right">
            <span>${item.overall.avgFps} avg fps</span>
            <span class="sub">1% low: ${item.overall.fps1PercentLow}</span>
          </div>
        </div>
      `;
      })
      .join('');

    modalContent.innerHTML = `
      <div class="bench-history-header">
        <h3 class="bench-section-title">Past Benchmark Runs</h3>
        <button id="bench-clear-history" class="bench-link-btn">Clear All</button>
      </div>
      <div class="bench-history-list">
        ${items}
      </div>
      <button id="bench-back-to-latest" class="bench-link-btn back-btn">&larr; Back to latest result</button>
    `;

    document.getElementById('bench-clear-history').onclick = () => {
      clearBenchmarkHistory();
      renderHistoryView();
    };

    const backBtn = document.getElementById('bench-back-to-latest');
    if (backBtn && list.length > 0) {
      backBtn.onclick = () => renderResultView(list[0]);
    }

    modalContent.querySelectorAll('.bench-history-row').forEach((el) => {
      el.onclick = () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        if (list[idx]) renderResultView(list[idx]);
      };
    });
  }

  return {
    openHistory: () => {
      modal.classList.remove('hidden');
      renderHistoryView();
    },
    openResult: (result) => {
      showResultModal(result);
    },
  };
}
