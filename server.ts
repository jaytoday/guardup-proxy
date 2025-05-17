import * as http from 'http';
import { parse } from 'url';
import httpProxy, { ServerOptions } from 'http-proxy';
// Use native fetch in Node.js 18+; remove node-fetch import and global declaration.
type Response = globalThis.Response;

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
 * Interface for the server response data
 */
interface ServerResponseData {
  url: string;
}

/**
 * Creates and configures the HTTP proxy server
 */
/**
 * Creates and configures an HTTP proxy server with enhanced error handling and logging
 */
const createProxyServer = (): httpProxy => {
  // Configure proxy options
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
      keepAlive: true,
      keepAliveMsecs: 60000,
      maxSockets: 100,
      maxFreeSockets: 10,
      timeout: 60000,
    }),
  };

  const proxy = httpProxy.createProxyServer(proxyOptions);

  // Log proxy events for debugging (use correct signatures)
  proxy.on('proxyReq', (proxyReq, req: http.IncomingMessage) => {
    // Log the outgoing request
    if ('protocol' in proxyReq && 'host' in proxyReq && 'path' in proxyReq) {
      // @ts-ignore
      console.log(`Outgoing request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
    }
    proxyReq.setHeader('x-forwarded-proto', 'https');
    proxyReq.setHeader('x-forwarded-host', req.headers.host || '');
    proxyReq.setHeader('x-forwarded-for', req.socket.remoteAddress || '');
  });

  proxy.on('proxyRes', (proxyRes, req: http.IncomingMessage, res: http.ServerResponse) => {
    console.log(`Response from upstream: ${proxyRes.statusCode} ${req.url}`);
    if (!res.getHeader('x-content-type-options')) {
      res.setHeader('x-content-type-options', 'nosniff');
    }
    if (!res.getHeader('x-frame-options')) {
      res.setHeader('x-frame-options', 'DENY');
    }
    if (!res.getHeader('x-xss-protection')) {
      res.setHeader('x-xss-protection', '1; mode=block');
    }
    if (!res.getHeader('referrer-policy')) {
      res.setHeader('referrer-policy', 'same-origin');
    }
  });

  // Handle proxy errors
  proxy.on('error', function (err: Error) {
    // Only the error object is available here
    console.error('Proxy error:', err);
  });


  return proxy;
};

/**
 * Fetches the target URL for a given proxy ID from the web app service
 * @param proxyId - The unique identifier for the target server
 * @returns The target URL string
 * @throws Will throw an error if the fetch fails or returns non-OK status
 */
const fetchTargetUrl = async (proxyId: string): Promise<string> => {
  const fetchUrl = `${CONFIG.WEB_APP_API_BASE}/servers/${proxyId}`;
  console.log('Fetching MCP server URL:', fetchUrl);
  
  let response: Response;
  try {
    response = await fetch(fetchUrl);
  } catch (error) {
    console.error('Network error when fetching MCP server URL:', error);
    throw new Error(`Network error when fetching MCP server URL: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  if (response.status === 403) {
    throw new Error('Permission denied: additional authentication required (e.g., two-factor authentication)');
  }
  
  if (!response.ok) {
    console.error('Failed to fetch MCP server URL. Status:', response.status);
    const errorText = await response.text().catch(() => 'No error details');
    console.error('Error response:', errorText);
    throw new Error(`Failed to fetch MCP server URL for ID: ${proxyId}. Status: ${response.status} ${response.statusText}`);
  }
  
  let data: ServerResponseData;
  try {
    data = await response.json() as ServerResponseData;
  } catch (error) {
    console.error('Failed to parse JSON response:', error);
    throw new Error('Invalid JSON response from server');
  }
  
  if (!data || typeof data.url !== 'string') {
    console.error('Invalid response format. Expected { url: string } but got:', data);
    throw new Error('Invalid response format from server');
  }
  
  return data.url;
};

/**
 * Extracts the proxy ID from the host header
 * @param host - The host header from the request
 * @returns The extracted proxy ID
 * @throws Will throw an error if the host header is invalid
 */
const extractProxyId = (host: string): string => {
  const hostParts = host.split('.');
  if (hostParts.length < 3) {
    throw new Error('Invalid host format. Expected format: <proxy-id>.<domain>.<tld>');
  }
  return hostParts[0];
};

/**
 * Handles incoming HTTP requests
 * @param proxy - The HTTP proxy instance
 * @param req - The HTTP request
 * @param res - The HTTP response
 */
const handleRequest = async (
  proxy: httpProxy,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  // Set a default timeout for the request handling
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.statusCode = 504;
      res.end('Gateway Timeout');
    }
    if (!req.destroyed) {
      req.destroy();
    }
  }, 30000); // 30 seconds timeout

  try {
    // Validate host header
    if (!req.headers.host) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Host header is missing');
      return;
    }

    // Extract and validate proxy ID
    const proxyId = extractProxyId(req.headers.host);
    
    // Log the incoming request
    console.log(`[${new Date().toISOString()}] Proxying request for proxy ID: ${proxyId}`);
    
    // Fetch target URL
    const targetUrl = await fetchTargetUrl(proxyId);
    
    // Prepare the request URL for proxying
    const parsedUrl = parse(req.url || '/', true);
    let target: URL;
    
    try {
      target = new URL(targetUrl);
    } catch (error) {
      throw new Error(`Invalid target URL format: ${targetUrl}`);
    }
    
    // Preserve the original path if present in the URL
    const path = parsedUrl.path || '/';
    req.url = `${target.pathname.replace(/\/+$/, '')}${path}`;
    
    // Set up error handler for the proxy request
    const errorHandler = (err: Error) => {
      console.error('Proxy error:', err);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      }
    };
    
    // Set up response close handler
    res.on('close', () => {
      clearTimeout(requestTimeout);
    });
    
    // Add error handler
    proxy.once('error', errorHandler);
    
    // Proxy the request
    proxy.web(req, res, { 
      target: target.origin,
      changeOrigin: true,
      secure: true,
      ws: true,
      xfwd: true, // Adds x-forward headers
      preserveHeaderKeyCase: true,
      timeout: 25000 // 25 seconds timeout for proxy requests
    });
  } catch (error) {
    clearTimeout(requestTimeout);
    console.error('Request handling error:', error);
    
    if (res.headersSent) return;
    
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error instanceof Error) {
      if (error.message.includes('Permission denied')) {
        statusCode = 403;
        errorMessage = 'Permission denied';
      } else if (error.message.includes('Invalid host format')) {
        statusCode = 400;
        errorMessage = error.message;
      } else if (error.message.includes('Failed to fetch') || 
                 error.message.includes('Network error')) {
        statusCode = 502;
        errorMessage = 'Unable to connect to the upstream server';
      } else if (error.message.includes('Invalid JSON') || 
                error.message.includes('Invalid response format')) {
        statusCode = 502;
        errorMessage = 'Invalid response from the upstream server';
      }
    }
    
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(errorMessage);
  }
};

/**
 * Initializes and starts the HTTP server
 */
/**
 * Graceful shutdown handler
 */
const gracefulShutdown = (server: http.Server, signal: string): void => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000); // 10 seconds timeout for graceful shutdown
};

/**
 * Initializes and starts the HTTP server
 */
const startServer = (): void => {
  try {
    const proxy = createProxyServer();
    
    // Create HTTP server
    const server = http.createServer((req, res) => {
      handleRequest(proxy, req, res).catch(error => {
        console.error('Unhandled error in request handler:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });
    });
    
    // Set server timeouts
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 70000; // 70 seconds
    
    // Start listening
    server.listen(CONFIG.PORT, '0.0.0.0', () => {
      const address = server.address();
      const serverAddress = typeof address === 'string' 
        ? address 
        : `http://${address?.address || '0.0.0.0'}:${address?.port || CONFIG.PORT}`;
      
      console.log(`\n=== Proxy Server Started ===`);
      console.log(`Server running at: ${serverAddress}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Node.js version: ${process.version}`);
      console.log(`Process ID: ${process.pid}`);
      console.log(`Server time: ${new Date().toISOString()}`);
      console.log(`==========================\n`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      console.error('Server error:', error);
      
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${CONFIG.PORT} is already in use`);
      } else if (error.code === 'EACCES') {
        console.error(`Port ${CONFIG.PORT} requires elevated privileges`);
      } else {
        console.error('Unhandled server error:', error);
      }
      
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Consider whether to shut down the server here based on your needs
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      // Consider whether to shut down the server here based on your needs
    });

    // Handle graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    signals.forEach(signal => {
      process.on(signal, () => gracefulShutdown(server, signal));
    });
    
    // Handle process exit
    process.on('exit', (code) => {
      console.log(`Process exiting with code ${code}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();