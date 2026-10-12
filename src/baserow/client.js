/**
 * Minimal Baserow REST client.
 *
 * Baserow has two kinds of credentials:
 * - Database token (`Authorization: Token …`): row CRUD only, used at runtime.
 * - JWT from email/password (`Authorization: JWT …`): needed for schema work
 *   (workspaces, databases, tables, fields), used by the setup script.
 *
 * With `tokenViaProxy`, an outbound proxy adds the database token (e.g. a
 * Claude Code network secret). The client then sends no Authorization header
 * itself. Such a proxy overwrites every Authorization header, so JWT login
 * does not work through it.
 */

const BATCH_LIMIT = 200; // Baserow's maximum rows per batch request
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export class BaserowError extends Error {
  constructor(message, { status, code, detail, method, path } = {}) {
    super(message);
    this.name = 'BaserowError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.method = method;
    this.path = path;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export class BaserowClient {
  constructor({ url, token, tokenViaProxy = false, email, password, fetch = globalThis.fetch, timeoutMs = 20000, retries = 3 }) {
    if (!url) throw new Error('BaserowClient: url fehlt');
    this.url = url;
    this.token = token;
    this.tokenViaProxy = tokenViaProxy;
    this.email = email;
    this.password = password;
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.jwt = undefined;
  }

  get hasToken() {
    return Boolean(this.token) || this.tokenViaProxy;
  }

  get hasLogin() {
    return Boolean(this.email && this.password);
  }

  // ---------------------------------------------------------------- transport

  async #authHeader(auth) {
    if (auth === 'none') return {};
    if (auth === 'token' || (auth === 'auto' && this.hasToken)) {
      if (this.tokenViaProxy) return {};
      if (!this.token) throw new BaserowError('Kein Datenbank-Token konfiguriert (BASEROW_DATABASE_TOKEN).');
      return { Authorization: `Token ${this.token}` };
    }
    if (!this.jwt) await this.login();
    return { Authorization: `JWT ${this.jwt}` };
  }

  /**
   * @param {string} method
   * @param {string} path  API path starting with `/api/`
   * @param {{ body?: unknown, query?: Record<string, unknown>, auth?: 'auto'|'token'|'jwt'|'none' }} [options]
   */
  async request(method, path, { body, query, auth = 'auto' } = {}) {
    const target = new URL(path.startsWith('http') ? path : this.url + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }

    // Only idempotent requests are retried, so a timeout never duplicates a write.
    const retryable = method === 'GET';
    let jwtRefreshed = false;

    for (let attempt = 0; ; attempt++) {
      const headers = { Accept: 'application/json', ...(await this.#authHeader(auth)) };
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      let response;
      try {
        response = await this.fetch(target, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (retryable && attempt < this.retries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new BaserowError(`Keine Verbindung zu ${target.origin}: ${error.cause?.message ?? error.message}`, {
          code: 'NETWORK',
          method,
          path,
        });
      }

      // JWTs expire after a few minutes; log in again once and repeat.
      if (response.status === 401 && headers.Authorization?.startsWith('JWT ') && !jwtRefreshed && this.hasLogin) {
        jwtRefreshed = true;
        this.jwt = undefined;
        continue;
      }

      if (retryable && RETRY_STATUS.has(response.status) && attempt < this.retries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }

      if (response.status === 204) return null;

      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        const code = data?.error;
        const detail = data?.detail ?? data;
        const detailText = typeof detail === 'string' ? detail : JSON.stringify(detail);
        throw new BaserowError(
          `Baserow ${method} ${path} → ${response.status}${code ? ` ${code}` : ''}: ${detailText?.slice(0, 500) ?? ''}`,
          { status: response.status, code, detail, method, path },
        );
      }
      return data;
    }
  }

  // ------------------------------------------------------------------- server

  /** Public instance settings; works without credentials (reachability check). */
  getSettings() {
    return this.request('GET', '/api/settings/', { auth: 'none' });
  }

  /** Returns `true` if the database token is valid. */
  async checkToken() {
    try {
      await this.request('GET', '/api/database/tokens/check/', { auth: 'token' });
      return true;
    } catch (error) {
      if (error.status === 401 || error.status === 403) return false;
      throw error;
    }
  }

  async login() {
    if (!this.hasLogin) {
      throw new BaserowError('Für diesen Schritt werden BASEROW_EMAIL und BASEROW_PASSWORD benötigt.', {
        code: 'NO_LOGIN',
      });
    }
    const data = await this.request('POST', '/api/user/token-auth/', {
      auth: 'none',
      body: { email: this.email, password: this.password },
    });
    // `access_token` since Baserow 1.x, `token` in older versions.
    this.jwt = data.access_token ?? data.token;
    if (!this.jwt) throw new BaserowError('Anmeldung lieferte kein Token.', { detail: data });
    return data.user;
  }

  // ------------------------------------------------------------------- schema

  async listWorkspaces() {
    try {
      return await this.request('GET', '/api/workspaces/', { auth: 'jwt' });
    } catch (error) {
      // Baserow < 1.16 called workspaces "groups".
      if (error.status === 404) return this.request('GET', '/api/groups/', { auth: 'jwt' });
      throw error;
    }
  }

  /** All applications (databases include their `tables`) the user can access. */
  listApplications() {
    return this.request('GET', '/api/applications/', { auth: 'jwt' });
  }

  async createDatabase(workspaceId, name) {
    const body = { type: 'database', name };
    try {
      return await this.request('POST', `/api/applications/workspace/${workspaceId}/`, { auth: 'jwt', body });
    } catch (error) {
      if (error.status === 404) {
        return this.request('POST', `/api/applications/group/${workspaceId}/`, { auth: 'jwt', body });
      }
      throw error;
    }
  }

  listTables(databaseId) {
    return this.request('GET', `/api/database/tables/database/${databaseId}/`, { auth: 'jwt' });
  }

  /**
   * Creates a table whose only field is the primary text field `primaryFieldName`.
   * (Without `data`, Baserow adds sample fields and rows.)
   */
  createTable(databaseId, name, primaryFieldName) {
    return this.request('POST', `/api/database/tables/database/${databaseId}/`, {
      auth: 'jwt',
      body: { name, data: [[primaryFieldName]], first_row_header: true },
    });
  }

  listFields(tableId) {
    return this.request('GET', `/api/database/fields/table/${tableId}/`, { auth: 'jwt' });
  }

  createField(tableId, field) {
    return this.request('POST', `/api/database/fields/table/${tableId}/`, { auth: 'jwt', body: field });
  }

  updateField(fieldId, changes) {
    return this.request('PATCH', `/api/database/fields/${fieldId}/`, { auth: 'jwt', body: changes });
  }

  // --------------------------------------------------------------------- rows
  // Rows always use field names (`user_field_names=true`), never `field_123`.

  /**
   * One page of rows.
   * @param {number} tableId
   * @param {{ page?: number, size?: number, search?: string, orderBy?: string, filters?: object, include?: string[] }} [options]
   */
  listRows(tableId, { page = 1, size = 100, search, orderBy, filters, include } = {}) {
    return this.request('GET', `/api/database/rows/table/${tableId}/`, {
      query: {
        user_field_names: true,
        page,
        size,
        search,
        order_by: orderBy,
        filters: filters ? JSON.stringify(filters) : undefined,
        include: include?.join(','),
      },
    });
  }

  /** All rows of a table, following pagination. */
  async listAllRows(tableId, options = {}) {
    const rows = [];
    for (let page = 1; ; page++) {
      const data = await this.listRows(tableId, { ...options, page, size: 200 });
      rows.push(...data.results);
      if (!data.next) return rows;
    }
  }

  getRow(tableId, rowId) {
    return this.request('GET', `/api/database/rows/table/${tableId}/${rowId}/`, {
      query: { user_field_names: true },
    });
  }

  createRow(tableId, values) {
    return this.request('POST', `/api/database/rows/table/${tableId}/`, {
      query: { user_field_names: true },
      body: values,
    });
  }

  updateRow(tableId, rowId, values) {
    return this.request('PATCH', `/api/database/rows/table/${tableId}/${rowId}/`, {
      query: { user_field_names: true },
      body: values,
    });
  }

  deleteRow(tableId, rowId) {
    return this.request('DELETE', `/api/database/rows/table/${tableId}/${rowId}/`);
  }

  async createRows(tableId, rows) {
    const created = [];
    for (const part of chunk(rows, BATCH_LIMIT)) {
      const data = await this.request('POST', `/api/database/rows/table/${tableId}/batch/`, {
        query: { user_field_names: true },
        body: { items: part },
      });
      created.push(...data.items);
    }
    return created;
  }

  /** @param {Array<{ id: number } & Record<string, unknown>>} rows */
  async updateRows(tableId, rows) {
    const updated = [];
    for (const part of chunk(rows, BATCH_LIMIT)) {
      const data = await this.request('PATCH', `/api/database/rows/table/${tableId}/batch/`, {
        query: { user_field_names: true },
        body: { items: part },
      });
      updated.push(...data.items);
    }
    return updated;
  }

  async deleteRows(tableId, rowIds) {
    for (const part of chunk(rowIds, BATCH_LIMIT)) {
      await this.request('POST', `/api/database/rows/table/${tableId}/batch-delete/`, { body: { items: part } });
    }
  }
}
