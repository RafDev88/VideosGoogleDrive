const { OAuth2Client } = require("google-auth-library");

const GOOGLE_REDIRECT_URI = "http://localhost";
const GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

function createGoogleOAuthClient(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    throw new Error("Preencha GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET para gerar o refresh token.");
  }

  return new OAuth2Client(clientId, clientSecret, GOOGLE_REDIRECT_URI);
}

function generateGoogleAuthUrl(clientId, clientSecret) {
  const client = createGoogleOAuthClient(clientId, clientSecret);

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_DRIVE_SCOPES
  });
}

function extractGoogleCode(input) {
  const value = String(input || "").trim();
  if (!value) {
    throw new Error("Cole a URL completa retornada pelo Google ou apenas o parametro code.");
  }

  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value);
    const codeFromUrl = parsed.searchParams.get("code");
    if (codeFromUrl) {
      return codeFromUrl;
    }
  }

  const codeMatch = value.match(/(?:[?&]code=)([^&]+)/i);
  if (codeMatch) {
    return decodeURIComponent(codeMatch[1]);
  }

  return value;
}

async function exchangeGoogleCodeForTokens(clientId, clientSecret, code) {
  const client = createGoogleOAuthClient(clientId, clientSecret);
  const normalizedCode = extractGoogleCode(code);
  const { tokens } = await client.getToken(normalizedCode);

  return {
    refreshToken: tokens.refresh_token || "",
    accessToken: tokens.access_token || "",
    scope: tokens.scope || "",
    expiryDate: tokens.expiry_date || null,
    tokenType: tokens.token_type || "",
    hasRefreshToken: Boolean(tokens.refresh_token),
    codeUsed: normalizedCode
  };
}

module.exports = {
  generateGoogleAuthUrl,
  exchangeGoogleCodeForTokens
};
