import { AiAgentSettings } from '../features/ai-agent/AiAgentSettings';
import { DesktopWidgetSettings } from '../features/desktop-widget/DesktopWidgetSettings';
import { FileHostSettings } from '../features/file-host/FileHostSettings';
import { KanbanSettings } from '../features/kanban/KanbanSettings';
import { McpIntegrationSettings } from '../features/mcp-integration/McpIntegrationSettings';
import { StreamContextPanelSettings } from '../features/stream-context-panel/StreamContextPanelSettings';
import { ThinkSessionSettings } from '../features/think-session/ThinkSessionSettings';
import { TimeAwarenessSettings } from '../features/time-awareness/TimeAwarenessSettings';
import { TimeCapsuleSettings } from '../features/time-capsule/TimeCapsuleSettings';
import { WindowContextSettings } from '../features/window-context/WindowContextSettings';
import { WorkThreadSettingsSection } from '../features/work-thread/WorkThreadSettingsSection';
import { registerSettingsEntry } from './registry';

const BUILTIN_SETTINGS = [
  { id: 'ai-agent', component: AiAgentSettings },
  { id: 'kanban', component: KanbanSettings },
  { id: 'mcp-integration', component: McpIntegrationSettings },
  { id: 'file-host', component: FileHostSettings },
  { id: 'desktop-widget', component: DesktopWidgetSettings },
  { id: 'think-session', component: ThinkSessionSettings },
  { id: 'work-thread', component: WorkThreadSettingsSection },
  { id: 'window-context', component: WindowContextSettings },
  { id: 'time-awareness', component: TimeAwarenessSettings },
  { id: 'stream-context-panel', component: StreamContextPanelSettings },
  { id: 'time-capsule', component: TimeCapsuleSettings },
] as const;

let registered = false;

export function ensureBuiltinSettingsRegistered(): void {
  if (registered) return;
  registered = true;
  for (const entry of BUILTIN_SETTINGS) {
    registerSettingsEntry({
      id: entry.id,
      source: 'builtin',
      component: entry.component,
    });
  }
}
