import { useEffect, useState } from 'react';
import { WidgetView } from '../components/WidgetView';
import { useForegroundBridge } from '../hooks/useForegroundBridge';
import { useModuleStore } from '../modules';
import { useRoleStore, useTaskStore } from '../stores';
import { useWindowContextStore } from '../stores/windowContextStore';

export function WidgetShell() {
  useForegroundBridge();
  const hydrate = useModuleStore((s) => s.hydrate);
  const loadRoles = useRoleStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadContexts = useWindowContextStore((s) => s.loadContexts);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await hydrate();
      await loadRoles();
      await loadTasks();
      await loadContexts();
      setReady(true);
    })();
  }, [hydrate, loadRoles, loadTasks, loadContexts]);

  return (
    <div
      className="h-screen w-screen overflow-hidden p-2 transition-opacity duration-200"
      style={{
        background: 'transparent',
        opacity: ready ? 1 : 0,
      }}
    >
      <WidgetView />
    </div>
  );
}
