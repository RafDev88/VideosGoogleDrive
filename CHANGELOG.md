# Changelog

Todas as mudancas relevantes deste projeto serao documentadas aqui.

## [0.1.0] - 2026-05-05

Primeira publicacao do projeto `GDrive Videos`.

### Adicionado

- Estrutura desktop com `Electron`, `Vue 3` e `Vite`.
- Base visual com `Tailwind CSS` e componentes utilitarios reutilizaveis.
- Integracao com `Google Drive API` para listar videos da pasta configurada.
- Streaming local via proxy interno do Electron para reproduzir arquivos dentro do app.
- Integracao com `TMDb` para enriquecer os arquivos com titulo, capa, sinopse e nota.
- Parser inicial para identificar filmes, series, temporadas e episodios a partir do nome do arquivo.
- Tela interna de configuracoes para editar `.env`, testar conexoes e gerar `refresh token`.
- Importacao recursiva de videos em subpastas do Google Drive.
- Home com secoes como `Continuar assistindo`, `Adicionados recentemente`, `Filmes` e `Series`.
- Persistencia local de progresso de reproducao, historico recente, favoritos e ultimo episodio assistido.
- Navegacao por temporadas e suporte a sugestao de proximo episodio.
- Guia inicial de configuracao e uso no `README`.

### Infraestrutura

- Script de desenvolvimento para subir `Vite` e `Electron` juntos.
- Script auxiliar para autenticacao Google via terminal.
- Configuracao de build para Windows com `electron-builder` e alvo `nsis`.
- Helper compartilhado para composicao de classes com `clsx` e `tailwind-merge`.
