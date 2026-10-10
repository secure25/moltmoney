/** Minimal no-op Prisma stub — buildServer initializes WebSocketServer which
 * binds methods but issues no queries at registration time, so a proxy that
 * returns itself for any property access and a no-op async function is fine. */
export const modelStub: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === '$disconnect' || prop === '$connect' || prop === '$queryRaw' || prop === '$executeRaw') {
      return async () => undefined;
    }
    if (prop === '$transaction') {
      return async (fn: any) => (typeof fn === 'function' ? fn(modelStub) : undefined);
    }
    return modelStub;
  },
});

export const prismaStub = modelStub;
