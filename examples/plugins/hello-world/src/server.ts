import { defineServerPlugin } from '@my-little-todo/plugin-sdk';

export default defineServerPlugin({
  async activate(ctx) {
    ctx.logger.info('hello-world server plugin activated');
  },
  tools: {
    async hello_echo(args) {
      return {
        content: {
          ok: true,
          echoed: args,
        },
      };
    },
  },
  routes: {
    'GET /echo': async (request, ctx) => ({
      status: 200,
      json: {
        ok: true,
        pluginId: ctx.pluginId,
        query: request.query ?? {},
      },
    }),
  },
});
