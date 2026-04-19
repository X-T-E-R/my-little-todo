import { CheckCircle, Copy, ExternalLink, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getDesktopEmbeddedHostBaseUrl,
  useEmbeddedHostStore,
} from '../embedded-host/embeddedHostStore';
import { useModuleStore } from '../../modules/moduleStore';
import { getSetting, getSettingsApiBase, putSetting } from '../../storage/settingsApi';
import { useRoleStore } from '../../stores';
import { getAuthToken } from '../../stores/authStore';
import { isTauriEnv } from '../../utils/platform';

function getMcpBaseUrl(): string {
  const api = getSettingsApiBase();
  if (api) return api.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
}

type PermLevel = 'read' | 'create' | 'full';

const TOOL_RANK: Record<string, 0 | 1 | 2> = {
  get_overview: 0,
  list_tasks: 0,
  get_task: 0,
  list_stream: 0,
  search: 0,
  get_roles: 0,
  create_task: 1,
  add_stream: 1,
  update_task: 2,
  delete_task: 2,
  update_stream_entry: 2,
  manage_role: 2,
};

const MCP_TOOLS_GROUPS = {
  read: [
    { name: 'get_overview', descKey: 'mcp_tool_get_overview' },
    { name: 'list_tasks', descKey: 'mcp_tool_list_tasks' },
    { name: 'get_task', descKey: 'mcp_tool_get_task' },
    { name: 'list_stream', descKey: 'mcp_tool_list_stream' },
    { name: 'search', descKey: 'mcp_tool_search' },
    { name: 'get_roles', descKey: 'mcp_tool_get_roles' },
  ],
  create: [
    { name: 'create_task', descKey: 'mcp_tool_create_task' },
    { name: 'add_stream', descKey: 'mcp_tool_add_stream' },
  ],
  full: [
    { name: 'update_task', descKey: 'mcp_tool_update_task' },
    { name: 'delete_task', descKey: 'mcp_tool_delete_task' },
    { name: 'update_stream_entry', descKey: 'mcp_tool_update_stream_entry' },
    { name: 'manage_role', descKey: 'mcp_tool_manage_role' },
  ],
};

const IDE_CONFIGS: { id: string; label: string; pathHint: string }[] = [
  { id: 'cursor', label: 'Cursor', pathHint: '.cursor/mcp.json' },
  {
    id: 'claude',
    label: 'Claude Desktop',
    pathHint: '~/Library/Application Support/Claude/claude_desktop_config.json (macOS)',
  },
  { id: 'vscode', label: 'VS Code (Copilot)', pathHint: '.vscode/mcp.json' },
  { id: 'windsurf', label: 'Windsurf', pathHint: '~/.codeium/windsurf/mcp_config.json' },
  { id: 'generic', label: 'Generic', pathHint: '' },
];

function levelRank(l: PermLevel): number {
  if (l === 'read') return 0;
  if (l === 'create') return 1;
  return 2;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/** MCP connection, permission level, role ACL, and per-tool toggles (web API, embedded desktop, or Capacitor). */
export function McpIntegrationSettings() {
  const { t } = useTranslation('settings');
  const roles = useRoleStore((s) => s.roles);
  const loadRolesData = useRoleStore((s) => s.load);
  const hydrateEmbeddedHost = useEmbeddedHostStore((s) => s.hydrate);
  const embeddedHostModuleEnabled = useModuleStore((s) => s.isEnabled('embedded-host'));

  const [permLevel, setPermLevel] = useState<PermLevel>('read');
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [aclAll, setAclAll] = useState(true);

  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [toolsSaved, setToolsSaved] = useState(false);

  const [selectedIde, setSelectedIde] = useState('cursor');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void loadRolesData();
    if (isTauriEnv()) {
      void hydrateEmbeddedHost();
    }
  }, [hydrateEmbeddedHost, loadRolesData]);

  useEffect(() => {
    getSetting('mcp-permission-level').then((v) => {
      if (v === 'create' || v === 'full') setPermLevel(v);
      else setPermLevel('read');
    });
    getSetting('mcp-allowed-roles').then((v) => {
      if (!v) {
        setAclAll(true);
        setAllowedRoles([]);
        return;
      }
      try {
        const arr = JSON.parse(v) as string[];
        if (!Array.isArray(arr) || arr.length === 0) {
          setAclAll(true);
          setAllowedRoles([]);
        } else {
          setAclAll(false);
          setAllowedRoles(arr);
        }
      } catch {
        setAclAll(true);
        setAllowedRoles([]);
      }
    });
    getSetting('mcp-disabled-tools').then((v) => {
      if (v) {
        try {
          setDisabledTools(JSON.parse(v));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  const savePermLevel = async (next: PermLevel) => {
    setPermLevel(next);
    await putSetting('mcp-permission-level', next);
  };

  const saveAllowedRoles = async (next: string[], all: boolean) => {
    setAllowedRoles(next);
    setAclAll(all);
    await putSetting('mcp-allowed-roles', JSON.stringify(all ? [] : next));
  };

  const toggleRole = (id: string) => {
    const next = allowedRoles.includes(id)
      ? allowedRoles.filter((x) => x !== id)
      : [...allowedRoles, id];
    void saveAllowedRoles(next, false);
  };

  const toggleNoneRole = () => {
    const marker = '__none__';
    const next = allowedRoles.includes(marker)
      ? allowedRoles.filter((x) => x !== marker)
      : [...allowedRoles, marker];
    void saveAllowedRoles(next, false);
  };

  const selectAllRoles = () => {
    void saveAllowedRoles([], true);
  };

  const startRestrictByRole = () => {
    const ids = roles.map((r) => r.id);
    void saveAllowedRoles(ids.length ? [...ids, '__none__'] : ['__none__'], false);
  };

  const handleToggleTool = async (toolName: string) => {
    const next = disabledTools.includes(toolName)
      ? disabledTools.filter((x) => x !== toolName)
      : [...disabledTools, toolName];
    setDisabledTools(next);
    await putSetting('mcp-disabled-tools', JSON.stringify(next));
    setToolsSaved(true);
    setTimeout(() => setToolsSaved(false), 1500);
  };

  const token = getAuthToken();
  const desktopBaseUrl = isTauriEnv() ? getDesktopEmbeddedHostBaseUrl() : null;
  const desktopHostUnavailable = isTauriEnv() && !desktopBaseUrl;
  const baseUrl = desktopBaseUrl ?? getMcpBaseUrl();
  const mcpServerEntry: Record<string, unknown> = {
    url: `${baseUrl}/api/mcp`,
  };
  if (!isTauriEnv()) {
    mcpServerEntry.headers = {
      Authorization: `Bearer ${token || '<your-token>'}`,
    };
  }
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        'my-little-todo': mcpServerEntry,
      },
    },
    null,
    2,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const ideConfig = IDE_CONFIGS.find((c) => c.id === selectedIde) ?? IDE_CONFIGS[0];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
          {t('MCP permission level')}
        </p>
        <div className="flex gap-1 rounded-xl bg-[var(--color-bg)] p-1">
          {(['read', 'create', 'full'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => void savePermLevel(lvl)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                permLevel === lvl
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {t(`mcp_level_${lvl}`)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
          {t('MCP permission level hint')}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('MCP role visibility')}
          </p>
          <button
            type="button"
            onClick={() => void selectAllRoles()}
            className="text-[11px] text-[var(--color-accent)] hover:underline"
          >
            {t('MCP role visibility all')}
          </button>
        </div>
        {!aclAll && (
          <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowedRoles.includes(r.id)}
                  onChange={() => toggleRole(r.id)}
                  className="rounded"
                />
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ background: r.color ?? 'var(--color-border)' }}
                />
                <span className="text-[var(--color-text)]">{r.name}</span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={allowedRoles.includes('__none__')}
                onChange={() => toggleNoneRole()}
                className="rounded"
              />
              <span className="text-[var(--color-text)]">{t('MCP role none')}</span>
            </label>
          </div>
        )}
        {aclAll && (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {t('MCP role visibility all hint')}
            </p>
            <button
              type="button"
              onClick={() => void startRestrictByRole()}
              className="text-[11px] text-[var(--color-accent)] hover:underline"
            >
              {t('MCP restrict roles')}
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
          {t('MCP Tool Access')}
        </p>
        <div className="space-y-3">
          {(['read', 'create', 'full'] as const).map((group) => {
            const tools = MCP_TOOLS_GROUPS[group];
            const label =
              group === 'read'
                ? t('Read Operations')
                : group === 'create'
                  ? t('Create Operations')
                  : t('Full Operations');
            return (
              <div key={group}>
                <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] mb-1">
                  {label}
                </p>
                <div className="space-y-1">
                  {tools.map((tool) => {
                    const need = TOOL_RANK[tool.name] ?? 0;
                    const allowed = levelRank(permLevel) >= need;
                    return (
                      <div key={tool.name} className="flex items-center justify-between py-1">
                        <div className="min-w-0">
                          <span className="text-sm font-mono text-[var(--color-text)]">
                            {tool.name}
                          </span>
                          <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                            {t(tool.descKey)}
                          </span>
                        </div>
                        <ToggleSwitch
                          checked={!disabledTools.includes(tool.name)}
                          disabled={!allowed}
                          onChange={() => {
                            if (allowed) void handleToggleTool(tool.name);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {toolsSaved && (
          <span className="text-xs text-emerald-500 flex items-center gap-1 mt-2">
            <CheckCircle size={12} />
            {t('Saved')}
          </span>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Server size={14} className="text-[var(--color-accent)]" />
          <p className="text-xs font-medium text-[var(--color-text)]">{t('MCP Integration')}</p>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-[var(--color-text-secondary)] shrink-0">{t('IDE')}</span>
          <select
            value={selectedIde}
            onChange={(e) => setSelectedIde(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] outline-none"
          >
            {IDE_CONFIGS.map((ide) => (
              <option key={ide.id} value={ide.id}>
                {ide.label}
              </option>
            ))}
          </select>
        </div>
        {desktopHostUnavailable ? (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-xs text-[var(--color-text-tertiary)]">
            {embeddedHostModuleEnabled
              ? t('Start the Embedded Host in settings to expose MCP on desktop.')
              : t('Enable the Embedded Host module to expose MCP on desktop.')}
          </p>
        ) : (
          <div className="relative">
            <pre
              className="rounded-xl p-3 text-xs font-mono overflow-x-auto"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {mcpConfig}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 rounded-lg p-1.5 transition-colors hover:bg-[var(--color-surface)]"
              title={t('Copy')}
            >
              {copied ? (
                <CheckCircle size={14} className="text-emerald-500" />
              ) : (
                <Copy size={14} className="text-[var(--color-text-tertiary)]" />
              )}
            </button>
          </div>
        )}
        {ideConfig.pathHint && (
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
            {t('Config file')}: <code className="font-mono">{ideConfig.pathHint}</code>
          </p>
        )}
        <a
          href="https://github.com/X-T-E-R/my-little-todo/blob/main/skills/SKILL.md"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline w-fit"
        >
          <ExternalLink size={12} />
          {t('View MCP usage guide (Skills)')}
        </a>
      </div>
    </div>
  );
}
