import { definePlugin } from '@my-little-todo/plugin-sdk';
import type { PluginContext } from '@my-little-todo/plugin-sdk';
import { useEffect, useState } from 'react';

function SettingsBody({ ctx }: { ctx: PluginContext }) {
  const [n, setN] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const v = await ctx.data.get('counter');
      if (!cancelled) {
        setN(Number.parseInt(v ?? '0', 10) || 0);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  return (
    <div data-plugin-id={ctx.pluginId} className="space-y-3">
      <p className="mltp-hello-title text-sm" style={{ color: 'var(--color-text)' }}>
        {ctx.i18n.t('title')}
      </p>
      {loading ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">…</p>
      ) : (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Counter: <strong>{n}</strong>
        </p>
      )}
      <button
        type="button"
        className="rounded-lg px-3 py-1.5 text-xs font-medium"
        style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
        onClick={() =>
          void (async () => {
            const next = n + 1;
            await ctx.data.set('counter', String(next));
            setN(next);
          })()
        }
      >
        +1
      </button>
    </div>
  );
}

export default definePlugin({
  activate(ctx) {
    ctx.ui.registerSettingsPage(function HelloWorldSettings() {
      return <SettingsBody ctx={ctx} />;
    });
  },
});
