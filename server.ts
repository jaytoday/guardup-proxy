import * as http from 'http';
import * as https from 'https';
import { parse } from 'url';
import httpProxy, { ServerOptions } from 'http-proxy';
import { PassThrough } from 'stream';

// Toggle this to turn on/off the “peek JSON-RPC method” logging and intent-based auth
const USE_PEEK_INTENT = true;

/**
 * Configuration constants for the proxy server
 */
const CONFIG = {
  PORT: parseInt(process.env.GUARDUP_PROXY_SERVICE_PORT || '3001', 10),
  WEB_APP_API_BASE: process.env.WEB_APP_API_BASE || 'https://guardup.ai/api',
  PROXY_OPTIONS: {
    changeOrigin: true,
    secure: true,
    ws: true,
  } as ServerOptions,
} as const;

/**
 * Interface for the auth‐server response data
 */
interface ServerResponseData {
  url: string;
  requireAuth: boolean;
}

/**
 * Fetches both the target URL *and* the “requireAuth” flag
 */
async function fetchServerData(proxyId: string): Promise<ServerResponseData> {
  const api = `${CONFIG.WEB_APP_API_BASE}/servers/${proxyId}`;
  console.log('🔍 fetchServerData ->', api);

  const res = await fetch(api).catch(err => {
    throw new Error(`Network error: ${err}`);
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Upstream ${res.status}: ${txt}`);
  }

  const data = (await res.json()) as ServerResponseData;
  if (!data.url || typeof data.requireAuth !== 'boolean') {
    throw new Error('Invalid JSON from auth server');
  }

  return data;
}

/**
 * Peeks into the first ~1KB of a JSON-RPC POST stream
 * and extracts the “method” field.
 */
function peekMethod(stream: PassThrough): Promise<string> {
  return new Promise(resolve => {
    let buf = Buffer.alloc(0);

    function onData(chunk: Buffer) {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1024) finish();
    }
    function onEnd() { finish(); }

    function finish() {
      stream.off('data', onData);
      stream.off('end', onEnd);
      const txt = buf.toString();
      const m = txt.match(/"method"\s*:\s*"([^"]+)"/);
      let type = 'UNKNOWN';
      if (m) {
        if (['initialize', 'notifications/initialized'].includes(m[1])) type = 'INITIALIZE';
        else if (['tools/list', 'resources/list', 'prompts/list'].includes(m[1])) type = 'LIST TOOLS';
        else                                  type = `INVOKE TOOL: ${m[1]}`;
      }
      resolve(type);
    }

    stream.on('data', onData);
    stream.on('end',  onEnd);
  });
}

/**
 * Creates and configures the HTTP proxy server
 */
const createProxyServer = (): httpProxy => {
  const proxyOptions: ServerOptions = {
    ...CONFIG.PROXY_OPTIONS,
    secure: true,
    xfwd: true,
    preserveHeaderKeyCase: true,
    timeout: 30000,
    ssl: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
    agent: new http.Agent({
      keepAlive:      true,
      keepAliveMsecs: 60000,
      maxSockets:     100,
      maxFreeSockets: 10,
      timeout:        60000,
    }),
  };

  const proxy = httpProxy.createProxyServer(proxyOptions);

  proxy.on('proxyReq', (proxyReq, req: http.IncomingMessage) => {
    if ('protocol' in proxyReq && 'host' in proxyReq && 'path' in proxyReq) {
      // @ts-ignore
      console.log(`➡️  Outgoing request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
    }
    proxyReq.setHeader('x-forwarded-proto', 'https');
    proxyReq.setHeader('x-forwarded-host',  req.headers.host || '');
    proxyReq.setHeader('x-forwarded-for',   req.socket.remoteAddress || '');
  });

  proxy.on('proxyRes', (upRes, req, res) => {
    console.log(`⬅️  Response from upstream: ${upRes.statusCode} ${req.url}`);
    if (!res.getHeader('x-content-type-options')) { res.setHeader('x-content-type-options', 'nosniff'); }
    if (!res.getHeader('x-frame-options'))         { res.setHeader('x-frame-options',         'DENY'); }
    if (!res.getHeader('x-xss-protection'))       { res.setHeader('x-xss-protection',       '1; mode=block'); }
    if (!res.getHeader('referrer-policy'))        { res.setHeader('referrer-policy',        'same-origin'); }
    res.writeHead(upRes.statusCode!, upRes.headers as http.OutgoingHttpHeaders);
    upRes.pipe(res);
  });

  proxy.on('error', err => {
    console.error('🔥 GLOBAL proxy error:', err);
  });

  return proxy;
};

/**
 * Extracts the proxy ID from the host header
 */
const extractProxyId = (host: string): string => {
  const parts = host.split('.');
  if (parts.length < 3) throw new Error('Invalid host format. Expected <proxy-id>.<domain>.<tld>');
  return parts[0];
};

/**
 * Handles incoming HTTP requests, with intent‐aware auth
 */
const handleRequest = async (
  proxy: httpProxy,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.statusCode = 504;
      res.end('Gateway Timeout');
    }
    if (!req.destroyed) req.destroy();
  }, 30000);

  try {
    if (!req.headers.host) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Host header missing');
      return;
    }

    const proxyId = extractProxyId(req.headers.host);
    console.log(`[${new Date().toISOString()}] Proxying request for proxy ID: ${proxyId}`);

    const { url: targetUrl, requireAuth } = await fetchServerData(proxyId);
    console.log('Resolved target URL:', targetUrl, 'requireAuth=', requireAuth);

    // rewrite the request URL to point at the target
    const { pathname, search } = parse(req.url || '/', true);
    const target = new URL(targetUrl);
    req.url = `${target.pathname.replace(/\/+$/, '')}${pathname}${search || ''}`;

    // choose the right agent
    const agent = target.protocol === 'https:'
      ? https.globalAgent
      : http.globalAgent;

    // common proxy options for this request
    const opts = {
      target:                 target.origin,
      changeOrigin:           true,
      secure:                 true,
      ws:                     true,
      xfwd:                   true,
      preserveHeaderKeyCase:  true,
      timeout:                25000,
      agent, // <— ensure https: targets use the HTTPS agent
    };

    res.on('close', () => clearTimeout(requestTimeout));

    if (req.method === 'POST' && USE_PEEK_INTENT) {
      console.log('--> PEEK_INTENT enabled');

      const proxyReqStream = new PassThrough();
      const peekStream     = new PassThrough();
      req.pipe(proxyReqStream);
      req.pipe(peekStream);

      Object.assign(proxyReqStream as any, {
        headers:     req.headers,
        method:      req.method,
        url:         req.url,
        socket:      req.socket,
        connection:  req.socket,
        httpVersion: req.httpVersion,
        setTimeout:  req.setTimeout.bind(req),
      });

      const intent = await peekMethod(peekStream);
      console.log(`⏩ Detected intent: ${intent}`);

      if (intent.startsWith('INVOKE TOOL') && requireAuth) {
        console.log('🔒 Tool call without auth – rejecting');
        res.writeHead(401, { 'Content-Type': 'text/plain' }).end('GuardUp Error: Two Factor Authentication Required');
        return;
      }

      proxy.web(proxyReqStream as any, res, opts);
    } else {
      proxy.web(req, res, opts);
    }
  } catch (err: any) {
    clearTimeout(requestTimeout);
    console.error('Request handling error:', err);

    if (!res.headersSent) {
      let statusCode = 500;
      let message    = 'Internal Server Error';

      if (err.message.includes('Invalid host format')) {
        statusCode = 400; message = err.message;
      } else if (err.message.startsWith('Upstream')) {
        statusCode = 502; message = err.message;
      }

      res.writeHead(statusCode, { 'Content-Type': 'text/plain' }).end(message);
    }
  }
};

/**
 * Graceful shutdown helper
 */
const gracefulShutdown = (server: http.Server, signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully…`);
  server.close(err => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forcing shutdown…');
    process.exit(1);
  }, 10000);
};

/**
 * Bootstrap the server
 */
function startServer() {
  const proxy  = createProxyServer();
  const server = http.createServer((req, res) => {
    handleRequest(proxy, req, res).catch(err => {
      console.error('Unhandled error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Internal Server Error');
      }
    });
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout   = 70000;

  server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`\n=== Proxy Server Started on port ${CONFIG.PORT} ===`);
  });

  server.on('error', err => {
    console.error('Server error:', err);
    process.exit(1);
  });

  ['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(sig =>
    process.on(sig, () => gracefulShutdown(server, sig))
  );
}

startServer();