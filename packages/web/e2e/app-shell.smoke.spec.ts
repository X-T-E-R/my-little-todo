import { expect, test, type Page } from '@playwright/test';

type ObservedIssue = {
  source: 'console' | 'pageerror' | 'requestfailed' | 'response';
  message: string;
};

const visibleTabs = ['Now', 'Thread', 'Stream', 'Tasks', 'Settings'] as const;
const frontendOrigin = 'http://127.0.0.1:4173';
const backendOrigin = 'http://127.0.0.1:3401';

function trackRuntimeIssues(page: Page): ObservedIssue[] {
  const issues: ObservedIssue[] = [];
  const isAppRequest = (url: string) =>
    url.startsWith(frontendOrigin) || url.startsWith(backendOrigin);

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      issues.push({ source: 'console', message: msg.text() });
    }
  });
  page.on('pageerror', (error) => {
    issues.push({
      source: 'pageerror',
      message: error.stack?.trim() || error.message || String(error),
    });
  });
  page.on('requestfailed', (request) => {
    if (!isAppRequest(request.url())) {
      return;
    }
    issues.push({
      source: 'requestfailed',
      message: `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
    });
  });
  page.on('response', (response) => {
    if (!isAppRequest(response.url()) || response.status() < 500) {
      return;
    }
    issues.push({
      source: 'response',
      message: `${response.status()} ${response.request().method()} ${response.url()}`,
    });
  });

  return issues;
}

async function bootApp(page: Page): Promise<ObservedIssue[]> {
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('mlt-onboarding-completed', 'true');
  });

  const issues = trackRuntimeIssues(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tablist', { name: 'Main navigation' })).toBeVisible();

  return issues;
}

function assertNoIssues(issues: ObservedIssue[], context: string): void {
  expect(
    issues,
    `${context}\n${issues.map((issue) => `${issue.source}: ${issue.message}`).join('\n')}`,
  ).toEqual([]);
}

test.describe('app shell smoke', () => {
  for (const tabName of visibleTabs) {
    test(`opens ${tabName} without runtime failures`, async ({ page }) => {
      const issues = await bootApp(page);
      const tab = page.getByRole('tab', { name: tabName });

      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');

      assertNoIssues(issues, `runtime issues detected while opening ${tabName}`);
    });
  }
});
