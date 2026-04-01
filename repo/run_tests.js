/**
 * Unified Test Runner — Executes ALL tests from unit_tests/, API_tests/, e2e_tests/.
 * Run with: node run_tests.js
 */

import { printSummary } from './test-helpers.js';

// Unit tests (unit_tests/)
import { runRegistrationTests } from './unit_tests/test-registration-service.js';
import { runReviewTests } from './unit_tests/test-review-service.js';
import { runQuizTests } from './unit_tests/test-quiz-service.js';
import { runRatingTests, runModerationTests, runReputationTests, runQATests } from './unit_tests/test-rating-moderation-service.js';
import { runCorrectivePassTests } from './unit_tests/test-corrective-pass.js';
import { runGapClosingTests } from './unit_tests/test-gap-closing.js';
import { runFinalPassTests } from './unit_tests/test-final-pass.js';
import { runCompliancePassTests } from './unit_tests/test-compliance-pass.js';
import { runParanoidAuditTests } from './unit_tests/test-paranoid-audit.js';
import { runFullPassTests } from './unit_tests/test-full-pass.js';
import { runFinalHardeningTests } from './unit_tests/test-final-hardening.js';
import { runComprehensiveCoverageTests } from './unit_tests/test-comprehensive-coverage.js';
import { runAcceptanceTests } from './unit_tests/test-acceptance.js';
import { runCoreCorrectionsTests } from './unit_tests/test-core-corrections.js';
import { runFinalAlignmentTests } from './unit_tests/test-final-alignment.js';
import { runStrictEnforcementTests } from './unit_tests/test-strict-enforcement.js';
import { runOperabilityTests } from './unit_tests/test-operability.js';
import { runDeliveryStabilizationTests } from './unit_tests/test-delivery-stabilization.js';
import { runBlockerFixTests } from './unit_tests/test-blocker-fixes.js';
import { runSecondaryHardeningTests } from './unit_tests/test-secondary-hardening.js';
import { runGapClosingFinalTests } from './unit_tests/test-gap-closing-final.js';
import { runSecurityHardeningFinalTests } from './unit_tests/test-security-hardening-final.js';

// API / Integration tests (API_tests/)
import { runRegistrationLifecycleTests } from './API_tests/test-registration-lifecycle.js';
import { runReviewModerationFlowTests } from './API_tests/test-review-moderation-flow.js';
import { runContractSigningFlowTests } from './API_tests/test-contract-signing-flow.js';

// E2E tests (e2e_tests/)
import { runE2ETests } from './e2e_tests/test-user-journeys.js';

// Browser E2E tests (browser_tests/)
import { runBrowserE2ETests } from './browser_tests/test-browser-e2e.js';
import { runComponentRenderTests } from './browser_tests/test-component-render.js';
import { runImportExportTests } from './browser_tests/test-import-export.js';
import { runPersistenceTests } from './browser_tests/test-persistence.js';
import { runRouteEnforcementTests } from './browser_tests/test-route-enforcement.js';
import { runRuntimeVerificationTests } from './browser_tests/test-runtime-verification.js';
import { runServerRuntimeTests } from './browser_tests/test-server-runtime.js';
import { runSmokeTests } from './browser_tests/test-smoke.js';

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  TrainingOps — Full Test Suite                  ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // ---- Unit Tests ----
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  UNIT TESTS (unit_tests/)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await runRegistrationTests();
  await runReviewTests();
  await runQuizTests();
  await runRatingTests();
  await runModerationTests();
  await runReputationTests();
  await runQATests();
  await runCorrectivePassTests();
  await runGapClosingTests();
  await runFinalPassTests();
  await runCompliancePassTests();
  await runParanoidAuditTests();
  await runFullPassTests();
  await runFinalHardeningTests();
  await runComprehensiveCoverageTests();
  await runAcceptanceTests();
  await runCoreCorrectionsTests();
  await runFinalAlignmentTests();
  await runStrictEnforcementTests();
  await runOperabilityTests();
  await runDeliveryStabilizationTests();
  await runBlockerFixTests();
  await runSecondaryHardeningTests();
  await runGapClosingFinalTests();
  await runSecurityHardeningFinalTests();

  // ---- API / Integration Tests ----
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  API TESTS (API_tests/)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await runRegistrationLifecycleTests();
  await runReviewModerationFlowTests();
  await runContractSigningFlowTests();

  // ---- E2E Tests ----
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  E2E TESTS (e2e_tests/)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await runE2ETests();

  // ---- Browser E2E Tests ----
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  BROWSER E2E TESTS (browser_tests/)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await runBrowserE2ETests();
  await runComponentRenderTests();
  await runImportExportTests();
  await runPersistenceTests();
  await runRouteEnforcementTests();
  await runRuntimeVerificationTests();
  await runServerRuntimeTests();
  await runSmokeTests();

  // ---- Summary ----
  const result = printSummary();

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
