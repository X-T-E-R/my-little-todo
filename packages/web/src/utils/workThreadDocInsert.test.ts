import { createWorkThread } from '@my-little-todo/core';
import { describe, expect, it } from 'vitest';
import { insertIntoWorkThreadDoc } from './workThreadDocInsert';

function sampleThread() {
  return {
    ...createWorkThread({ title: 'Gateway', mission: 'Ship gateway' }),
    docMarkdown: `主线说明

> [!intent]+ 梳理网关方向
>
> 先看 Aether

> [!explore]- 探索区
>
> https://example.com
`,
    intents: [
      {
        id: 'intent-1',
        text: '梳理网关方向',
        bodyMarkdown: '先看 Aether',
        collapsed: false,
        parentThreadId: 'thread-1',
        state: 'active' as const,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    sparkContainers: [],
  };
}

describe('workThreadDocInsert', () => {
  it('appends body text into the focused intent callout', () => {
    const nextDoc = insertIntoWorkThreadDoc(
      sampleThread(),
      { kind: 'intent', id: 'intent-1' },
      'body',
      '补一条推进记录',
    );

    expect(nextDoc).toContain('> 补一条推进记录');
    expect(nextDoc).toContain('> [!intent]+ 梳理网关方向');
  });

  it('inserts nested next actions inside the focused intent', () => {
    const nextDoc = insertIntoWorkThreadDoc(
      sampleThread(),
      { kind: 'intent', id: 'intent-1' },
      'next',
      '先把 CCW 装上',
    );

    expect(nextDoc).toContain('> - [ ] 先把 CCW 装上');
  });

  it('creates nested spark callouts under the focused intent', () => {
    const nextDoc = insertIntoWorkThreadDoc(
      sampleThread(),
      { kind: 'intent', id: 'intent-1' },
      'spark',
      '多 key 切换\n后面再看',
    );

    expect(nextDoc).toContain('> > [!spark]+ 多 key 切换');
    expect(nextDoc).toContain('> > 后面再看');
  });

  it('appends plain text into exploration and preserves callout syntax', () => {
    const nextDoc = insertIntoWorkThreadDoc(
      sampleThread(),
      { kind: 'exploration' },
      'body',
      'https://obsidian.md',
    );

    expect(nextDoc).toContain('> [!explore]- 探索区');
    expect(nextDoc).toContain('> https://obsidian.md');
  });

  it('creates root-level intent callouts as top-level blocks', () => {
    const nextDoc = insertIntoWorkThreadDoc(sampleThread(), { kind: 'root' }, 'intent', '新意图');
    expect(nextDoc).toContain('> [!intent]+ 新意图');
  });

  it('targets the focused container by path instead of matching duplicate titles', () => {
    const thread = {
      ...sampleThread(),
      docMarkdown: `主线说明

> [!spark]+ 重复标题
>
> 根级 spark

> [!intent]+ 梳理网关方向
>
> 先看 Aether
>
> > [!spark]+ 重复标题
> >
> > intent 下的 spark
`,
      sparkContainers: [
        {
          id: 'spark-root',
          title: '重复标题',
          bodyMarkdown: '根级 spark',
          collapsed: false,
          parentThreadId: 'thread-1',
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'spark-nested',
          title: '重复标题',
          bodyMarkdown: 'intent 下的 spark',
          collapsed: false,
          parentThreadId: 'thread-1',
          parentIntentId: 'intent-1',
          createdAt: 3,
          updatedAt: 3,
        },
      ],
    };

    const nextDoc = insertIntoWorkThreadDoc(
      thread,
      {
        kind: 'spark',
        id: 'spark-nested',
        containerPath: 'intent:0/spark:0',
      },
      'body',
      '补到嵌套 spark',
    );

    expect(nextDoc).toContain('> > 补到嵌套 spark');
    expect(nextDoc).not.toContain('> 补到嵌套 spark\n\n> [!intent]+');
  });
});
