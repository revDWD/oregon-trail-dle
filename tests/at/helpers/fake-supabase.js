// Minimal chainable fake of the supabase-js client that records every call.
// `respond(call)` returns { data, error }; for table queries data should be an array.
export function createFakeClient({ session = null, respond = () => ({ data: [], error: null }), auth = {} } = {}) {
  const calls = [];
  let currentSession = session;

  function builder(table) {
    const call = { kind: "table", table, op: "select", payload: undefined, filters: [], order: [], range: null, single: null, selected: false };
    const api = {
      select(columns) { call.selected = true; call.columns = columns; return api; },
      insert(payload) { call.op = "insert"; call.payload = payload; return api; },
      update(payload) { call.op = "update"; call.payload = payload; return api; },
      delete() { call.op = "delete"; return api; },
      eq(column, value) { call.filters.push([column, value]); return api; },
      order(column, options) { call.order.push([column, options]); return api; },
      range(from, to) { call.range = [from, to]; return api; },
      single() { call.single = "single"; return api; },
      maybeSingle() { call.single = "maybe"; return api; },
      then(resolve, reject) {
        calls.push(call);
        return Promise.resolve(respond(call)).then((result) => {
          if (call.single && !result.error) {
            const first = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
            return { data: first, error: first === null && call.single === "single" ? { code: "PGRST116", message: "no rows" } : null };
          }
          return result;
        }).then(resolve, reject);
      }
    };
    return api;
  }

  const client = {
    calls,
    setSession(next) { currentSession = next; },
    from: (table) => builder(table),
    rpc(name, args) {
      const call = { kind: "rpc", name, args };
      calls.push(call);
      return Promise.resolve(respond(call));
    },
    auth: {
      getSession: async () => ({ data: { session: currentSession }, error: null }),
      signInAnonymously: async () => {
        calls.push({ kind: "auth", name: "signInAnonymously" });
        if (auth.signInAnonymously) return auth.signInAnonymously();
        currentSession = { user: { id: "anon1", is_anonymous: true } };
        return { data: { user: currentSession.user, session: currentSession }, error: null };
      },
      onAuthStateChange: (callback) => { client.authCallback = callback; return { data: { subscription: { unsubscribe() { client.unsubscribed = true; } } } }; }
    }
  };
  return client;
}
