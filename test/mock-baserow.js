// In-memory stand-in for the subset of the Baserow REST API the app uses.
import { createServer } from 'node:http';

export async function startMockBaserow({ email = 'nils@example.com', password = 'geheim', token = 'db-token' } = {}) {
  let nextId = 1;
  const id = () => nextId++;
  const state = {
    requests: [],
    failNext: [], // statuses to return for the next requests (e.g. [503])
    workspaces: [{ id: id(), name: 'ATELIER BRÜCKNER' }],
    databases: [],
    tables: [],
    fields: [],
    rows: new Map(), // tableId -> rows
    jwts: new Set(),
  };

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const auth = req.headers.authorization ?? '';
    state.requests.push({ method: req.method, path: url.pathname, auth });

    if (state.failNext.length) return send(res, state.failNext.shift(), { error: 'ERROR_TEST' });

    const isJwt = auth.startsWith('JWT ') && state.jwts.has(auth.slice(4));
    const isToken = auth === `Token ${token}`;
    const route = `${req.method} ${url.pathname}`;
    let m;

    if (route === 'GET /api/settings/') return send(res, 200, { instance_id: 'mock' });

    if (route === 'POST /api/user/token-auth/') {
      if (body?.email !== email || body?.password !== password) {
        return send(res, 400, { error: 'ERROR_INVALID_CREDENTIALS', detail: 'Invalid credentials' });
      }
      const jwt = `jwt-${id()}`;
      state.jwts.add(jwt);
      return send(res, 200, { user: { first_name: 'Nils', username: email }, access_token: jwt, refresh_token: 'r' });
    }

    if (route === 'GET /api/database/tokens/check/') {
      return isToken ? send(res, 200, { token: 'OK' }) : send(res, 401, { error: 'ERROR_TOKEN_DOES_NOT_EXIST' });
    }

    // Row endpoints accept token or JWT.
    if ((m = url.pathname.match(/^\/api\/database\/rows\/table\/(\d+)\/(?:(\d+)\/|(batch)\/|(batch-delete)\/)?$/))) {
      if (!isToken && !isJwt) return send(res, 401, { error: 'ERROR_INVALID_ACCESS_TOKEN' });
      const tableId = Number(m[1]);
      if (!state.rows.has(tableId)) return send(res, 404, { error: 'ERROR_TABLE_DOES_NOT_EXIST' });
      const rows = state.rows.get(tableId);
      const rowId = m[2] && Number(m[2]);

      if (m[4] && req.method === 'POST') {
        state.rows.set(tableId, rows.filter((r) => !body.items.includes(r.id)));
        return send(res, 204);
      }
      if (m[3] && req.method === 'POST') {
        const items = body.items.map((item) => ({ id: id(), ...item }));
        rows.push(...items);
        return send(res, 200, { items });
      }
      if (m[3] && req.method === 'PATCH') {
        const items = body.items.map((item) => Object.assign(rows.find((r) => r.id === item.id), item));
        return send(res, 200, { items });
      }
      if (!rowId && req.method === 'GET') {
        const page = Number(url.searchParams.get('page') ?? 1);
        const size = Number(url.searchParams.get('size') ?? 100);
        const results = rows.slice((page - 1) * size, page * size);
        const next = page * size < rows.length ? `${url.origin}${url.pathname}?page=${page + 1}` : null;
        return send(res, 200, { count: rows.length, next, previous: null, results });
      }
      if (!rowId && req.method === 'POST') {
        const row = { id: id(), ...body };
        rows.push(row);
        return send(res, 200, row);
      }
      const row = rows.find((r) => r.id === rowId);
      if (!row) return send(res, 404, { error: 'ERROR_ROW_DOES_NOT_EXIST' });
      if (req.method === 'GET') return send(res, 200, row);
      if (req.method === 'PATCH') return send(res, 200, Object.assign(row, body));
      if (req.method === 'DELETE') {
        rows.splice(rows.indexOf(row), 1);
        return send(res, 204);
      }
    }

    // Everything below requires a JWT.
    if (!isJwt) return send(res, 401, { error: 'ERROR_INVALID_ACCESS_TOKEN' });

    if (route === 'GET /api/workspaces/') return send(res, 200, state.workspaces);

    if (route === 'GET /api/applications/') {
      return send(res, 200, state.databases.map((db) => ({
        ...db,
        type: 'database',
        workspace: state.workspaces.find((w) => w.id === db.workspaceId),
        tables: state.tables.filter((t) => t.database_id === db.id),
      })));
    }

    if ((m = route.match(/^POST \/api\/applications\/workspace\/(\d+)\/$/))) {
      const db = { id: id(), name: body.name, workspaceId: Number(m[1]) };
      state.databases.push(db);
      return send(res, 200, { ...db, type: 'database' });
    }

    if ((m = url.pathname.match(/^\/api\/database\/tables\/database\/(\d+)\/$/))) {
      const databaseId = Number(m[1]);
      if (req.method === 'GET') return send(res, 200, state.tables.filter((t) => t.database_id === databaseId));
      const table = { id: id(), name: body.name, database_id: databaseId };
      state.tables.push(table);
      state.rows.set(table.id, []);
      state.fields.push({ id: id(), table_id: table.id, name: body.data[0][0], type: 'text', primary: true });
      return send(res, 200, table);
    }

    if ((m = url.pathname.match(/^\/api\/database\/fields\/table\/(\d+)\/$/))) {
      const tableId = Number(m[1]);
      if (req.method === 'GET') return send(res, 200, state.fields.filter((f) => f.table_id === tableId));
      if (state.fields.some((f) => f.table_id === tableId && f.name === body.name)) {
        return send(res, 400, { error: 'ERROR_FIELD_WITH_SAME_NAME_ALREADY_EXISTS' });
      }
      const field = { id: id(), table_id: tableId, primary: false, ...body };
      state.fields.push(field);
      if (body.type === 'link_row') {
        const own = state.tables.find((t) => t.id === tableId);
        state.fields.push({
          id: id(), table_id: body.link_row_table_id, primary: false, name: own.name, type: 'link_row', link_row_table_id: tableId,
        });
      }
      return send(res, 200, field);
    }

    send(res, 404, { error: 'ERROR_URL_NOT_FOUND', detail: route });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, state, email, password, token, close: () => new Promise((r) => server.close(r)) };
}
