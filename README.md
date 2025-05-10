# Candlestine Play Music

Candlestine Play Music é uma plataforma moçambicana para buscar, converter e baixar músicas e vídeos do YouTube nos formatos MP3 e MP4. O projeto inclui um front-end para usuários, um painel administrativo e um back-end Node.js com MongoDB.

**AVISO IMPORTANTE:** Baixar conteúdo do YouTube pode violar os Termos de Serviço da plataforma. Este projeto é fornecido estritamente para fins educacionais e de demonstração. Use por sua conta e risco e assegure-se de estar em conformidade com todas as leis e políticas aplicáveis.

## Funcionalidades

*   **Front-end:**
    *   Busca de vídeos do YouTube via API.
    *   Exibição de resultados com título, thumbnail.
    *   Botões para baixar em MP3 ou MP4.
    *   Interface de boas-vindas com vídeos populares/sugeridos.
    *   Página de download dedicada.
    *   Exibição de anúncios configuráveis (rodapé, modal, corpo).
*   **Painel Administrativo:**
    *   Adicionar, editar e excluir anúncios (imagem, vídeo, GIF, iframe).
    *   Selecionar posição dos anúncios.
    *   Visualizar estatísticas básicas dos anúncios (visualizações, cliques, CTR, status).
*   **Back-end:**
    *   Integração com a YouTube Data API v3 para busca.
    *   Geração de links de download usando `ytdl-core`.
    *   Registro de estatísticas de anúncios.
    *   Gerenciamento e serviço de anúncios.

## Tecnologias Utilizadas

*   **Front-end:** HTML5, CSS3 (TailwindCSS), JavaScript puro.
*   **Back-end:** Node.js, Express.js.
*   **Banco de Dados:** MongoDB (com Mongoose).
*   **APIs:** YouTube Data API v3.
*   **Outras bibliotecas:** `ytdl-core`, `axios`, `cors`, `dotenv`.

## Estrutura do Projeto

Todos os arquivos do projeto estão localizados na raiz do repositório, conforme especificado.