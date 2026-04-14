export default {
  tools: {
    async echo(args, ctx) {
      return {
        content: {
          ok: true,
          pluginId: ctx.pluginId,
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
};
