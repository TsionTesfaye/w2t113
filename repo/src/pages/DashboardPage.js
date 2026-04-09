/**
 * DashboardPage — KPI cards and charts.
 */

import dashboardService from '../services/DashboardService.js';
import authService from '../services/AuthService.js';
import Chart from '../components/Chart.js';

export class DashboardPage {
  constructor(appShell) {
    this.appShell = appShell;
  }

  async render() {
    this.appShell.setPageTitle('Dashboard');
    const container = this.appShell.getContentContainer();

    container.innerHTML = '<p>Loading dashboard...</p>';

    try {
      const user = authService.getCurrentUser();
      const kpis = await dashboardService.getKPIs(user?.id);

      container.innerHTML = `
        <div class="kpi-grid" id="kpi-grid"></div>
        <div class="charts-grid">
          <div id="chart-registrations"></div>
          <div id="chart-approval-rate"></div>
        </div>
      `;

      // KPI Cards
      const kpiData = [
        { label: 'Total Registrations', value: kpis.totalRegistrations ?? 'N/A' },
        { label: 'Pending', value: kpis.pendingRegistrations ?? 'N/A' },
        { label: 'Approved', value: kpis.approvedRegistrations ?? 'N/A' },
        { label: 'Rejected', value: kpis.rejectedRegistrations ?? 'N/A' },
        { label: 'Avg Quiz Score', value: kpis.averageQuizScore != null ? kpis.averageQuizScore + '%' : 'N/A' },
        { label: 'Open Reports', value: kpis.openReports ?? 'N/A' },
        { label: 'Avg Resolution (days)', value: kpis.avgResolutionDays ?? 'N/A' },
        { label: 'Avg Fill Rate', value: kpis.averageFillRate != null ? kpis.averageFillRate + '%' : 'N/A' },
      ];

      const kpiGrid = container.querySelector('#kpi-grid');
      kpiGrid.innerHTML = kpiData.map(k => `
        <div class="kpi-card">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.value}</div>
        </div>
      `).join('');

      // Charts
      Chart.bar(container.querySelector('#chart-registrations'), {
        title: 'Registrations by Status',
        data: [
          { label: 'Approved', value: kpis.approvedRegistrations, color: 'var(--color-success)' },
          { label: 'Rejected', value: kpis.rejectedRegistrations, color: 'var(--color-danger)' },
          { label: 'Pending', value: kpis.pendingRegistrations, color: 'var(--color-warning)' },
        ],
      });

      Chart.percentage(container.querySelector('#chart-approval-rate'), {
        title: 'Approval Rate',
        value: kpis.approvalRate,
        subtitle: 'of all registrations',
      });
    } catch (err) {
      container.innerHTML = `<p class="form-error">Failed to load dashboard: ${err.message}</p>`;
    }
  }
}

export default DashboardPage;
