import test from 'node:test';
import assert from 'node:assert/strict';
import { createProtectionFrameBudget, runtimeProtectionMapFrameHasBudget } from '../../lib/runtime-protection-frame-budget.ts';

test('cheap sampling grows beyond 512 while cost spikes immediately reduce the limit', () => {
  const budget = createProtectionFrameBudget();
  let limits = budget.begin(0);
  assert.equal(limits.rays, 512);
  for (let i=1; i<=6; i++) {
    budget.finish(limits.rays, 0.8, 1);
    const next = budget.begin(i * 1000 / 60);
    assert.ok(next.rays <= limits.rays * 2 && next.rays <= 8192);
    limits = next;
  }
  assert.equal(limits.rays, 8192);
  budget.finish(100, 8, 8.5);
  limits = budget.begin(120);
  assert.ok(limits.rays < 100);
});

test('deadline applies before 24 samples and while visiting already-cached cells', () => {
  const limits = { rays:8192, milliseconds:2 };
  assert.equal(runtimeProtectionMapFrameHasBudget({sampledRays:0,visitedCells:0,elapsedMs:10,limits}),true);
  assert.equal(runtimeProtectionMapFrameHasBudget({sampledRays:1,visitedCells:1,elapsedMs:2,limits}),false);
  assert.equal(runtimeProtectionMapFrameHasBudget({sampledRays:0,visitedCells:10,elapsedMs:2,limits}),false);
  assert.equal(runtimeProtectionMapFrameHasBudget({sampledRays:0,visitedCells:32768,elapsedMs:0,limits}),false);
});

test('expensive recurring paint reserves time but one-off level setup does not poison later batches', () => {
  const budget = createProtectionFrameBudget();
  assert.equal(budget.begin().milliseconds,6);
  budget.finish(512, 1, 40, true);
  assert.equal(budget.begin().milliseconds,6);
  budget.finish(512, 1, 8);
  assert.ok(budget.begin().milliseconds < 6);
  for(let i=0;i<10;i++)budget.finish(16,1,100);
  assert.equal(budget.begin().milliseconds,2);
  for(let i=0;i<10;i++)budget.finish(512,1,1.5);
  assert.equal(budget.begin().milliseconds,6);
  assert.equal(createProtectionFrameBudget().begin().rays,512);
});

test('coarse timers and invalid measurements remain bounded', () => {
  const budget = createProtectionFrameBudget();
  budget.begin(0);
  budget.finish(512,0,0);
  assert.equal(budget.begin(16).rays,1024);
  budget.finish(512,NaN,Infinity);
  assert.deepEqual(budget.begin(32),{rays:512,milliseconds:2});
});
