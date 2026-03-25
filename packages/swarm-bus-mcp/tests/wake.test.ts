import { describe, it, expect } from 'vitest';
import { wakeEndpointToCycleUrl } from '../src/core/wake.js';

describe('wakeEndpointToCycleUrl', () => {
  it('maps orchestrator wake POST to cycle GET', () => {
    expect(wakeEndpointToCycleUrl('http://localhost:3000/api/agents/my-biz--ceo/wake')).toBe(
      'http://localhost:3000/api/agents/my-biz--ceo/cycle',
    );
  });
});
