/** Stream entry line format: `- HH:MM:SS | [type] content` or legacy `- HH:MM | content` */
export const STREAM_LINE_REGEX = /^- (\d{2}:\d{2}(?::\d{2})?) \| (.+)$/;

/** Optional entry type marker at start of content: `[spark]`, `[task]`, `[log]` (legacy `note`/`journal` mapped to `log`) */
export const ENTRY_TYPE_REGEX = /^\[(spark|task|log|note|journal)\]\s*/;

/** Extract tags from text: `#tagName` */
export const TAG_REGEX = /#([\w\u4e00-\u9fff]+)/g;

/** Task reference in stream: `→ [task-id]` */
export const TASK_REF_REGEX = /→ \[([^\]]+)\]/;

/** Role reference in stream: `@role:role-id` */
export const ROLE_REF_REGEX = /@role:([\w-]+)/;

/** Markdown checkbox: `- [x] content` or `- [ ] content` */
export const CHECKBOX_REGEX = /^- \[([ x])\] (.+)$/;

/** Image in markdown: `![alt](url)` */
export const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** Link in markdown: `[text](url)` — not preceded by `!` */
export const LINK_REGEX = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;

export const DATA_DIR = 'data';
export const STREAM_DIR = `${DATA_DIR}/stream`;
export const TASKS_DIR = `${DATA_DIR}/tasks`;
export const ARCHIVE_DIR = `${DATA_DIR}/archive`;
export const META_DIR = `${DATA_DIR}/meta`;
