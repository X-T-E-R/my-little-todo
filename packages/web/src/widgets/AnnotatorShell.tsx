import { useEffect } from 'react';
import { AnnotatorPanel } from '../components/AnnotatorPanel';
import { useForegroundBridge } from '../hooks/useForegroundBridge';
import { useModuleStore } from '../modules';
import { useRoleStore, useStreamStore, useTaskStore } from '../stores';
import { useWindowContextStore } from '../stores/windowContextStore';

/** Secondary webview: window annotation panel (`?mlt=annotator`). */
export function AnnotatorShell() {
  useForegroundBridge();
  const hydrate = useModuleStore((s) => s.hydrate);
  const loadRoles = useRoleStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadContexts = useWindowContextStore((s) => s.loadContexts);
  const loadStream = useStreamStore((s) => s.load);

  useEffect(() => {
    void (async () => {
      await hydrate();
      await loadRoles();
      await loadTasks();
      await loadContexts();
      await loadStream();
    })();
  }, [hydrate, loadRoles, loadTasks, loadContexts, loadStream]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent p-2">
      <AnnotatorPanel />
    </div>
  );
}
