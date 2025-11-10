#!/bin/bash
# Load testing script using k6 or wrk
# Run comprehensive load tests against API endpoints

set -e

echo "====================================="
echo "API Load Testing Suite"
echo "====================================="
echo ""

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:8080}"
DURATION="${TEST_DURATION:-60s}"
VUS="${VIRTUAL_USERS:-100}"
RPS="${TARGET_RPS:-1000}"

echo "Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Duration: $DURATION"
echo "  Virtual Users: $VUS"
echo "  Target RPS: $RPS"
echo ""

# Check if k6 is installed
if command -v k6 &> /dev/null; then
    echo "Using k6 for load testing..."

    cat > /tmp/load_test.js <<EOF
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    vus: ${VUS},
    duration: '${DURATION}',
    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    // Health check
    let healthRes = http.get('${BASE_URL}/health');
    check(healthRes, { 'health status is 200': (r) => r.status === 200 });

    // API endpoint
    let apiRes = http.get('${BASE_URL}/api/v1/configs');
    check(apiRes, {
        'api status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
}
EOF

    k6 run /tmp/load_test.js

elif command -v wrk &> /dev/null; then
    echo "Using wrk for load testing..."

    # Run wrk tests
    echo ""
    echo "Test 1: Health endpoint"
    wrk -t12 -c${VUS} -d${DURATION} ${BASE_URL}/health

    echo ""
    echo "Test 2: API endpoint (GET)"
    wrk -t12 -c${VUS} -d${DURATION} ${BASE_URL}/api/v1/configs

    echo ""
    echo "Test 3: API endpoint (POST)"
    wrk -t12 -c${VUS} -d${DURATION} -s- ${BASE_URL}/api/v1/configs <<LUA
wrk.method = "POST"
wrk.body   = '{"name":"test","model":"claude-3-sonnet"}'
wrk.headers["Content-Type"] = "application/json"
LUA

else
    echo "Error: Neither k6 nor wrk is installed."
    echo "Please install one of them:"
    echo "  k6: https://k6.io/docs/getting-started/installation/"
    echo "  wrk: https://github.com/wg/wrk"
    exit 1
fi

echo ""
echo "====================================="
echo "Load testing complete!"
echo "====================================="
