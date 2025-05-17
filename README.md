# GuardUp Proxy Service

[![GuardUp](https://guardup.ai/logo.svg)](https://guardup.ai)

GuardUp Proxy Service is a privacy-focused proxy server that adds multi-factor authentication and enhanced security to MCP (Model Context Protocol) servers. It acts as a secure intermediary between MCP clients and servers, ensuring that only authorized users can access protected MCP resources.

## 🔒 Privacy First

GuardUp is designed with privacy as a core principle:
- **No Data Storage**: We don't store or log any details of MCP server requests or responses
- **Open Source**: The complete source code is available for review and auditing
- **Self-Hostable**: You can host your own instance for maximum control and privacy
- **Minimal Data**: Only the minimum necessary metadata is processed to facilitate secure connections

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- pnpm

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/guardup/guardup-proxy-service.git
   cd guardup-proxy-service
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables by copying the example file:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your configuration.

### Configuration

Required environment variables:
- `WEB_APP_API_BASE`: Base URL of the GuardUp web app service
- `GUARDUP_PROXY_SERVICE_PORT`: Port to run the proxy service on (default: 3001)

### Running the Server

Start the development server:
```bash
pnpm dev
```

For production use, build and run:
```bash
pnpm build
pnpm start
```

## 🌐 Self-Hosting Guide

### 1. Deploying the Proxy Service

You can deploy the GuardUp Proxy Service to any Node.js-compatible hosting platform. Here's a basic guide for deployment:

1. Set up a server with Node.js 18+ installed
2. Clone this repository
3. Install dependencies with `pnpm install`
4. Configure your environment variables
5. Build the application with `pnpm build`
6. Start the server with `pnpm start`

### 2. Configuring Subdomains

The proxy service uses subdomains to route requests to the correct MCP server. For example, a request to `http://unique-mcp-id.your-domain.com` will be routed to the MCP server with ID "unique-mcp-id".

#### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name ~^(?<subdomain>[^.]+)\.your-domain\.com$;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Make sure to:
1. Replace `your-domain.com` with your actual domain
2. Configure your DNS to accept wildcard subdomains (`*.your-domain.com`)
3. Set up SSL/TLS certificates (highly recommended)

### 3. Updating GuardUp Web App

After deploying your proxy server:

1. Log in to [GuardUp.ai](https://guardup.ai)
2. Navigate to "Account Settings"
3. Find the "Custom Proxy URL" setting
4. Enter your custom proxy URL (e.g., `https://proxy.your-domain.com`)
5. Save your changes

Your MCP connections will now be routed through your self-hosted proxy server.

## 🧪 Local Development & Testing

For local testing, you can use:

```
PROXY_ID.127.0.0.1.nip.io
```

This allows testing subdomains locally. For example: `unique-mcp-id.127.0.0.1.nip.io:3001`

### Testing with MCP Inspector

You can use the official MCP inspector for testing:

```bash
npx @modelcontextprotocol/inspector
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
