#!/bin/bash
# Security scanning script
# Run comprehensive security tests against API

set -e

echo "====================================="
echo "API Security Scanning Suite"
echo "====================================="
echo ""

BASE_URL="${API_BASE_URL:-http://localhost:8080}"

echo "Target: $BASE_URL"
echo ""

# Run Rust tests
echo "1. Running OWASP API Security Top 10 tests..."
cargo test --test security --features security -- --nocapture

echo ""
echo "2. Running authentication security tests..."
cargo test --test auth_security --features security -- --nocapture

echo ""
echo "3. Running penetration tests..."
cargo test --test penetration --features security -- --nocapture

# Additional security checks
echo ""
echo "4. Checking TLS configuration..."
if command -v testssl &> /dev/null; then
    testssl --quiet $BASE_URL
else
    echo "   testssl not installed (optional)"
fi

echo ""
echo "5. Checking security headers..."
curl -I $BASE_URL/health 2>/dev/null | grep -i "x-content-type-options\|x-frame-options\|strict-transport-security\|content-security-policy" || echo "   Warning: Some security headers missing"

echo ""
echo "6. Checking for common vulnerabilities..."
echo "   - SQL Injection: Testing..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/users?id=1' OR '1'='1")
if [ "$RESPONSE" -eq "400" ] || [ "$RESPONSE" -eq "422" ]; then
    echo "     ✓ SQL Injection protection: PASS"
else
    echo "     ✗ SQL Injection protection: FAIL (HTTP $RESPONSE)"
fi

echo "   - XSS: Testing..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/comments" \
    -H "Content-Type: application/json" \
    -d '{"text":"<script>alert(1)</script>"}')
if [ "$RESPONSE" -eq "400" ] || [ "$RESPONSE" -eq "422" ]; then
    echo "     ✓ XSS protection: PASS"
else
    echo "     ✗ XSS protection: FAIL (HTTP $RESPONSE)"
fi

echo "   - Directory Traversal: Testing..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/files/..%2f..%2fetc%2fpasswd")
if [ "$RESPONSE" -eq "400" ] || [ "$RESPONSE" -eq "404" ]; then
    echo "     ✓ Directory Traversal protection: PASS"
else
    echo "     ✗ Directory Traversal protection: FAIL (HTTP $RESPONSE)"
fi

echo ""
echo "7. Authentication & Authorization checks..."
echo "   - Testing unauthenticated access to protected endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/protected")
if [ "$RESPONSE" -eq "401" ]; then
    echo "     ✓ Authentication required: PASS"
else
    echo "     ✗ Authentication required: FAIL (HTTP $RESPONSE)"
fi

echo ""
echo "8. Rate limiting checks..."
echo "   - Testing rate limit enforcement..."
for i in {1..15}; do
    curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/api/v1/expensive" &
done
wait
echo "     Check logs for rate limit responses (429)"

echo ""
echo "====================================="
echo "Security scan complete!"
echo "====================================="
echo ""
echo "Review the results above for any failures."
echo "All security tests should PASS for production deployment."
