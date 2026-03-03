# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [2.0.0] - 2026-03-02

### Adicionado
- Código-fonte completo do projeto publicado no repositório
- Wizard v2 (`wizard-new/`) com 8 etapas: Import, Prompts, Images, Regions, Genspark, Export
- Integração com Genspark via Playwright para geração automatizada de imagens
- `useProjectNew` hook para gerenciamento de estado do novo wizard
- 18 utilitários em `src/utils/`: whisperApi, visionApi, imageGenApi, scriptToSrt, projectSerializer, entre outros
- 13 tipos TypeScript em `src/types/`: ProjectNew, Region, ImageBlock, VideoSegment, ApiConfig, entre outros
- Automação Playwright para Genspark (`electron/gensparkPlaywright.js`)
- File watcher para monitoramento de pastas (`electron/folderWatcher.js`)
- Preload script Electron (`electron/preload.js`)
- Framework AIOS (Synkra) com agentes, tasks, workflows e templates
- Configuração de `.gitignore` para build artifacts e arquivos sensíveis
- Suporte a Puppeteer e Playwright como dependências de automação

### Alterado
- Atualizado `package.json` version para 2.0.0
- Atualizado README.md com estrutura completa e stack atualizada

---

## [1.0.0] - 2026-03-02

### Adicionado
- Modo Wizard guiado com 6 etapas (roteiro, SRT, prompts, imagens, preview, exportação)
- Modo Editor legado para controle manual de cenas e elementos
- Modo Timeline com suporte a áudio e video segments
- Composições Remotion: ZoomVideo, VideoNew, VideoTimeline, Export
- Exportação em múltiplos formatos: MP4 (H.264), FCPXML, MLT, JSON
- App desktop via Electron com build para Windows
- Detecção automática de regiões via Vision API (OpenAI)
- Parser e sincronização de legendas SRT
- Reveal progressivo de elementos visuais
- Zoom animado em cenas
- Editor de regiões com canvas Konva.js
- Geração de prompts assistida por IA
- Auto-save no localStorage a cada 2 segundos
- Suporte a resoluções de 360p até 4K
- Proporções 16:9, 9:16 e 1:1

---

## Guia de Versionamento

### Formato: MAJOR.MINOR.PATCH

| Tipo | Quando incrementar | Exemplo |
|------|-------------------|---------|
| **MAJOR** | Mudanças que quebram compatibilidade | 1.0.0 → 2.0.0 |
| **MINOR** | Novas funcionalidades (compatíveis) | 1.0.0 → 1.1.0 |
| **PATCH** | Correções de bugs | 1.0.0 → 1.0.1 |

### Como criar uma nova versão

```bash
# 1. Atualize este CHANGELOG com as mudanças
# 2. Crie a tag com a versão
git tag -a v1.1.0 -m "v1.1.0 - Descrição da versão"

# 3. Envie a tag para o GitHub
git push origin v1.1.0
```

[2.0.0]: https://github.com/andrewebemp/automatizar-animacoes/releases/tag/v2.0.0
[1.0.0]: https://github.com/andrewebemp/automatizar-animacoes/releases/tag/v1.0.0
