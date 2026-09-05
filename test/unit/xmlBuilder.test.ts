import { buildJUnitXmlFromTestCases, TestCaseLike } from '../../src/xmlBuilder';

function makeTestCase(overrides: Partial<TestCaseLike> = {}): TestCaseLike {
  return {
    name: 'a test',
    annotations: () => [],
    result: () => ({ state: 'passed', errors: undefined }),
    diagnostic: () => ({ duration: 12 }),
    ...overrides,
  };
}

describe('buildJUnitXmlFromTestCases', () => {
  it('produces <testsuites><testsuite><testcase> with properties from testpulse_* annotations', () => {
    const testCase = makeTestCase({
      name: 'succeeds',
      annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }],
    });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'login.spec.ts', testCases: [testCase] }]);

    expect(xml).toContain('<testsuites>');
    expect(xml).toContain('<testsuite name="login.spec.ts"');
    expect(xml).toContain('<testcase classname="login.spec.ts" name="succeeds"');
    expect(xml).toContain('<properties>');
    expect(xml).toContain('<property name="testpulse_case_key" value="LOGIN-42"/>');
  });

  it('a test result with no testpulse_case_key property produces a <testcase> with no <properties> block', () => {
    const testCase = makeTestCase({ name: 'untagged', annotations: () => [] });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'login.spec.ts', testCases: [testCase] }]);

    const testcaseMatch = xml.match(/<testcase[^>]*name="untagged"[^>]*\/?>[\s\S]*?(<\/testcase>|\/>)/);
    expect(testcaseMatch).not.toBeNull();
    expect(testcaseMatch![0]).not.toContain('<properties>');
  });

  it('a failed test produces a <failure> child element with the failure message', () => {
    const testCase = makeTestCase({
      name: 'fails',
      result: () => ({ state: 'failed', errors: [{ message: 'expected true to be false', stack: 'at x.ts:1' }] }),
    });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'login.spec.ts', testCases: [testCase] }]);

    expect(xml).toContain('<failure message="expected true to be false">');
    expect(xml).toContain('at x.ts:1');
  });

  it('a skipped test produces a <skipped/> child', () => {
    const testCase = makeTestCase({ name: 'skipped one', result: () => ({ state: 'skipped', errors: undefined }) });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'login.spec.ts', testCases: [testCase] }]);

    expect(xml).toContain('<skipped/>');
  });

  it('escapes XML metacharacters in test name, classname, failure message/stack, and property values', () => {
    const testCase = makeTestCase({
      name: 'contains <bad> & "quoted" \'chars\'',
      annotations: () => [{ message: 'LOGIN-<42>&"\'', type: 'testpulse_case_key' }],
      result: () => ({
        state: 'failed',
        errors: [{ message: '</failure><property name="testpulse_case_key" value="OTHER-1"/>', stack: ']]>bad' }],
      }),
    });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'a & b.spec.ts', testCases: [testCase] }]);

    expect(xml).not.toContain('<bad>');
    expect(xml).toContain('&lt;bad&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;quoted&quot;');
    expect(xml).toContain('&apos;chars&apos;');
    expect(xml).toContain('value="LOGIN-&lt;42&gt;&amp;&quot;&apos;"');
    // The forged sibling element must not appear as real markup -- only
    // as escaped literal text. A single well-formed document has exactly
    // one <properties> block and one <failure> element for this testcase.
    expect(xml.match(/<properties>/g)).toHaveLength(1);
    expect(xml).toContain('&lt;/failure&gt;&lt;property name=&quot;testpulse_case_key&quot; value=&quot;OTHER-1&quot;/&gt;');
    expect(xml).toContain('&gt;bad'); // `]]>` escaped: `]]&gt;`
  });

  it('case keys from multiple test files are all included in one submission, attributed to their own file\'s testsuite', () => {
    const loginCase = makeTestCase({
      name: 'login test',
      annotations: () => [{ message: 'LOGIN-1', type: 'testpulse_case_key' }],
    });
    const signupCase = makeTestCase({
      name: 'signup test',
      annotations: () => [{ message: 'SIGNUP-1', type: 'testpulse_case_key' }],
    });
    const xml = buildJUnitXmlFromTestCases([
      { suiteName: 'login.spec.ts', testCases: [loginCase] },
      { suiteName: 'signup.spec.ts', testCases: [signupCase] },
    ]);

    expect(xml.match(/<testsuite /g)).toHaveLength(2);
    expect(xml).toContain('<testsuite name="login.spec.ts"');
    expect(xml).toContain('<testsuite name="signup.spec.ts"');
    const loginSuite = xml.split('<testsuite name="login.spec.ts"')[1].split('</testsuite>')[0];
    expect(loginSuite).toContain('LOGIN-1');
    expect(loginSuite).not.toContain('SIGNUP-1');
  });

  it('records optional platform/version/tags properties only when annotated', () => {
    const testCase = makeTestCase({
      annotations: () => [
        { message: 'LOGIN-42', type: 'testpulse_case_key' },
        { message: 'linux', type: 'testpulse_platform' },
        { message: 'smoke,auth', type: 'testpulse_tags' },
      ],
    });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'login.spec.ts', testCases: [testCase] }]);

    expect(xml).toContain('<property name="testpulse_platform" value="linux"/>');
    expect(xml).toContain('<property name="testpulse_tags" value="smoke,auth"/>');
    expect(xml).not.toContain('testpulse_version');
  });

  it('excludes testpulse_attachment annotations from the <properties> block', () => {
    const testCase = makeTestCase({
      annotations: () => [
        { message: 'LOGIN-42', type: 'testpulse_case_key' },
        { message: 'shot.png', type: 'testpulse_attachment', attachment: { body: 'abc', contentType: 'image/png' } },
      ],
    });
    const xml = buildJUnitXmlFromTestCases([{ suiteName: 'login.spec.ts', testCases: [testCase] }]);

    expect(xml).not.toContain('testpulse_attachment');
  });
});
