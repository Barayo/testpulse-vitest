import { test } from 'vitest';
import { Case } from '../../../../dist';

test('a passing test whose case key will not match any existing case', async (context) => {
  await Case(context, 'LOGIN-42');
});
