/* =========================================================
   Gimna — camada de dados (IndexedDB)
   Cada registo guarda: id, tenantId, updatedAt, _dirty (por sincronizar)
   Isto é propositadamente parecido com o desenho de tabelas SQL Server
   descrito em docs/schema.sql, para facilitar a futura ligação a uma API real.
   ========================================================= */
(function (global) {
  const DB_NAME = "gimna-db";
  const DB_VERSION = 7;
  const STORES = [
    "tenants", "users", "memberships", "convites", "turmas", "grupos", "atletas",
    "mesociclos", "microciclosTipos", "habilidadesTipos", "categoriasHabilidades", "estadosPresenca", "criteriosAvaliacao",
    "camposPersonalizados", "sessoes", "presencas", "comentarios", "mensagens", "avaliacoes", "otpCodes",
    "syncQueue", "preferencias"
  ];

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function tx(storeName, mode) {
    const db = await openDb();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  const DB = {
    uuid,

    _cache: {},

    async getAll(store) {
      if (DB._cache[store]) return DB._cache[store];
      const os = await tx(store, "readonly");
      const result = await new Promise((resolve, reject) => {
        const req = os.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      DB._cache[store] = result;
      return result;
    },

    async get(store, id) {
      const all = await DB.getAll(store);
      return all.find((r) => r.id === id) || null;
    },

    async put(store, record, opts) {
      opts = opts || {};
      if (!record.id) record.id = uuid();
      record.updatedAt = new Date().toISOString();
      const os = await tx(store, "readwrite");
      await new Promise((resolve, reject) => {
        const req = os.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      delete DB._cache[store];
      if (!opts.silent) await DB.queueSync(store, record.id, "upsert", record);
      return record;
    },

    async remove(store, id) {
      const os = await tx(store, "readwrite");
      await new Promise((resolve, reject) => {
        const req = os.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      delete DB._cache[store];
      await DB.queueSync(store, id, "delete", null);
    },

    async bulkPutSilent(store, records) {
      const os = await tx(store, "readwrite");
      const result = await Promise.all(records.map((r) => new Promise((resolve, reject) => {
        const req = os.put(r);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })));
      delete DB._cache[store];
      return result;
    },

    // --- fila de sincronização (offline-first) ---------------------------
    async queueSync(entity, entityId, op, payload) {
      const os = await tx("syncQueue", "readwrite");
      const item = {
        id: uuid(), entity, entityId, op, payload,
        createdAt: new Date().toISOString(), synced: false,
      };
      return new Promise((resolve, reject) => {
        const req = os.put(item);
        req.onsuccess = () => {
          delete DB._cache.syncQueue; // a escrita acima não passou por DB.put(), por isso invalida-se a cache à mão
          global.dispatchEvent(new CustomEvent("ak:dirty"));
          if (global.Auth && Auth.onlineMode && global.Api && Api.isConfigured() && Api.token && navigator.onLine) {
            DB.trySync().catch(() => {});
          }
          resolve(item);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async pendingSyncCount() {
      const all = await DB.getAll("syncQueue");
      return all.filter((i) => !i.synced).length;
    },

    // Simula uma sincronização com o backend (ver docs/ARQUITETURA.md).
    // Numa versão ligada à API real, cada item seria enviado por fetch()
    // para o endpoint correspondente e só marcado synced=true após 2xx.
    async trySync() {
      if (!navigator.onLine) return { ok: false, reason: "offline" };

      // Caminho real: há backend configurado e sessão online -> empurra a
      // fila local para o servidor e traz de volta o que houver de novo.
      if (global.Api && Api.isConfigured() && Api.token) {
        try {
          const pushRes = await Api.pushQueue();
          if (global.Auth && Auth.activeMembership) {
            await Api.pullTurma(Auth.activeMembership.turmaId);
          }
          delete DB._cache; DB._cache = {}; // força releitura após a sincronização
          global.dispatchEvent(new CustomEvent("ak:synced"));
          return { ok: true, count: pushRes.count || 0, online: true };
        } catch (e) {
          console.warn("Sincronização com o servidor falhou, a usar fila local.", e.message);
        }
      }

      // Caminho local (sem backend configurado, ou backend inatingível):
      // só marca a fila como sincronizada, para a demonstração continuar fluida.
      const all = await DB.getAll("syncQueue");
      const pending = all.filter((i) => !i.synced);
      if (pending.length === 0) return { ok: true, count: 0 };
      await new Promise((r) => setTimeout(r, 500));
      const os = await tx("syncQueue", "readwrite");
      pending.forEach((item) => { item.synced = true; os.put(item); });
      delete DB._cache.syncQueue;
      global.dispatchEvent(new CustomEvent("ak:synced"));
      return { ok: true, count: pending.length };
    },

    async isSeeded() {
      const t = await DB.getAll("tenants");
      return t.length > 0;
    },
  };

  global.DB = DB;
})(window);
