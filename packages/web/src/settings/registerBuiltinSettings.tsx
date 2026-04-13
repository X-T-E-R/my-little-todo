import { AiAgentSettings } from '../components/AiAgentSettings';
import { DesktopWidgetSettings } from '../components/DesktopWidgetSettings';
import { FileHostSettings } from '../components/FileHostSettings';
import { KanbanSettings } from '../components/KanbanSettings';
import { McpIntegrationSettings } from '../components/McpIntegrationSettings';
import { StreamContextPanelSettings } from '../components/StreamContextPanelSettings';
import { ThinkSessionSettings } from '../components/ThinkSessionSettings';
import { TimeAwarenessSettings } from '../components/TimeAwarenessSettings';
import { TimeCapsuleSettings } from '../components/TimeCapsuleSettings';
import { WindowContextSettings } from '../components/WindowContextSettings';
import { registerSettingsEntry } from './registry';

const BUILTIN_SETTINGS = [
  { id: 'ai-agent', component: AiAgentSettings },
  { id: 'kanban', component: KanbanSettings },
  { id: 'mcp-integration', component: McpIntegrationSettings },
  { id: 'file-host', component: FileHostSettings },
  { id: 'desktop-widget', component: DesktopWidgetSettings },
  { id: 'think-session', component: ThinkSessionSettings },
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
