import { test } from 'vitest';
import { Case } from '../../../../dist';

test('signup test', async (context) => {
  await Case(context, 'SIGNUP-1');
});
