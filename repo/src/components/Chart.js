/**
 * Chart — simple bar/horizontal chart using pure CSS + HTML.
 * No external libraries.
 */

import { escapeHtml } from '../utils/helpers.js';

export class Chart {
  /**
   * Render a simple horizontal bar chart.
   * @param {HTMLElement} container
   * @param {object} config
   * @param {string} config.title
   * @param {Array<{label: string, value: number, color?: string}>} config.data
   */
  static bar(container, config) {
    const maxVal = Math.max(...config.data.map(d => d.value), 1);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">${escapeHtml(config.title)}</div>
        <div class="card-body">
          ${config.data.map(d => {
            const pct = Math.round((d.value / maxVal) * 100);
            const color = d.color || 'var(--color-primary)';
            return `
              <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:0.85rem">
                  <span>${escapeHtml(d.label)}</span>
                  <span style="font-weight:600">${d.value}</span>
                </div>
                <div style="background:var(--color-bg);border-radius:4px;height:18px;overflow:hidden">
                  <div style="width:${pct}%;background:${color};height:100%;border-radius:4px;transition:width 300ms ease"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a simple donut/percentage display.
   */
  static percentage(container, config) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">${escapeHtml(config.title)}</div>
        <div class="card-body text-center" style="padding:30px">
          <div style="font-size:3rem;font-weight:700;color:var(--color-primary)">${config.value}%</div>
          <div style="color:var(--color-text-secondary);margin-top:4px">${escapeHtml(config.subtitle || '')}</div>
        </div>
      </div>
    `;
  }
}

export default Chart;
