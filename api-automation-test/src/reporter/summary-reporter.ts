import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

type RecordedTest = {
    title: string;
    status: TestResult['status'];
};

// Prints a short, fixed-format summary after every run, on top of whatever
// other reporters (list/html) are configured. Keyed by test.id so a retried
// test's final attempt overwrites any earlier attempt, rather than double
// counting.
export default class SummaryReporter implements Reporter {
    private readonly results = new Map<string, RecordedTest>();

    onTestEnd(test: TestCase, result: TestResult): void {
        this.results.set(test.id, {
            title: test.titlePath().slice(2).join(' › '),
            status: result.status,
        });
    }

    onEnd(_result: FullResult): void {
        const all = Array.from(this.results.values());
        const passed = all.filter((t) => t.status === 'passed');
        const failed = all.filter((t) => t.status !== 'passed');

        const lines = [
            '',
            `Number of test steps (tests): ${all.length}`,
            `Tests passed: ${passed.length}`,
            `Tests failed: ${failed.length}`,
            'Failed tests, in order:',
            ...(failed.length === 0 ? ['  (none)'] : failed.map((t, i) => `  ${i + 1}. ${t.title}`)),
            '',
        ];

        console.log(lines.join('\n'));
    }
}
