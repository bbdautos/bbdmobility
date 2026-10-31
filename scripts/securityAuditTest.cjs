const http = require('http');

const PORT = 3001;
const HOST = 'localhost';

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          text: data
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

let passed = 0;
let total = 0;

function assertTest(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS ${passed}] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

async function runSecurityAudit() {
  console.log('========================================================================');
  console.log('    BBD MOBILITY — 20-POINT SECURITY AUDIT VERIFICATION SUITE           ');
  console.log('========================================================================\n');

  // --- CHECKLIST 11: Security Headers ---
  console.log('▶ [CHECKLIST 11] OWASP Security Headers & Fingerprint Removal:');
  const healthRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/health',
    method: 'GET'
  });

  assertTest(!healthRes.headers['x-powered-by'], 'X-Powered-By technology fingerprint header is removed');
  assertTest(healthRes.headers['x-frame-options'] === 'DENY', 'X-Frame-Options set to DENY (clickjacking protection)');
  assertTest(healthRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options set to nosniff (MIME sniffing protection)');
  assertTest(Boolean(healthRes.headers['strict-transport-security']), 'HSTS Strict-Transport-Security header enabled (HTTPS enforcement)');
  assertTest(Boolean(healthRes.headers['content-security-policy']), 'Content-Security-Policy (CSP) header is present and enforced');

  // --- CHECKLIST 15: Exposed File Access Protection ---
  console.log('\n▶ [CHECKLIST 15] Exposed File & Directory Traversal Protection:');
  const envRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/.env',
    method: 'GET'
  });
  assertTest(envRes.statusCode === 403, 'Direct access to /.env is blocked with HTTP 403 Forbidden');

  const gitRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/.git/config',
    method: 'GET'
  });
  assertTest(gitRes.statusCode === 403, 'Direct access to /.git repository files is blocked with HTTP 403 Forbidden');

  // --- CHECKLIST 6 & 7: NoSQL & SQL Injection Neutralization ---
  console.log('\n▶ [CHECKLIST 6 & 7] Input Sanitization & NoSQL/SQL Injection Neutralization:');
  const injectionRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/bookings',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    serviceType: { "$gt": "" }, // Malicious MongoDB operator injection
    pickupLocation: "10 Marina Lagos",
    dropoffLocation: "20 Broad St Lagos",
    senderName: "Test",
    senderPhone: "08012345678",
    receiverName: "Recipient",
    receiverPhone: "08087654321"
  });
  assertTest(injectionRes.statusCode === 400, 'Malicious MongoDB $gt operator injection rejected with HTTP 400 Bad Request');

  // --- CHECKLIST 3, 5 & 9: Route Protection & Authentication Enforcement ---
  console.log('\n▶ [CHECKLIST 3, 5 & 9] Portal Route Protection & RBAC Authentication:');
  const unauthRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/portal/dashboard',
    method: 'GET'
  });
  assertTest(unauthRes.statusCode === 401, 'Unauthenticated request to /api/portal/dashboard rejected with HTTP 401 Unauthorized');

  const unauthAuditRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/portal/audit-logs',
    method: 'GET'
  });
  assertTest(unauthAuditRes.statusCode === 401, 'Unauthenticated request to /api/portal/audit-logs rejected with HTTP 401 Unauthorized');

  // --- CHECKLIST 4 & 8: Account Lockout & IP Rate Limiting on Login ---
  console.log('\n▶ [CHECKLIST 4 & 8] Login IP Rate Limiting & Account Lockout Defense:');
  
  // 1. Valid Admin Login
  const adminLoginRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': '192.168.10.1'
    }
  }, {
    email: 'info@bbdautosng.com',
    password: 'ijeomawadigwe1'
  });

  const adminToken = adminLoginRes.data?.token;
  assertTest(adminLoginRes.statusCode === 200 && Boolean(adminToken), 'Authentic administrator login succeeds with valid JWT token');

  // 2. Authenticated access with token
  const authDashRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/portal/dashboard',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assertTest(authDashRes.statusCode === 200 && authDashRes.data?.stats, 'Authenticated request with JWT bearer token granted full access to dashboard');

  // 3. Rate Limit headers check
  assertTest(Boolean(adminLoginRes.headers['x-ratelimit-limit']), 'X-RateLimit-Limit header returned on login endpoint');
  assertTest(Boolean(adminLoginRes.headers['x-ratelimit-remaining'] !== undefined), 'X-RateLimit-Remaining header tracks remaining attempt quota');

  // 4. IP Rate Limiting Brute-Force Block Test
  console.log('\n▶ IP Rate Limiting Live Verification (Excessive attempts from same IP blocked with HTTP 429):');
  let ipRateLimitBlocked = false;
  const attackIp = '203.0.113.199'; // Distinct test IP
  for (let i = 1; i <= 22; i++) {
    const rateRes = await request({
      hostname: HOST,
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': attackIp
      }
    }, {
      email: 'attacker@evil.com',
      password: 'password123'
    });

    if (rateRes.statusCode === 429 && rateRes.data?.code === 'IP_RATE_LIMIT_EXCEEDED') {
      ipRateLimitBlocked = true;
      break;
    }
  }
  assertTest(ipRateLimitBlocked, 'Single IP exceeding attempt limit is automatically blocked with HTTP 429 Too Many Requests');

  // 5. Account Lockout verification (Distributed attack simulation - rotating IPs)
  console.log('\n▶ Account Lockout Live Verification (Distributed credential attack across rotating IPs):');
  const targetEmail = 'lockout-test-user@bbdmobility.com.ng';
  // Create user in DB for lockout test if not exists
  await request({
    hostname: HOST,
    port: PORT,
    path: '/api/portal/users',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, {
    name: 'Lockout Test User',
    email: targetEmail,
    phone: '08011223344',
    role: 'Support',
    password: 'ValidPassword123!'
  });

  // Reset lockout state before test
  await request({
    hostname: HOST,
    port: PORT,
    path: `/api/portal/users/${targetEmail}/change-password`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  }, { password: 'ValidPassword123!' });

  let lockoutTriggered = false;
  let remainingAttemptsReported = false;

  for (let i = 1; i <= 6; i++) {
    // Each request simulates a distinct IP address (e.g. proxy / VPN rotation)
    const badLoginRes = await request({
      hostname: HOST,
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${i + 50}` 
      }
    }, {
      email: targetEmail,
      password: 'WrongPassword999!'
    });

    if (i < 5) {
      if (badLoginRes.statusCode === 401 && badLoginRes.data?.remainingAttempts !== undefined) {
        remainingAttemptsReported = true;
      }
    } else if (i >= 5) {
      if (badLoginRes.statusCode === 423 && badLoginRes.data?.locked) {
        lockoutTriggered = true;
      }
    }
  }

  assertTest(remainingAttemptsReported, 'Incorrect credentials accurately warn user of remaining attempts before lockout');
  assertTest(lockoutTriggered, '5 consecutive failed attempts lock the account across all IPs with HTTP 423 (15 min countdown)');

  console.log('\n========================================================================');
  console.log(`   SECURITY AUDIT COMPLETE: ${passed} OF ${total} TESTS PASSED!`);
  console.log('========================================================================\n');
}

runSecurityAudit().catch(err => {
  console.error('Security audit fatal error:', err);
  process.exit(1);
});
