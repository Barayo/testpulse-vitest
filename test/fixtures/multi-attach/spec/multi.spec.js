import { test } from 'vitest';
import { Case, Attach } from '../../../../dist';

test('attaches twice', async (context) => {
  await Case(context, 'LOGIN-45');
  await Attach(context, 'LOGIN-45', Buffer.from([1]), 'a.png', 'image/png');
  await Attach(context, 'LOGIN-45', Buffer.from([2]), 'b.png', 'image/png');
});
