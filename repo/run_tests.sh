#!/bin/bash
# ============================================================
# TrainingOps — Docker Test Runner
# Executes ALL tests entirely within Docker.
# No local Node.js or browser installation required.
#
# Usage:
#   ./run_tests.sh
#
# Exit code: 0 if all pass, 1 if any fail
# ============================================================

set -euo pipefail

echo "=============================================="
echo " TrainingOps — Docker Test Runner"
echo "=============================================="
echo ""
echo " Suites:"
echo "   unit_tests/        Unit + service tests"
echo "   e2e_tests/         Service-layer E2E journeys"
echo "   browser_tests/     Browser simulation tests"
echo "   playwright_tests/  Full browser E2E (Playwright/Chromium)"
echo ""

# Build the test image
echo "Building test image (Dockerfile.test)..."
docker build -f Dockerfile.test -t trainingops-tests . 2>&1

echo ""
echo "Running tests inside Docker..."
echo "----------------------------------------------"
docker run --rm trainingops-tests
EXIT_CODE=$?

echo "----------------------------------------------"
if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "ALL TESTS PASSED"
else
  echo ""
  echo "SOME TESTS FAILED (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
