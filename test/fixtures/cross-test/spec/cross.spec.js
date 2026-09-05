import { expect, test } from 'vitest';
import { Case, Attach } from '../../../../dist';

test('declares a case key', async (context) => {
  await Case(context, 'LOGIN-42');
});

test("attempts to attach under another test's case key", async (context) => {
  await Case(context, 'LOGIN-43');
  await expect(
    Attach(context, 'LOGIN-42', Buffer.from([1]), 'failure.png', 'image/png'),
  ).rejects.toThrow(/not been declared/);
});
