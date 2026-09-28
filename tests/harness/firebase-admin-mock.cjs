// firebase-admin מדומה (Firestore + Messaging) לבדיקות פונקציות ה-Netlify.
// אותו store בזיכרון כמו במוק של הדפדפן, אבל עם ה-API של ה-Admin SDK:
// db.collection(x).where(...).get(), doc(id).get/set/update/delete/create, add, runTransaction.
// שימו לב להבדל אמיתי בין ה-SDKs: ב-Admin, snapshot.exists הוא *מאפיין* ולא פונקציה.
const state = (globalThis.__admin = globalThis.__admin || { store: {}, log: [], seq: 0, sent: [], messagingFailTokens: {} });

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const col = (name) => (state.store[name] = state.store[name] || {});

function validate(v, path) {
  if (v === undefined) {
    const e = new Error(`Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "${path}").`);
    throw e;
  }
  if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => validate(x, path ? `${path}.${k}` : k));
}

function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

function docSnap(colName, id) {
  const d = col(colName)[id];
  return { id, exists: d !== undefined, data: () => clone(d), ref: docRef(colName, id) };
}

function docRef(colName, id) {
  return {
    id,
    path: `${colName}/${id}`,
    get: async () => docSnap(colName, id),
    set: async (data, opts) => {
      validate(data, '');
      state.log.push({ op: 'set', col: colName, id, data: clone(data), merge: !!(opts && opts.merge), seq: ++state.seq });
      col(colName)[id] = opts && opts.merge ? deepMerge(col(colName)[id], data) : clone(data);
    },
    update: async (data) => {
      validate(data, '');
      if (col(colName)[id] === undefined) { const e = new Error('NOT_FOUND: no entity to update'); e.code = 5; throw e; }
      state.log.push({ op: 'update', col: colName, id, data: clone(data), seq: ++state.seq });
      col(colName)[id] = { ...col(colName)[id], ...clone(data) };
    },
    delete: async () => {
      state.log.push({ op: 'delete', col: colName, id, seq: ++state.seq });
      delete col(colName)[id];
    },
    create: async (data) => {
      validate(data, '');
      if (col(colName)[id] !== undefined) { const e = new Error('6 ALREADY_EXISTS: Document already exists'); e.code = 6; throw e; }
      state.log.push({ op: 'create', col: colName, id, data: clone(data), seq: ++state.seq });
      col(colName)[id] = clone(data);
    },
  };
}

function queryOf(colName, conds, lim) {
  const run = () => {
    let docs = Object.keys(col(colName)).map(id => docSnap(colName, id));
    docs = docs.filter(d => conds.every(([f, op, v]) => {
      const x = d.data()[f];
      if (op === '==') return x === v;
      if (op === 'in') return v.includes(x);
      throw new Error('admin mock: unsupported op ' + op);
    }));
    if (lim) docs = docs.slice(0, lim);
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (cb) => docs.forEach(cb) };
  };
  return {
    where: (f, op, v) => queryOf(colName, [...conds, [f, op, v]], lim),
    limit: (n) => queryOf(colName, conds, n),
    get: async () => run(),
  };
}

let autoId = 0;
const db = {
  collection: (name) => ({
    ...queryOf(name, [], 0),
    doc: (id) => docRef(name, id),
    add: async (data) => {
      validate(data, '');
      const id = `auto_${++autoId}`;
      state.log.push({ op: 'add', col: name, id, data: clone(data), seq: ++state.seq });
      col(name)[id] = clone(data);
      return docRef(name, id);
    },
  }),
  runTransaction: async (fn) => {
    const tx = {
      get: async (ref) => ref.get(),
      set: (ref, data, opts) => { ref.set(data, opts); return tx; },
      update: (ref, data) => { ref.update(data); return tx; },
      delete: (ref) => { ref.delete(); return tx; },
    };
    return fn(tx);
  },
};

const messaging = {
  sendEachForMulticast: async ({ tokens, data }) => {
    const responses = tokens.map(t => {
      const code = state.messagingFailTokens[t];
      return code ? { success: false, error: { code } } : { success: true };
    });
    state.sent.push({ tokens: [...tokens], data: clone(data) });
    return { successCount: responses.filter(r => r.success).length, failureCount: responses.filter(r => !r.success).length, responses };
  },
};

let apps = [];
module.exports = {
  // firebase-admin/app
  initializeApp: () => { const a = { name: '[DEFAULT]' }; apps = [a]; return a; },
  getApps: () => apps,
  getApp: () => apps[0],
  cert: (c) => c,
  // firebase-admin/firestore
  getFirestore: () => db,
  // firebase-admin/messaging
  getMessaging: () => messaging,
  __reset: () => { state.store = {}; state.log = []; state.sent = []; state.messagingFailTokens = {}; autoId = 0; },
};
