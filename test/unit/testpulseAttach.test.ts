import { buildTestContext } from './helpers/vitestContext';
import { Case } from '../../src/testpulse';
import { Attach } from '../../src/testpulseAttach';

describe('Attach', () => {
  it('succeeds when the case key matches the current test\'s own Case() call, recording a testpulse_attachment annotation', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42');
    await Attach(context, 'LOGIN-42', Buffer.from([1, 2, 3]), 'failure.png', 'image/png');

    const attachmentAnnotation = annotations.find((a) => a.type === 'testpulse_attachment');
    expect(attachmentAnnotation).toBeDefined();
    expect(attachmentAnnotation!.message).toBe('failure.png');
    expect(attachmentAnnotation!.attachment?.contentType).toBe('image/png');
    expect(attachmentAnnotation!.attachment?.body).toEqual(Buffer.from([1, 2, 3]));
  });

  it('throws and records no attachment annotation when the case key does not match the current test\'s own declared case key', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42');

    await expect(
      Attach(context, 'OTHER-1', Buffer.from([1]), 'failure.png', 'image/png'),
    ).rejects.toThrow(/not been declared/);

    expect(annotations.some((a) => a.type === 'testpulse_attachment')).toBe(false);
  });

  it('throws and records no attachment annotation when the current test never called Case()', async () => {
    const { context, annotations } = buildTestContext();

    await expect(
      Attach(context, 'LOGIN-42', Buffer.from([1]), 'failure.png', 'image/png'),
    ).rejects.toThrow(/not been declared/);

    expect(annotations).toHaveLength(0);
  });

  it('rejects an unsupported content type even for a validly-declared case key', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42');

    await expect(
      Attach(context, 'LOGIN-42', Buffer.from([1]), 'x.pdf', 'application/pdf'),
    ).rejects.toThrow(/unsupported content type/);

    expect(annotations.some((a) => a.type === 'testpulse_attachment')).toBe(false);
  });

  it('validates content type before checking the case key (an unsupported type is rejected even when the case key is also wrong)', async () => {
    const { context } = buildTestContext();
    // No Case() call at all -- both checks would fail, content-type must win.
    await expect(
      Attach(context, 'LOGIN-42', Buffer.from([1]), 'x.pdf', 'application/pdf'),
    ).rejects.toThrow(/unsupported content type/);
  });

  it('preserves two distinct attachments under the same case key within one test, neither overwriting the other', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-45');
    await Attach(context, 'LOGIN-45', Buffer.from([1]), 'a.png', 'image/png');
    await Attach(context, 'LOGIN-45', Buffer.from([2]), 'b.png', 'image/png');

    const attachmentAnnotations = annotations.filter((a) => a.type === 'testpulse_attachment');
    expect(attachmentAnnotations).toHaveLength(2);
    expect(attachmentAnnotations[0].message).toBe('a.png');
    expect(attachmentAnnotations[1].message).toBe('b.png');
  });

  it('accepts image/jpeg and image/webp as well as image/png', async () => {
    const { context } = buildTestContext();
    await Case(context, 'LOGIN-42');
    await expect(
      Attach(context, 'LOGIN-42', Buffer.from([1]), 'a.jpg', 'image/jpeg'),
    ).resolves.not.toThrow();
    await expect(
      Attach(context, 'LOGIN-42', Buffer.from([1]), 'a.webp', 'image/webp'),
    ).resolves.not.toThrow();
  });
});
