#!/bin/bash
# ============================================================
# TrainingOps — Test Runner
# Executes ALL tests: unit_tests/, API_tests/, e2e_tests/
# Exit code: 0 if all pass, 1 if any fail
# ============================================================

set -e

echo "=============================================="
echo " TrainingOps Test Suite"
echo "=============================================="
echo ""
echo " Test directories:"
echo "   unit_tests/  — Unit tests for individual services"
echo "   API_tests/   — Cross-service workflow/integration tests"
echo "   e2e_tests/   — End-to-end user journey tests"
echo ""

node run_tests.js
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "ALL TESTS PASSED"
else
  echo ""
  echo "SOME TESTS FAILED"
fi

exit $EXIT_CODE
