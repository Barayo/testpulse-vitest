import { test } from 'vitest';
import { Case } from '../../../../dist';

test('login test', async (context) => {
  await Case(context, 'LOGIN-1');
});
