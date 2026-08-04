const { EmailClient } = require('@azure/communication-email');

// --- Azure Communication Services Configuration ---
const AZURE_COMMUNICATION_CONNECTION_STRING = process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '';
const AZURE_COMMUNICATION_FROM_EMAIL = process.env.AZURE_COMMUNICATION_FROM_EMAIL || '';

const isAzureConfigured =
  AZURE_COMMUNICATION_CONNECTION_STRING &&
  AZURE_COMMUNICATION_CONNECTION_STRING.trim() !== '' &&
  !AZURE_COMMUNICATION_CONNECTION_STRING.includes('your-resource');

const azureEmailClient = isAzureConfigured ? new EmailClient(AZURE_COMMUNICATION_CONNECTION_STRING) : null;

// --- Microsoft Graph API Configuration ---
const MS_GRAPH_TENANT_ID = process.env.MS_GRAPH_TENANT_ID || '';
const MS_GRAPH_CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID || '';
const MS_GRAPH_CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET || '';
const MS_GRAPH_SENDER_EMAIL = process.env.MS_GRAPH_SENDER_EMAIL || process.env.SMTP_USER || '';

const isGraphConfigured =
  Boolean(MS_GRAPH_TENANT_ID) &&
  Boolean(MS_GRAPH_CLIENT_ID) &&
  Boolean(MS_GRAPH_CLIENT_SECRET) &&
  Boolean(MS_GRAPH_SENDER_EMAIL) &&
  !MS_GRAPH_CLIENT_ID.includes('your-');

// OAuth2 Token Cache for Microsoft Graph API
let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Acquire Microsoft Graph OAuth2 Access Token using Client Credentials Flow.
 * Caches token in memory until 5 minutes prior to expiration.
 */
async function getGraphAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && tokenExpiresAt > now + 300000) {
    return cachedAccessToken;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID || MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID || MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET || MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Microsoft Graph API configuration is missing. Please set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and MS_GRAPH_CLIENT_SECRET in environment variables.'
    );
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to obtain Microsoft Graph OAuth token (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  return cachedAccessToken;
}

/**
 * Send Email via Microsoft Graph REST API (/v1.0/users/{senderEmail}/sendMail)
 */
async function sendViaMicrosoftGraph(options) {
  const accessToken = await getGraphAccessToken();
  const senderEmail = process.env.MS_GRAPH_SENDER_EMAIL || MS_GRAPH_SENDER_EMAIL;

  if (!senderEmail) {
    throw new Error('MS_GRAPH_SENDER_EMAIL environment variable is not configured.');
  }

  const endpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;

  const messagePayload = {
    message: {
      subject: options.subject || '(No Subject)',
      body: {
        contentType: options.html ? 'HTML' : 'Text',
        content: options.html || options.text || '',
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      });

      if (response.status === 202 || response.status === 200) {
        const clientRequestId = response.headers.get('client-request-id') || `graph-${Date.now()}`;
        return clientRequestId;
      }

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const waitMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : attempt * 2000;
        console.warn(`⚠️ [MS Graph 429 Rate Limit] Waiting ${waitMs}ms before retry ${attempt}/3...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const errorText = await response.text();
      throw new Error(`Graph API sendMail failed HTTP ${response.status}: ${errorText}`);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ [MS Graph Attempt ${attempt}/3 Failed] Target: ${options.to} | Error: ${err.message}`);

      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  throw lastError || new Error('Microsoft Graph email delivery failed after 3 retries');
}

/**
 * Send Email via Azure Communication Services
 */
async function sendViaAzure(options) {
  if (!azureEmailClient) {
    throw new Error('Azure Communication Services client is not initialized');
  }
  const emailMessage = {
    senderAddress: AZURE_COMMUNICATION_FROM_EMAIL,
    content: {
      subject: options.subject,
      plainText: options.text,
      html: options.html,
    },
    recipients: {
      to: [{ address: options.to }],
    },
  };

  const poller = await azureEmailClient.beginSend(emailMessage);
  const result = await poller.pollUntilDone();
  return result.messageId || result.id || 'unknown';
}

/**
 * Primary Email Dispatcher
 */
async function sendEmail(options) {
  const activeGraphConfigured =
    Boolean(process.env.MS_GRAPH_TENANT_ID) &&
    Boolean(process.env.MS_GRAPH_CLIENT_ID) &&
    Boolean(process.env.MS_GRAPH_CLIENT_SECRET) &&
    Boolean(process.env.MS_GRAPH_SENDER_EMAIL);

  if (activeGraphConfigured || isGraphConfigured) {
    try {
      const messageId = await sendViaMicrosoftGraph(options);
      console.log(`Email sent via Microsoft Graph API to ${options.to}: ${messageId}`);
      return { messageId, provider: 'ms-graph' };
    } catch (graphError) {
      console.warn(`Microsoft Graph failed for ${options.to}: ${graphError.message}`);
      if (!isAzureConfigured) {
        throw graphError;
      }
      console.warn(`Falling back to Azure Communication Services for ${options.to}`);
    }
  }

  if (isAzureConfigured) {
    try {
      const messageId = await sendViaAzure(options);
      console.log(`Email sent via Azure Communication Services to ${options.to}: ${messageId}`);
      return { messageId, provider: 'azure' };
    } catch (azureError) {
      console.error(`Azure Communication Services failed for ${options.to}: ${azureError.message}`);
      throw new Error(`All configured email providers failed. Azure Error: ${azureError.message}`);
    }
  }

  try {
    const messageId = await sendViaMicrosoftGraph(options);
    console.log(`Email sent via Microsoft Graph API to ${options.to}: ${messageId}`);
    return { messageId, provider: 'ms-graph' };
  } catch (err) {
    console.error(`Email sending failed for ${options.to}: ${err.message}`);
    throw new Error(`Email sending failed: ${err.message}`);
  }
}

module.exports = { sendEmail, sendViaMicrosoftGraph, getGraphAccessToken };
