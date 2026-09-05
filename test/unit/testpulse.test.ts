import { buildTestContext } from './helpers/vitestContext';
import { Case } from '../../src/testpulse';

describe('Case', () => {
  it('records the case key as a testpulse_case_key annotation on context.task.annotations', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42');
    expect(annotations).toEqual([{ message: 'LOGIN-42', type: 'testpulse_case_key' }]);
  });

  it('records platform only when supplied', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42', { platform: 'linux' });
    expect(annotations).toEqual([
      { message: 'LOGIN-42', type: 'testpulse_case_key' },
      { message: 'linux', type: 'testpulse_platform' },
    ]);
  });

  it('records version only when supplied', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42', { version: '2.0' });
    expect(annotations).toEqual([
      { message: 'LOGIN-42', type: 'testpulse_case_key' },
      { message: '2.0', type: 'testpulse_version' },
    ]);
  });

  it('records tags only when supplied, joined with commas', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42', { tags: ['smoke', 'auth'] });
    expect(annotations).toEqual([
      { message: 'LOGIN-42', type: 'testpulse_case_key' },
      { message: 'smoke,auth', type: 'testpulse_tags' },
    ]);
  });

  it('records no optional annotations when opts is omitted', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42');
    expect(annotations).toHaveLength(1);
  });

  it('records platform, version, and tags together when all are supplied', async () => {
    const { context, annotations } = buildTestContext();
    await Case(context, 'LOGIN-42', { platform: 'linux', version: '2.0', tags: ['smoke'] });
    expect(annotations).toEqual([
      { message: 'LOGIN-42', type: 'testpulse_case_key' },
      { message: 'linux', type: 'testpulse_platform' },
      { message: '2.0', type: 'testpulse_version' },
      { message: 'smoke', type: 'testpulse_tags' },
    ]);
  });
});
