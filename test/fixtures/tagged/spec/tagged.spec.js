import { test } from 'vitest';
import { Case } from '../../../../dist';

test('login succeeds', async (context) => {
  await Case(context, 'LOGIN-42');
});

test('untagged test', () => {
  // no Case() call
});
