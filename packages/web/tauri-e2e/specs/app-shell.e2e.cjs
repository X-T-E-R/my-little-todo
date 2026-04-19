async function waitForMainNavigation() {
  const nav = await $('[role="tablist"]');
  try {
    await nav.waitForDisplayed({ timeout: 60_000 });
  } catch (error) {
    const pageSource = await browser.getPageSource().catch(() => '<page source unavailable>');
    await browser.saveScreenshot('./tauri-e2e/logs/desktop-shell-failure.png').catch(() => {});
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nPage source:\n${pageSource.slice(0, 4000)}`,
    );
  }
  return nav;
}

async function getVisibleTabs() {
  const tabs = await $$('button[role="tab"]');
  if (tabs.length < 4) {
    const labels = await Promise.all(
      tabs.map(async (tab) => (await tab.getAttribute('aria-label')) || '<missing-label>'),
    );
    throw new Error(
      `expected at least 4 navigation tabs, received ${tabs.length}: ${labels.join(', ')}`,
    );
  }
  return tabs;
}

async function getSevereBrowserLogs() {
  try {
    const logs = await browser.getLogs('browser');
    return logs.filter((entry) => {
      const level = String(entry.level ?? '');
      return /SEVERE|ERROR/i.test(level);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unknown command|invalid argument|not supported/i.test(message)) {
      return [];
    }
    throw error;
  }
}

describe('My Little Todo desktop shell', () => {
  beforeEach(async () => {
    await waitForMainNavigation();
  });

  afterEach(async () => {
    const severeLogs = await getSevereBrowserLogs();
    if (severeLogs.length > 0) {
      throw new Error(
        `unexpected browser logs:\n${severeLogs
          .map((entry) => `${entry.level}: ${entry.message}`)
          .join('\n')}`,
      );
    }
  });

  it('shows the main navigation', async () => {
    const nav = await waitForMainNavigation();
    await expect(nav).toBeDisplayed();
    await getVisibleTabs();
  });

  it('opens every visible tab without runtime errors', async () => {
    const initialTabs = await getVisibleTabs();
    const labels = [];

    for (let index = 0; index < initialTabs.length; index += 1) {
      const tabs = await getVisibleTabs();
      const tab = tabs[index];
      const label = (await tab.getAttribute('aria-label')) || `tab-${index + 1}`;
      labels.push(label);
      await tab.click();
      await browser.waitUntil(
        async () => {
          const refreshedTab = (await getVisibleTabs())[index];
          return (await refreshedTab.getAttribute('aria-selected')) === 'true';
        },
        {
          timeout: 10_000,
          interval: 250,
          timeoutMsg: `tab ${label} never became active`,
        },
      );
    }

    if (labels.length < 4) {
      throw new Error(`expected to visit at least 4 tabs, visited ${labels.length}`);
    }
  });
});
