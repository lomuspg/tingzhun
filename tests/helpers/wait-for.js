import assert from 'node:assert/strict';

export async function waitFor(condition, description, timeout = 5000) {
 const deadline = performance.now() + timeout;
 while (!await condition()) {
  assert.ok(performance.now() < deadline, `等待超时：${description}`);
  await new Promise(resolve => setTimeout(resolve, 10));
 }
}
