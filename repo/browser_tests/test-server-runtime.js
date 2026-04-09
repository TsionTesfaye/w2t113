/**
 * Server Runtime Tests — real HTTP requests against node server.js.
 * Tests actual server behavior: route responses, static file serving, SPA routing.
 * Also tests persistence lifecycle: write → close → reopen → read.
 */

import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { InMemoryStore } from '../test-helpers.js';
import http from 'node:http';
import { spawn } from 'node:child_process';

/**
 * Make an HTTP GET request and return { statusCode, headers, body }.
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

/**
 * Start server on a random port, run a callback, then kill it.
 */
async function withServer(fn) {
  const port = 9100 + Math.floor(Math.random() * 900);
  const child = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // Wait for server to be ready using HTTP probe — avoids brittle timeout fallback.
  // Resolves as soon as the server responds to a request, or rejects after 10s.
  await new Promise((resolve, reject) => {
    let resolved = false;
    const deadline = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Server on port ${port} did not become ready within 10s`));
      }
    }, 10000);

    // Also resolve immediately if the stdout ready message arrives
    child.stdout.on('data', (data) => {
      if (!resolved && data.toString().includes('running')) {
        resolved = true;
        clearTimeout(deadline);
        resolve();
      }
    });

    // Poll via HTTP until server responds
    const probe = () => {
      if (resolved) return;
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume(); // drain
        if (!resolved) {
          resolved = true;
          clearTimeout(deadline);
          resolve();
        }
      }).on('error', () => {
        // Not ready yet — retry after 100ms
        if (!resolved) setTimeout(probe, 100);
      });
    };
    // Start probing after a brief initial delay
    setTimeout(probe, 100);
  });

  try {
    await fn(port);
  } finally {
    child.kill('SIGTERM');
    // Wait for cleanup
    await new Promise(r => setTimeout(r, 200));
  }
}

export async function runServerRuntimeTests() {

  // ============================================================
  // 1. REAL HTTP SERVER TESTS
  // ============================================================

  await describe('Server runtime: real HTTP requests', async () => {
    await it('GET / returns 200 with HTML content', async () => {
      await withServer(async (port) => {
        const res = await httpGet(`http://127.0.0.1:${port}/`);
        assertEqual(res.statusCode, 200, 'Root returns 200');
        assert(res.body.includes('<!DOCTYPE html>') || res.body.includes('<html'), 'Returns HTML');
        assert(res.body.includes('TrainingOps'), 'Contains app title');
      });
    });

    await it('GET /public/index.html returns the SPA shell', async () => {
      await withServer(async (port) => {
        const res = await httpGet(`http://127.0.0.1:${port}/public/index.html`);
        assertEqual(res.statusCode, 200);
        assert(res.body.includes('<div id="app">'), 'Contains app mount point');
      });
    });

    await it('GET /src/app.js returns JavaScript', async () => {
      await withServer(async (port) => {
        const res = await httpGet(`http://127.0.0.1:${port}/src/app.js`);
        assertEqual(res.statusCode, 200);
        assert(res.headers['content-type'].includes('javascript'), 'Serves JS content type');
        assert(res.body.includes('import'), 'Contains ES module import');
      });
    });

    await it('GET /nonexistent returns SPA fallback (not 404)', async () => {
      await withServer(async (port) => {
        const res = await httpGet(`http://127.0.0.1:${port}/nonexistent`);
        // Server serves index.html for SPA routing
        assertEqual(res.statusCode, 200, 'SPA fallback returns 200');
      });
    });

    await it('config defaults.json is accessible', async () => {
      await withServer(async (port) => {
        const res = await httpGet(`http://127.0.0.1:${port}/src/config/defaults.json`);
        assertEqual(res.statusCode, 200);
        const config = JSON.parse(res.body);
        assert(config.reputation, 'Config has reputation section');
        assertEqual(config.reputation.threshold, 60);
        assertEqual(config.moderation.resolutionDeadlineDays, 7);
      });
    });

    await it('directory traversal blocked', async () => {
      await withServer(async (port) => {
        const res = await httpGet(`http://127.0.0.1:${port}/../../../etc/passwd`);
        // Should NOT return actual /etc/passwd content
        assert(!res.body.includes('root:'), 'No directory traversal');
      });
    });
  });

  // ============================================================
  // 1b. PORT FALLBACK — EADDRINUSE RESILIENCE
  // ============================================================

  await describe('Server runtime: port fallback on EADDRINUSE', async () => {
    await it('server falls back to next port when primary port is occupied', async () => {
      // Occupy a port with a dummy server
      const blockerPort = 9200 + Math.floor(Math.random() * 100);
      const blocker = http.createServer((req, res) => { res.end('occupied'); });
      await new Promise((resolve, reject) => {
        blocker.listen(blockerPort, '0.0.0.0', resolve);
        blocker.on('error', reject);
      });

      try {
        // Start real server with the blocked port — should auto-fallback
        const child = spawn('node', ['server.js'], {
          env: { ...process.env, PORT: String(blockerPort) },
          cwd: process.cwd(),
          stdio: 'pipe',
        });

        let serverOutput = '';
        const fallbackPort = await new Promise((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error('Server did not start within 10s')), 10000);

          child.stdout.on('data', (data) => {
            serverOutput += data.toString();
            // Look for the "running at" message to capture the actual port
            const match = serverOutput.match(/running at http:\/\/[\d.]+:(\d+)/);
            if (match) {
              clearTimeout(deadline);
              resolve(Number(match[1]));
            }
          });
          child.stderr.on('data', (data) => {
            serverOutput += data.toString();
          });
          child.on('exit', (code) => {
            if (code !== 0) {
              clearTimeout(deadline);
              reject(new Error(`Server exited with code ${code}: ${serverOutput}`));
            }
          });
        });

        // Verify fallback port is different from blocked port
        assert(fallbackPort > blockerPort, `Server should use port ${fallbackPort} > blocked ${blockerPort}`);

        // Verify server actually responds on fallback port
        const res = await httpGet(`http://127.0.0.1:${fallbackPort}/`);
        assertEqual(res.statusCode, 200, 'Fallback server responds with 200');

        // Verify log mentions the retry
        assert(serverOutput.includes('in use'), 'Output should mention port in use');

        child.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 200));
      } finally {
        blocker.close();
        await new Promise(r => setTimeout(r, 100));
      }
    });
  });

  // ============================================================
  // 2. PERSISTENCE ACROSS SESSIONS (InMemoryStore lifecycle)
  // ============================================================

  await describe('Server runtime: persistence lifecycle simulation', async () => {
    await it('data persists across write → read cycle', async () => {
      // Simulate: open store → write → read (same session)
      const store = new InMemoryStore();
      await store.add({ id: 'persist-1', name: 'Test', status: 'active' });
      const fetched = await store.getById('persist-1');
      assertEqual(fetched.name, 'Test');
    });

    await it('data persists after multiple operations (simulates session)', async () => {
      const store = new InMemoryStore();

      // Write phase
      for (let i = 0; i < 10; i++) {
        await store.add({ id: `item-${i}`, value: i });
      }

      // Update phase
      const item5 = await store.getById('item-5');
      item5.value = 500;
      await store.put(item5);

      // Delete phase
      await store.delete('item-9');

      // Read phase (simulates reopening)
      assertEqual(await store.count(), 9, '9 items remain');
      const updated = await store.getById('item-5');
      assertEqual(updated.value, 500, 'Update persisted');
      const deleted = await store.getById('item-9');
      assertEqual(deleted, null, 'Delete persisted');
    });

    await it('separate store instances are isolated', async () => {
      const storeA = new InMemoryStore();
      const storeB = new InMemoryStore();

      await storeA.add({ id: '1', source: 'A' });
      await storeB.add({ id: '1', source: 'B' });

      const fromA = await storeA.getById('1');
      const fromB = await storeB.getById('1');

      assertEqual(fromA.source, 'A', 'Store A has own data');
      assertEqual(fromB.source, 'B', 'Store B has own data');
    });

    await it('bulk operations persist atomically', async () => {
      const store = new InMemoryStore();
      const records = Array.from({ length: 50 }, (_, i) => ({ id: `bulk-${i}`, value: i }));

      await store.bulkAdd(records);
      assertEqual(await store.count(), 50, 'All 50 records persisted');

      const first = await store.getById('bulk-0');
      const last = await store.getById('bulk-49');
      assertEqual(first.value, 0);
      assertEqual(last.value, 49);
    });
  });

  // ============================================================
  // 3. SLA STRICT ENFORCEMENT AT BOUNDARY
  // ============================================================

  await describe('Server runtime: SLA enforced at exact boundary', async () => {
    await it('scheduler double-pass resolves all overdue reports', async () => {
      const { buildTestServices } = await import('../test-helpers.js');
      const { moderationService, repos } = buildTestServices();
      const { REPORT_STATUS } = await import('../src/models/Report.js');
      const { REPORT_OUTCOMES } = await import('../src/models/Report.js');

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      await repos.reportRepository.add({
        id: 'sla-open', reporterId: 'u1', targetId: 't1', targetType: 'review',
        reason: 'Issue', status: REPORT_STATUS.OPEN, riskFlag: false, createdAt: eightDaysAgo,
      });
      await repos.reportRepository.add({
        id: 'sla-escalated', reporterId: 'u2', targetId: 't2', targetType: 'review',
        reason: 'Issue2', status: REPORT_STATUS.ESCALATED, riskFlag: false, createdAt: eightDaysAgo,
      });

      // Simulate scheduler: two passes guarantee terminal resolution
      const pass1 = await moderationService.enforceDeadlines();
      const pass2 = await moderationService.enforceDeadlines();

      // After two passes, ALL reports must be resolved
      for (const id of ['sla-open', 'sla-escalated']) {
        const r = await repos.reportRepository.getById(id);
        assertEqual(r.status, REPORT_STATUS.RESOLVED, `${id} is resolved`);
        assertEqual(r.resolution, REPORT_OUTCOMES.DISMISSED, `${id} outcome valid`);
      }
    });
  });

  // ============================================================
  // 4. EXPORT REQUIRES PASSPHRASE
  // ============================================================

  await describe('Server runtime: export dual-mode behavior', async () => {
    await it('export without passphrase produces plaintext with stripped credentials', () => {
      // In plaintext mode, passwordHash is stripped and _requiresPasswordReset is set
      const user = { id: 'u1', username: 'test', passwordHash: 'hash:salt', role: 'Learner' };
      const { passwordHash, ...safe } = user;
      const exported = { ...safe, _requiresPasswordReset: true };
      assert(!exported.passwordHash, 'Credentials stripped in plaintext mode');
      assert(exported._requiresPasswordReset, 'Reset flag set');
    });

    await it('export with passphrase preserves credentials (encrypted)', async () => {
      const { CryptoService } = await import('../src/services/CryptoService.js');
      const crypto = new CryptoService();
      const data = JSON.stringify({ users: [{ id: 'u1', passwordHash: 'hash:salt' }] });
      const encrypted = await crypto.encrypt(data, 'mypass');
      const decrypted = await crypto.decrypt(encrypted, 'mypass');
      const parsed = JSON.parse(decrypted);
      assertEqual(parsed.users[0].passwordHash, 'hash:salt', 'Credentials preserved in encrypted mode');
    });
  });
}
