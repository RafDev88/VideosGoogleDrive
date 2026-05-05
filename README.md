# GDrive Videos

Aplicativo desktop em `Vue 3 + Vite + Electron` para listar filmes e series que estao no seu Google Drive, buscar metadados no TMDb e reproduzir o video dentro do app usando `Video.js`.

## Release atual

- Versao inicial publicada: `0.1.0`
- Historico de entregas: veja o arquivo `CHANGELOG.md`

Agora o app tambem possui uma tela interna de configuracoes para editar os principais campos do `.env`, testar conexao com `TMDb` e `Google Drive`, extrair automaticamente o `Folder ID` a partir da URL da pasta e gerar o `Google Drive Refresh Token` sem depender do terminal.
Tambem e possivel ativar importacao recursiva para ler videos dentro de subpastas da pasta principal do Drive.
Na interface, episodios de series agora podem ser agrupados por titulo da serie e ordenados por temporada e episodio.
Quando um episodio de serie esta selecionado, a area principal tambem mostra um catalogo por temporadas para navegar entre episodios.
A tela principal tambem ganhou uma Home com secoes como `Continuar assistindo`, `Adicionados recentemente`, `Filmes` e `Series`.
O app agora tambem salva estado local de uso, incluindo progresso de reproducao, historico recente e favoritos.
Para series, ele tambem acompanha o ultimo episodio visto e pode sugerir o `Proximo episodio` na Home.
O layout atual foi simplificado para uma experiencia mais minimalista e proxima de apps de streaming, com destaque principal e carrosseis horizontais de filmes e series.

## Stack

- `Vue 3 + Vite` no frontend
- `Tailwind CSS` para a camada visual da interface
- `Electron` para empacotar como desktop app
- `Node.js` no processo principal do Electron
- `Google Drive API` para listar e transmitir os videos
- `TMDb API` para titulo, capa, sinopse e nota
- `Video.js` para a reproducao

## Como funciona

1. O processo principal do Electron autentica na Google Drive API usando `OAuth2` e `refresh_token`.
2. Ele lista os arquivos da pasta configurada em `GOOGLE_DRIVE_FOLDER_ID`.
3. Se a opcao recursiva estiver ativa, ele percorre as subpastas dessa pasta e importa videos de toda a arvore.
4. Para cada arquivo, o app limpa o nome do arquivo e faz uma busca no TMDb.
5. O player nao abre o Drive no navegador: ele usa um servidor local interno do Electron para fazer proxy do stream do Google Drive.
6. O frontend Vue consome tudo via `preload` + `ipc`, sem expor Node diretamente na interface.
7. Se o `.env` ainda nao estiver completo, o app abre normalmente e permite salvar as configuracoes pela UI.

## Configuracao

Crie um arquivo `.env` com base no `.env.example`.

### Google Drive

Voce vai precisar:

- criar um projeto no Google Cloud
- ativar a Google Drive API
- criar credenciais `OAuth 2.0` do tipo `Desktop app`
- obter `client_id`, `client_secret` e `refresh_token`
- pegar o ID da pasta onde estao os filmes

Para contas pessoais, esse fluxo com `refresh_token` e o mais indicado.
Se a pasta estiver em `Shared Drive`, preencha tambem `GOOGLE_DRIVE_SHARED_DRIVE_ID`.

### Como gerar o refresh token

1. Crie o arquivo `.env` com `GOOGLE_DRIVE_CLIENT_ID` e `GOOGLE_DRIVE_CLIENT_SECRET`.
2. Rode `npm install`.
3. Rode `npm run auth:google`.
4. Abra a URL mostrada no terminal.
5. Depois do login, copie o `code` da URL `http://localhost/?code=...`.
6. Cole no terminal para receber seu `GOOGLE_DRIVE_REFRESH_TOKEN`.

Escopo usado pelo script:

- `https://www.googleapis.com/auth/drive.readonly`

Voce tambem pode fazer esse fluxo pela tela de configuracoes do app:

1. Preencha `GOOGLE_DRIVE_CLIENT_ID` e `GOOGLE_DRIVE_CLIENT_SECRET`.
2. Clique em `Abrir autorizacao Google`.
3. Autorize sua conta.
4. Copie o parametro `code` da URL `http://localhost/?code=...`.
5. Cole no campo da interface e clique em `Gerar refresh token`.

### TMDb

Voce vai precisar do `API Read Access Token` do TMDb e preencher `TMDB_API_TOKEN`.

## Scripts

- `npm install`
- `npm run dev`
- `npm run auth:google`
- `npm run build`

## Arquitetura sugerida

- `electron/main.js`: janela principal e bootstrap
- `electron/preload.js`: API segura exposta para o renderer
- `electron/services/config.js`: leitura, validacao e escrita do `.env`
- `electron/services/driveService.js`: listagem de arquivos no Drive
- `electron/services/mediaServer.js`: proxy local para streaming
- `electron/services/tmdbService.js`: busca de metadados
- `src/App.vue`: tela principal da biblioteca
- `src/components/VideoPlayer.vue`: player baseado em Video.js
- `src/styles.css`: tema global com Tailwind CSS e classes utilitarias reutilizaveis
- `src/components/ui/*`: componentes base no estilo shadcn-vue como `Button`, `Card`, `Input`, `Tabs`, `Skeleton`, `ScrollArea`, `Badge`, `Dialog`, `Separator` e `Toast`

## Observacoes importantes

- O Google Drive aceita download de blob files com `files.get` usando `alt=media`, segundo a documentacao oficial.
- O TMDb recomenda o fluxo `search` seguido de consulta de detalhes; aqui deixei o `search` como primeira versao.
- Para melhorar a correspondencia entre nome do arquivo e TMDb, o proximo passo ideal e criar um parser mais inteligente para ano, temporada, episodio e qualidade.
- Esta versao ja tenta extrair `ano`, `S01E01`, `Season`, `Temporada` e remover tokens comuns de release do nome do arquivo.
- Alguns formatos, como `.mkv`, podem depender dos codecs presentes no Chromium/Electron.
- O build para Windows esta configurado com `electron-builder` em alvo `nsis`, mas ainda depende de instalar as dependencias e testar localmente.
- A interface foi preparada para evoluir com `shadcn-vue`, mas essa etapa depende de instalar as dependencias e ajustar aliases do projeto.
