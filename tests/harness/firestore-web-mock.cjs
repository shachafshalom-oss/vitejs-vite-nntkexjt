// Firestore מדומה בזיכרון (SDK הדפדפן) — מחליף את 'firebase/firestore' בבדיקות התהליכים.
// מחזיק store, רושם כל כתיבה ב-__fs.log, ומשדר onSnapshot מחדש אחרי כל כתיבה
// (מדמה latency compensation של Firestore האמיתי). מממש את הסמנטיקה שהקוד נשען עליה:
// setDoc (עם/בלי merge עמוק), updateDoc (אובייקט או זוגות FieldPath/ערך), deleteField,
// arrayUnion, addDoc, deleteDoc, query/where (== ו-in), runTransaction, writeBatch.
//
// כמו Firestore האמיתי — כתיבה עם ערך undefined או מערך בתוך מערך נזרקת כשגיאה.
// זה מכוון: באגים כאלה מפילים שמירה בייצור, ובלי הבדיקה הזו המוק היה מסתיר אותם.
const DELETE = { __deleteField: true };
class ArrayUnion { constructor(items) { this.items = items; } }

class FieldPath {
  constructor(...segments) { this.segments = segments; }
}

const state = globalThis.__fs = globalThis.__fs || { store: {}, log: [], listeners: [], seq: 0 };

function unionInto(arr, items) {
  const out = Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [];
  for (const it of items) { const j = JSON.stringify(it); if (!out.some(x => JSON.stringify(x) === j)) out.push(JSON.parse(j)); }
  return out;
}
function validateValue(v, path) {
  if (v === undefined) {
    const e = new Error(`Function called with invalid data. Unsupported field value: undefined (found in field ${path})`);
    e.code = 'invalid-argument';
    throw e;
  }
  if (v === DELETE || v instanceof ArrayUnion || v === null) return;
  if (typeof v === 'function') { const e = new Error(`Unsupported field value: a function (found in field ${path})`); e.code = 'invalid-argument'; throw e; }
  if (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
    const e = new Error(`Unsupported field value: a custom ${v.constructor && v.constructor.name} object (found in field ${path})`); e.code = 'invalid-argument'; throw e;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (Array.isArray(x)) { const e = new Error(`Nested arrays are not supported (field ${path})`); e.code = 'invalid-argument'; throw e; }
      validateValue(x, `${path}.${i}`);
    });
    return;
  }
  if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => validateValue(x, path ? `${path}.${k}` : k));
}
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function colStore(name) { return (state.store[name] = state.store[name] || {}); }

function getFirestore() { return { __db: true }; }
function collection(_db, name) { return { __type: 'col', name }; }
function doc(a, b, c) {
  if (a && a.__type === 'col') return { __type: 'doc', col: a.name, id: b };
  return { __type: 'doc', col: b, id: c };
}

function snapshotOf(colName) {
  const entries = Object.entries(colStore(colName));
  const docs = entries.map(([id, data]) => ({ id, data: () => clone(data), exists: () => true }));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb) => docs.forEach(cb) };
}

function emit(colName) {
  state.listeners.filter(l => l.col === colName).forEach(l => {
    if (l.docId) {
      const data = colStore(colName)[l.docId];
      l.cb({ id: l.docId, exists: () => data !== undefined, data: () => clone(data) });
    } else {
      l.cb(snapshotOf(colName));
    }
  });
}

function onSnapshot(ref, cb) {
  const l = ref.__type === 'col' ? { col: ref.name, cb } : { col: ref.col, docId: ref.id, cb };
  state.listeners.push(l);
  Promise.resolve().then(() => {
    if (l.docId) { const d = colStore(l.col)[l.docId]; cb({ id: l.docId, exists: () => d !== undefined, data: () => clone(d) }); }
    else cb(snapshotOf(l.col));
  });
  return () => { state.listeners = state.listeners.filter(x => x !== l); };
}

function deepMerge(target, src) {
  const out = { ...(target || {}) };
  for (const [k, v] of Object.entries(src || {})) {
    if (v === DELETE) { delete out[k]; continue; }
    if (v instanceof ArrayUnion) { out[k] = unionInto(out[k], v.items); continue; }
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

function setAtPath(obj, segments, value) {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!cur[segments[i]] || typeof cur[segments[i]] !== 'object') cur[segments[i]] = {};
    cur = cur[segments[i]];
  }
  const last = segments[segments.length - 1];
  if (value === DELETE) delete cur[last];
  else if (value instanceof ArrayUnion) cur[last] = unionInto(cur[last], value.items);
  else cur[last] = clone(value);
}

async function setDoc(ref, data, opts) {
  validateValue(data, '');
  state.log.push({ op: 'setDoc', col: ref.col, id: ref.id, data: clone(data), merge: !!(opts && opts.merge), seq: ++state.seq });
  const s = colStore(ref.col);
  s[ref.id] = opts && opts.merge ? deepMerge(s[ref.id], data) : clone(data);
  emit(ref.col);
}

async function updateDoc(ref, ...args) {
  args.forEach((a, i) => { if (!(a instanceof FieldPath) && !(i % 2 === 0 && args.length > 1 && typeof a === 'string')) validateValue(a, ''); });
  const s = colStore(ref.col);
  if (s[ref.id] === undefined) { const e = new Error('No document to update'); e.code = 'not-found'; throw e; }
  const next = clone(s[ref.id]);
  const pairs = [];
  if (args.length === 1 && !(args[0] instanceof FieldPath) && typeof args[0] === 'object') {
    for (const [k, v] of Object.entries(args[0])) pairs.push([k.split('.'), v]);
  } else {
    for (let i = 0; i < args.length; i += 2) {
      const f = args[i];
      pairs.push([f instanceof FieldPath ? f.segments : String(f).split('.'), args[i + 1]]);
    }
  }
  pairs.forEach(([segs, v]) => setAtPath(next, segs, v));
  state.log.push({ op: 'updateDoc', col: ref.col, id: ref.id, paths: pairs.map(([segs, v]) => ({ path: segs, value: v === DELETE ? '__DELETE__' : (v instanceof ArrayUnion ? { __arrayUnion: clone(v.items) } : clone(v)) })), seq: ++state.seq });
  s[ref.id] = next;
  emit(ref.col);
}

async function addDoc(colRef, data) {
  validateValue(data, '');
  const id = 'auto_' + (++state.seq);
  state.log.push({ op: 'addDoc', col: colRef.name, id, data: clone(data), seq: state.seq });
  colStore(colRef.name)[id] = clone(data);
  emit(colRef.name);
  return { id };
}

async function deleteDoc(ref) {
  state.log.push({ op: 'deleteDoc', col: ref.col, id: ref.id, seq: ++state.seq });
  delete colStore(ref.col)[ref.id];
  emit(ref.col);
}

async function getDocs(colRef) {
  const snap = snapshotOf(colRef.name);
  if (!colRef.conds || !colRef.conds.length) return snap;
  const docs = snap.docs.filter(d => colRef.conds.every(c => {
    const v = d.data()[c.field];
    if (c.op === '==') return v === c.value;
    if (c.op === 'in') {
      if (!Array.isArray(c.value) || c.value.length === 0 || c.value.length > 30) { const e = new Error(`Invalid Query. 'in' filter requires 1-30 values (got ${Array.isArray(c.value) ? c.value.length : typeof c.value})`); e.code = 'invalid-argument'; throw e; }
      return c.value.includes(v);
    }
    throw new Error('mock: unsupported op ' + c.op);
  }));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb) => docs.forEach(cb) };
}
async function getDoc(ref) { const d = colStore(ref.col)[ref.id]; return { id: ref.id, exists: () => d !== undefined, data: () => clone(d) }; }
async function runTransaction(_db, fn) {
  // כמו Firestore האמיתי: כל הקריאות לפני הכתיבות, הכתיבות נצברות ומתבצעות יחד בסוף.
  // אם אחת מהן לא תקינה (למשל update למסמך שנמחק) — שום כתיבה לא מתבצעת.
  const queue = [];
  const tx = {
    get: async (r) => { if (queue.length) throw new Error('Firestore transactions require all reads to be executed before all writes.'); return getDoc(r); },
    update: (r, d) => { validateValue(d, ''); queue.push({ op: 'update', r, d }); return tx; },
    set: (r, d, o) => { validateValue(d, ''); queue.push({ op: 'set', r, d, o }); return tx; },
    delete: (r) => { queue.push({ op: 'delete', r }); return tx; },
  };
  const result = await fn(tx);
  const exists = {};
  for (const w of queue) {
    const key = `${w.r.col}/${w.r.id}`;
    const cur = key in exists ? exists[key] : colStore(w.r.col)[w.r.id] !== undefined;
    if (w.op === 'update' && !cur) { const e = new Error(`No document to update: ${key}`); e.code = 'not-found'; throw e; }
    exists[key] = w.op !== 'delete';
  }
  for (const w of queue) {
    if (w.op === 'update') await updateDoc(w.r, w.d);
    else if (w.op === 'set') await setDoc(w.r, w.d, w.o);
    else await deleteDoc(w.r);
  }
  return result;
}
function deleteField() { return DELETE; }
function arrayUnion(...items) { return new ArrayUnion(items); }
function serverTimestamp() { return new Date().toISOString(); }
function query(ref, ...conds) { return { __type: 'col', name: ref.name, conds: conds.filter(c => c && c.__where) }; }
function where(field, op, value) { return { __where: true, field, op, value }; }
function orderBy() { return {}; }
function limit() { return {}; }
function writeBatch() { const ops = []; return { set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, d) => ops.push(() => updateDoc(r, d)), delete: (r) => ops.push(() => deleteDoc(r)), commit: async () => { for (const o of ops) await o(); } }; }

module.exports = globalThis.__fsApi = { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, getDocs, getDoc, runTransaction, deleteField, arrayUnion, FieldPath, serverTimestamp, query, where, orderBy, limit, writeBatch };
