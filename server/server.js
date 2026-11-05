const express = require('express');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const PORT = process.env.PORT || 3000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA = path.join(__dirname, 'data', 'reports');
fs.mkdirSync(DATA, { recursive: true });

const MODES = [
  'normal',
  'delay',
  'error500',
  'reject400',
  'reject413',
  'hang',
  'drop',
  'lose-response',
];
const chaos = {
  mode: 'normal',
  delayMs: 8000,
  remaining: null,
  bytesPerSec: 0,
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

const validId = id => /^[a-zA-Z0-9-]{1,80}$/.test(id);
const dirOf = id => path.join(DATA, id);
const metaPath = id => path.join(dirOf(id), 'meta.json');
const commitPath = id => path.join(dirOf(id), 'committed.json');
const imagePath = (id, i) => path.join(dirOf(id), `${i}.jpg`);

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function reply(res, status, body) {
  if (res.locals.loseResponse) {
    log('  -> data saved, DROPPING the response');
    res.req.socket.destroy();
    return;
  }
  res.status(status).json(body);
}

function readBody(req, res, maxBytes) {
  return new Promise((resolve, reject) => {
    const expected = Number(req.headers['content-length'] || 0);
    const chunks = [];
    let received = 0;
    let done = false;
    const fail = err => {
      if (!done) {
        done = true;
        reject(err);
      }
    };
    req.on('data', chunk => {
      if (done) return;
      received += chunk.length;
      if (received > maxBytes) {
        const e = new Error('too large');
        e.status = 413;
        return fail(e);
      }
      chunks.push(chunk);
      if (res.locals.dropMidBody && received >= (expected ? expected / 2 : 1)) {
        log(`  -> DROPPING connection mid-upload (${received} bytes received)`);
        req.socket.destroy();
        return fail(new Error('dropped'));
      }
      if (chaos.bytesPerSec > 0) {
        req.pause();
        setTimeout(
          () => req.resume(),
          (chunk.length / chaos.bytesPerSec) * 1000,
        );
      }
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', fail);
    req.on('aborted', () => fail(new Error('aborted by client')));
  });
}

const app = express();

app.use((req, res, next) => {
  const startedAt = Date.now();
  if (!req.path.startsWith('/admin')) {
    log('REQUEST', req.method, req.originalUrl);
  }
  res.on('finish', () => {
    log(
      'RESPONSE',
      req.method,
      req.originalUrl,
      res.statusCode,
      `${Date.now() - startedAt}ms`,
    );
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      log('CONNECTION CLOSED BEFORE RESPONSE', req.method, req.originalUrl);
    }
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/admin/set', (req, res) => {
  const { mode, delayMs, times, bytesPerSec } = req.query;
  if (mode !== undefined) {
    if (!MODES.includes(mode)) {
      return res.status(400).json({ error: 'unknown mode', allowed: MODES });
    }
    chaos.mode = mode;
    chaos.remaining = times ? Number(times) : null;
  }
  if (delayMs !== undefined) chaos.delayMs = Number(delayMs);
  if (bytesPerSec !== undefined) chaos.bytesPerSec = Number(bytesPerSec);
  log('ADMIN ->', JSON.stringify(chaos));
  res.json(chaos);
});

app.get('/admin/status', (req, res) => {
  const ids = fs.readdirSync(DATA);
  const committed = ids.filter(id => fs.existsSync(commitPath(id))).length;
  res.json({ chaos, modes: MODES, reportsOnDisk: ids.length, committed });
});

app.get('/admin/clear', (req, res) => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });
  log('ADMIN -> all server data cleared');
  res.json({ cleared: true });
});

app.get('/files/:id/:file', (req, res) => {
  const { id, file } = req.params;
  if (!validId(id) || !/^[0-4]\.jpg$/.test(file)) return res.sendStatus(400);
  const p = path.join(dirOf(id), file);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  res.sendFile(p);
});

app.use('/reports', (req, res, next) => {
  const mode = chaos.mode;
  if (mode === 'normal') return next();

  if (chaos.remaining !== null) {
    chaos.remaining -= 1;
    if (chaos.remaining <= 0) {
      chaos.mode = 'normal';
      chaos.remaining = null;
      log('  (failure budget used up, back to normal)');
    }
  }
  log(`  [chaos: ${mode}]`);

  switch (mode) {
    case 'delay':
      return setTimeout(next, chaos.delayMs);
    case 'error500':
      return res.status(500).json({ error: 'injected server error' });
    case 'reject400':
      return res.status(400).json({ error: 'injected rejection' });
    case 'reject413':
      return res.status(413).json({ error: 'injected: payload too large' });
    case 'hang':
      return;
    case 'drop':
      if (req.method === 'PUT' && /\/images\/\d+$/.test(req.path)) {
        res.locals.dropMidBody = true;
        return next();
      }
      return req.socket.destroy();
    case 'lose-response':
      res.locals.loseResponse = true;
      return next();
    default:
      return next();
  }
});

app.put('/reports/:id', express.json(), (req, res) => {
  const { id } = req.params;
  const { description, createdAt, imageCount } = req.body || {};
  if (!validId(id)) return reply(res, 400, { error: 'bad id' });
  if (typeof description !== 'string' || description.trim() === '') {
    return reply(res, 400, { error: 'description required' });
  }
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > 5) {
    return reply(res, 400, { error: 'imageCount must be 1-5' });
  }
  if (fs.existsSync(commitPath(id))) {
    return reply(res, 200, { ok: true, alreadyCommitted: true });
  }
  fs.mkdirSync(dirOf(id), { recursive: true });
  writeAtomic(
    metaPath(id),
    JSON.stringify({
      id,
      description: description.trim(),
      createdAt,
      imageCount,
    }),
  );
  reply(res, 200, { ok: true });
});

app.put('/reports/:id/images/:index', async (req, res) => {
  const { id } = req.params;
  const index = Number(req.params.index);
  if (!validId(id) || !Number.isInteger(index) || index < 0 || index > 4) {
    return reply(res, 400, { error: 'bad id or index' });
  }
  if (!fs.existsSync(metaPath(id)))
    return reply(res, 404, { error: 'unknown report' });
  const meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
  if (index >= meta.imageCount)
    return reply(res, 400, { error: 'index out of range' });

  if (fs.existsSync(commitPath(id))) {
    req.resume();
    return reply(res, 200, { ok: true, alreadyCommitted: true });
  }
  if (Number(req.headers['content-length'] || 0) > MAX_IMAGE_BYTES) {
    req.resume();
    return reply(res, 413, { error: 'image over 5 MB' });
  }

  try {
    const body = await readBody(req, res, MAX_IMAGE_BYTES);
    if (body.length === 0) return reply(res, 400, { error: 'empty body' });
    writeAtomic(imagePath(id, index), body);
    log(
      `  saved image ${index} of ${id} (${(body.length / 1024).toFixed(0)} KB)`,
    );
    reply(res, 200, { ok: true, bytes: body.length });
  } catch (e) {
    if (e.status === 413) return reply(res, 413, { error: 'image over 5 MB' });
    log('  upload interrupted:', e.message);
  }
});

app.post('/reports/:id/commit', express.json(), (req, res) => {
  const { id } = req.params;
  if (!validId(id)) return reply(res, 400, { error: 'bad id' });
  if (!fs.existsSync(metaPath(id)))
    return reply(res, 404, { error: 'unknown report' });
  if (fs.existsSync(commitPath(id)))
    return reply(res, 200, { ok: true, alreadyCommitted: true });

  const meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
  for (let i = 0; i < meta.imageCount; i++) {
    if (!fs.existsSync(imagePath(id, i))) {
      return reply(res, 409, { error: `photo ${i} missing` });
    }
  }
  writeAtomic(commitPath(id), JSON.stringify({ committedAt: Date.now() }));
  log(`  COMMITTED report ${id}`);
  reply(res, 200, { ok: true });
});

app.get('/reports', (req, res) => {
  const out = [];
  for (const id of fs.readdirSync(DATA)) {
    if (!fs.existsSync(commitPath(id))) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
    out.push({
      id,
      description: meta.description,
      createdAt: meta.createdAt,
      images: Array.from(
        { length: meta.imageCount },
        (_, i) => `/files/${id}/${i}.jpg`,
      ),
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  res.json(out);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  log(
    `Server on http://localhost:${PORT}  (emulator uses http://10.0.2.2:${PORT})`,
  );
  log(`Failure modes: ${MODES.join(', ')}`);
});
server.requestTimeout = 0;
