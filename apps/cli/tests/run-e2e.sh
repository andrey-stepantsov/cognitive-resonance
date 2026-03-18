#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CLI="node $DIR/../bin/cr.js"

# Cleanup past runs
rm -f test1.sqlite test-user.sqlite test-portability.sqlite bundle-alpha.json

echo "Running Scenario 1..."
$CLI simulate $DIR/fixtures/scenario-1.json -d test1.sqlite
$CLI assert $DIR/fixtures/expected-1.json -d test1.sqlite
echo "Scenario 1 Passed!"

echo "Running User Management Scenario..."
$CLI simulate $DIR/fixtures/scenario-user-management.json -d test-user.sqlite
$CLI assert $DIR/fixtures/expected-user-management.json -d test-user.sqlite
echo "User Management Passed!"

echo "Running Portability Pack & Unpack Scenario..."
# Pack the Alpha Release entity from test1.sqlite
$CLI pack "Alpha Release" bundle-alpha.json -d test1.sqlite
# Unpack into a fresh database test-portability.sqlite
$CLI unpack bundle-alpha.json -d test-portability.sqlite
# Assert that the fresh DB matches the expected state
$CLI assert $DIR/fixtures/expected-portability.json -d test-portability.sqlite
echo "Portability Passed!"

echo "All E2E Tests Passed!"
