import { describe, expect, it } from 'vitest';
import { createWorkThread } from './workThreadRuntime.js';
import { parseWorkThreadMarkdown, serializeWorkThreadToMarkdown } from './workThreadMarkdown.js';

describe('workThreadMarkdown', () => {
  it('serializes and parses container-based markdown', () => {
    const thread = {
      ...createWorkThread({ title: 'Gateway', mission: 'Ship gateway' }),
      rootMarkdown: '先把网关主线说明清楚。',
      explorationMarkdown: '- [资料] https://example.com',
      intents: [
        {
          id: 'intent-1',
          text: '跑通第三方 API 网关',
          bodyMarkdown: '先确认 Aether 和 cc-switch 怎么接起来。',
          collapsed: false,
          parentThreadId: 'thread-1',
          state: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      sparkContainers: [
        {
          id: 'spark-1',
          title: '多 key 切换',
          bodyMarkdown: '后面单开一条线。',
          collapsed: true,
          parentThreadId: 'thread-1',
          parentIntentId: 'intent-1',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      nextActions: [
        {
          id: 'next-1',
          text: '先装 cc-switch',
          done: false,
          source: 'user' as const,
          parentThreadId: 'thread-1',
          parentIntentId: 'intent-1',
          createdAt: 3,
        },
      ],
      waitingFor: [
        {
          id: 'block-1',
          kind: 'external' as const,
          title: '等 Codex 修插件',
          detail: '回来再接专利搜索。',
          parentThreadId: 'thread-1',
          satisfied: false,
          createdAt: 4,
          updatedAt: 4,
        },
      ],
    };

    const markdown = serializeWorkThreadToMarkdown(thread);
    expect(markdown).toContain('> [!intent]+ 跑通第三方 API 网关');
    expect(markdown).toContain('> > [!spark]- 多 key 切换');
    expect(markdown).toContain('> [!explore]- Exploration');

    const parsed = parseWorkThreadMarkdown(markdown);
    expect(parsed.rootMarkdown).toContain('先把网关主线说明清楚');
    expect(parsed.intents[0]?.text).toBe('跑通第三方 API 网关');
    expect(parsed.intents[0]?.bodyMarkdown).toContain('Aether');
    expect(parsed.sparkContainers[0]?.title).toBe('多 key 切换');
    expect(parsed.nextActions[0]?.text).toBe('先装 cc-switch');
    expect(parsed.waitingFor[0]?.title).toBe('等 Codex 修插件');
    expect(parsed.explorationMarkdown).toContain('https://example.com');
  });

  it('migrates handwritten meta-style markdown into usable containers', () => {
    const markdown = `---
created: 2026-04-12T23:26
modified: 2026-04-16T15:36
---
那感觉切换线程也挺有用的

我现在在处理comsol并等待codex的工作结果

目标：优先跑通comsol的一个案例
[COMSOL Multiphysics 全网最清楚讲解视频 帮助大家一天快速上手COMSOL_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1K44y1v7Vx/)

我先把微型电阻给跑通

我今晚另一个目标：安装好ccw
：在开始下一个任务前一定要把ccw装好

~~：断点：卡在了等codex修好现有的插件上~~
：修好后应该优先加上专利搜索插件

对于写作，小说写作我也想玩
想整一个grok

[Obsidian+Claude太强了：拯救你吃灰的收藏夹 - 开发调优 - LINUX DO](https://linux.do/t/topic/1893419)
`;

    const parsed = parseWorkThreadMarkdown(markdown);
    expect(parsed.rootMarkdown).toContain('切换线程也挺有用');
    expect(parsed.intents.some((item) => item.text.includes('跑通comsol'))).toBe(true);
    expect(parsed.intents.some((item) => item.text.includes('安装好ccw'))).toBe(true);
    expect(parsed.waitingFor.some((item) => item.title.includes('codex'))).toBe(true);
    expect(parsed.sparkContainers.some((item) => item.title.includes('grok'))).toBe(true);
    expect(parsed.nextActions.some((item) => item.text.includes('微型电阻'))).toBe(true);
    expect(parsed.explorationMarkdown).toContain('linux.do');
  });

  it('migrates handwritten gateway thread with links into exploration and intent buckets', () => {
    const markdown = `---
created: 2026-03-01T18:05
modified: 2026-04-14T21:07
---
[GitHub - fawney19/Aether](https://github.com/fawney19/Aether/)

简而言之我现在已经有足量的api token了

我应该去使用某些工作流

1. 使用curso+自定义模型
2. 使用ccx
3. 使用claude code
4. 搞定codex

我应该先去安装cc switch

我现在应该去研究ccw/多agent了

多agent显然是一个很重要的方向，尤其是现在的这个很慢很慢

## 我需要多Agent！

[codex 并行multi-agent 踩坑与使用经验 - 开发调优 / 开发调优, Lv1 - LINUX DO](https://linux.do/t/topic/1785189)
[Vibecoding 入门教程（macOS + Windows | CLI + VS Code | skills、mcp推荐） - 开发调优 - LINUX DO](https://linux.do/t/topic/1615649)

我将要安装
1. oh-my-codex
2. ccw
3. superpower
`;

    const parsed = parseWorkThreadMarkdown(markdown);
    expect(parsed.rootMarkdown).toContain('足量的api token');
    expect(parsed.intents.some((item) => item.text.includes('使用某些工作流'))).toBe(true);
    expect(parsed.intents.some((item) => item.text.includes('研究ccw'))).toBe(true);
    expect(parsed.nextActions.some((item) => item.text.includes('安装cc switch'))).toBe(true);
    expect(parsed.explorationMarkdown).toContain('Aether');
    expect(parsed.explorationMarkdown).toContain('多Agent');
  });

  it('keeps target headings in exploration instead of turning them into intents', () => {
    const markdown = `---
created: 2026-04-12T23:23
modified: 2026-04-13T17:24
---
我要学comsol！

我应该去学如何学comsol

好像上次是直接看到了官网的案例下载

![](attachments/Pasted%20image%2020260413011535.png)

Target：

![](attachments/Pasted%20image%2020260413012229.png)
`;

    const parsed = parseWorkThreadMarkdown(markdown);
    expect(parsed.intents.some((item) => item.text === 'Target：')).toBe(false);
    expect(parsed.explorationMarkdown).toContain('Target：');
    expect(parsed.intents.some((item) => item.text.includes('学comsol'))).toBe(true);
  });
});
