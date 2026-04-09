/**
 * SystemConfigTab — rules/config only, extracted from AdminPage.
 * Import/export is handled by ImportExportTab.
 */

import { getConfig, updateConfig } from '../config/appConfig.js';
import Toast from '../components/Toast.js';

export class SystemConfigTab {
  constructor(page) {
    this._page = page;
  }

  render(container) {
    const cfg = getConfig();

    container.innerHTML = `
      <div class="card mb-4">
        <div class="card-header">Reputation Thresholds</div>
        <div class="card-body">
          <div class="form-group">
            <label for="cfg-rep-threshold">Minimum Reputation Score (0–100)</label>
            <input id="cfg-rep-threshold" class="form-control" type="number" min="0" max="100" value="${cfg.reputation.threshold}">
            <small style="color:var(--color-text-muted)">Users below this score are flagged for manual review.</small>
          </div>
          <div class="form-group">
            <label>Scoring Weights (must sum to 1.0)</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
              <div>
                <label for="cfg-w-fulfill" style="font-size:0.85em">Fulfillment</label>
                <input id="cfg-w-fulfill" class="form-control" type="number" step="0.05" min="0" max="1" value="${cfg.reputation.weights.fulfillmentRate}">
              </div>
              <div>
                <label for="cfg-w-late" style="font-size:0.85em">Late Rate</label>
                <input id="cfg-w-late" class="form-control" type="number" step="0.05" min="0" max="1" value="${cfg.reputation.weights.lateRate}">
              </div>
              <div>
                <label for="cfg-w-complaint" style="font-size:0.85em">Complaint Rate</label>
                <input id="cfg-w-complaint" class="form-control" type="number" step="0.05" min="0" max="1" value="${cfg.reputation.weights.complaintRate}">
              </div>
            </div>
          </div>
          <div class="form-group">
            <label for="cfg-rep-window">Rolling Window (days)</label>
            <input id="cfg-rep-window" class="form-control" type="number" min="1" value="${cfg.reputation.windowDays}">
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">Moderation SLA</div>
        <div class="card-body">
          <div class="form-group">
            <label for="cfg-sla">Resolution Deadline (days)</label>
            <input id="cfg-sla" class="form-control" type="number" min="1" value="${cfg.moderation.resolutionDeadlineDays}">
            <small style="color:var(--color-text-muted)">Reports not resolved within this period are auto-escalated.</small>
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">Review Limits</div>
        <div class="card-body">
          <div class="form-group">
            <label for="cfg-rev-maxtext">Max Review Text Length (chars)</label>
            <input id="cfg-rev-maxtext" class="form-control" type="number" min="100" value="${cfg.review.maxTextLength}">
          </div>
          <div class="form-group">
            <label for="cfg-rev-maximg">Max Images per Review</label>
            <input id="cfg-rev-maximg" class="form-control" type="number" min="0" max="20" value="${cfg.review.maxImages}">
          </div>
          <div class="form-group">
            <label for="cfg-rev-imgsize">Max Image Size (MB)</label>
            <input id="cfg-rev-imgsize" class="form-control" type="number" min="1" value="${cfg.review.maxImageSizeMB}">
          </div>
          <div class="form-group">
            <label for="cfg-rev-followup">Follow-up Window (days)</label>
            <input id="cfg-rev-followup" class="form-control" type="number" min="1" value="${cfg.review.followUpWindowDays}">
          </div>
        </div>
      </div>

      <div id="cfg-error" class="form-error mb-4"></div>
      <div id="cfg-success" class="mb-4" style="color:var(--color-success);display:none">Configuration saved. All services will use updated values immediately.</div>
      <button class="btn btn-primary" id="btn-save-config">Save Configuration</button>
    `;

    container.querySelector('#btn-save-config').addEventListener('click', () => {
      const errorEl = container.querySelector('#cfg-error');
      const successEl = container.querySelector('#cfg-success');
      errorEl.textContent = '';
      successEl.style.display = 'none';

      const threshold = Number(container.querySelector('#cfg-rep-threshold').value);
      const fulfillment = Number(container.querySelector('#cfg-w-fulfill').value);
      const late = Number(container.querySelector('#cfg-w-late').value);
      const complaint = Number(container.querySelector('#cfg-w-complaint').value);
      const windowDays = Number(container.querySelector('#cfg-rep-window').value);
      const sla = Number(container.querySelector('#cfg-sla').value);
      const maxText = Number(container.querySelector('#cfg-rev-maxtext').value);
      const maxImages = Number(container.querySelector('#cfg-rev-maximg').value);
      const maxImgSize = Number(container.querySelector('#cfg-rev-imgsize').value);
      const followUpDays = Number(container.querySelector('#cfg-rev-followup').value);

      const weightSum = Math.round((fulfillment + late + complaint) * 100) / 100;
      if (Math.abs(weightSum - 1.0) > 0.01) {
        errorEl.textContent = `Scoring weights must sum to 1.0 (current: ${weightSum}).`;
        return;
      }
      if (threshold < 0 || threshold > 100) {
        errorEl.textContent = 'Reputation threshold must be between 0 and 100.';
        return;
      }

      updateConfig({
        reputation: {
          threshold,
          windowDays,
          weights: { fulfillmentRate: fulfillment, lateRate: late, complaintRate: complaint },
        },
        moderation: { resolutionDeadlineDays: sla },
        review: { maxTextLength: maxText, maxImages, maxImageSizeMB: maxImgSize, followUpWindowDays: followUpDays },
      });

      successEl.style.display = 'block';
      Toast.success('Configuration updated. Changes take effect immediately.');
    });
  }
}

export default SystemConfigTab;
