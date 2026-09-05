import { expect, test } from 'vitest';
import { Case } from '../../../../dist';

test('a genuinely failing test', async (context) => {
  await Case(context, 'LOGIN-42');
  expect(true).toBe(false);
});
