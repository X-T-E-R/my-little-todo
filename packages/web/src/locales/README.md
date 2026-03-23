# Translation Contribution Guide / 翻译贡献指南

Thank you for helping translate My Little Todo! This guide explains how to add a new language or improve existing translations.

## Directory Structure

```
locales/
├── index.ts          # i18n initialization (register new languages here)
├── zh-CN/            # Chinese (Simplified) — primary translations
│   ├── common.json
│   ├── nav.json
│   ├── now.json
│   ├── stream.json
│   ├── board.json
│   ├── settings.json
│   ├── task.json
│   ├── onboarding.json
│   ├── login.json
│   ├── editor.json
│   ├── calendar.json
│   ├── role.json
│   └── errors.json
└── en/               # English — uses keys as fallback, mostly empty
    └── (same files)
```

## Key Strategy

We use **English original text as translation keys**:

```json
{
  "No tasks yet": "还没有待办事项",
  "Loading...": "加载中...",
  "Selected {{count}} items": "已选 {{count}} 项"
}
```

- Keys are self-documenting English text
- English translations can be empty `{}` — the key itself serves as the English text
- Interpolation uses `{{variable}}` syntax (i18next standard)

## Adding a New Language

### 1. Create the language folder

```bash
mkdir packages/web/src/locales/ja   # Example: Japanese
```

### 2. Copy zh-CN as a template

```bash
cp packages/web/src/locales/zh-CN/*.json packages/web/src/locales/ja/
```

### 3. Translate all values

Open each JSON file and replace the Chinese values with your translations. Keep the keys (English) unchanged:

```json
{
  "No tasks yet": "まだタスクがありません",
  "Loading...": "読み込み中..."
}
```

### 4. Register in `index.ts`

Add imports and register the new language in `locales/index.ts`:

```typescript
import jaCommon from './ja/common.json';
import jaNav from './ja/nav.json';
// ... import all 13 namespace files

export const resources = {
  // ... existing languages
  ja: {
    common: jaCommon,
    nav: jaNav,
    // ... all 13 namespaces
  },
};
```

### 5. Add to language selector

Update the language selector in:
- `packages/web/src/views/SettingsView.tsx` (GeneralTab)
- `packages/web/src/views/OnboardingView.tsx` (QuickConfigStep)

Add:
```tsx
<option value="ja">日本語</option>
```

### 6. Admin panel

If you also want to translate the admin panel, repeat steps 1-4 for:
```
packages/admin/src/locales/
```

The admin panel has a single namespace `admin.json`.

## Namespaces

| Namespace | Description | Approx. Keys |
|-----------|-------------|--------------|
| `common` | Shared strings: actions, dates, shortcuts, notifications | ~50 |
| `nav` | Navigation tab labels | ~4 |
| `now` | "Now" view: focus mode, recommendations, celebrations | ~40 |
| `stream` | Stream view: filters, entries, input bar, batch ops | ~35 |
| `board` | Board view: task cards, dialogs, calendars | ~40 |
| `settings` | All settings tabs and their content | ~100 |
| `task` | Task detail, create dialog, context menus, statuses | ~70 |
| `onboarding` | First-run guide, presets, quick config | ~40 |
| `login` | Login/register forms | ~15 |
| `editor` | Markdown toolbar labels | ~25 |
| `calendar` | Calendar component, date picker, schedule editor | ~40 |
| `role` | Role sidebar, picker, landing card | ~10 |
| `errors` | Backend error message translations | ~15 |

## Guidelines

1. **Keep interpolation variables** — `{{count}}`, `{{name}}`, etc. must appear in the translation
2. **Match tone** — the app uses casual, friendly language
3. **Test your translations** — switch languages in Settings > General to verify
4. **Don't translate keys** — only translate values
5. **Don't add extra keys** — follow the existing structure

## Testing

```bash
pnpm dev
```

Then go to Settings > General > Language and switch to your new language.

## Questions?

Open an issue on GitHub if you need help or have questions about specific translations.
