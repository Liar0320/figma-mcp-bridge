export const label = issue => `RPC probe #${issue} ${new Date().toISOString()}`;
export const succeeded = result => result != null && Object.hasOwn(result, 'data');
export const failure = result => result?.error ?? result?.transportError ?? null;
