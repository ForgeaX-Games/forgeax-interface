import { describe, expect, test } from 'bun:test';
import { providerBadgeFor } from './provider-badge';

describe('providerBadgeFor', () => {
  test('uses the registered DeepSeek Harness product identity', () => {
    expect(providerBadgeFor('deepseek-harness')).toEqual({
      label: 'DeepSeek Harness',
      color: '#4fb6a6',
      title: 'DeepSeek Harness CLI provider',
    });
  });
});
