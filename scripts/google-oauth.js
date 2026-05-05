const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const dotenv = require("dotenv");
const { OAuth2Client } = require("google-auth-library");

dotenv.config();

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Preencha GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET no arquivo .env antes de rodar este script.");
  process.exit(1);
}

async function main() {
  const redirectUri = "http://localhost";
  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  const scopes = ["https://www.googleapis.com/auth/drive.readonly"];

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes
  });

  console.log("");
  console.log("1. Abra esta URL no navegador e autorize sua conta Google:");
  console.log(authUrl);
  console.log("");
  console.log("2. Depois da autorizacao, o Google vai redirecionar para http://localhost/?code=...");
  console.log("3. Copie o valor do parametro code e cole abaixo.");
  console.log("");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const code = (await rl.question("Cole o code aqui: ")).trim();
  await rl.close();

  if (!code) {
    console.error("Nenhum code foi informado.");
    process.exit(1);
  }

  const { tokens } = await client.getToken(code);

  console.log("");
  console.log("Tokens recebidos:");
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token || ""}`);
  console.log("");
  console.log("Se o refresh token vier vazio, apague o acesso do app na sua conta Google e rode o script novamente.");
}

main().catch((error) => {
  console.error("Falha ao obter tokens do Google:", error.message);
  process.exit(1);
});
