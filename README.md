# Automatizar Animações

Aplicação desktop para criação automatizada de vídeos educacionais com animações progressivas estilo whiteboard, sincronizadas com narração.

## Visão Geral

O **Automatizar Animações** transforma imagens estáticas em vídeos animados onde elementos visuais aparecem progressivamente conforme a narração. Ideal para criação de conteúdo educacional, apresentações animadas e vídeos explicativos.

## Stack Tecnológica

- **Frontend**: React 19 + TypeScript
- **Desktop**: Electron 28
- **Renderização de Vídeo**: Remotion 4.0
- **Desenho em Canvas**: Konva.js
- **Áudio**: WaveSurfer.js
- **Automação de Browser**: Playwright + Puppeteer
- **Validação**: Zod
- **Build**: Vite + electron-builder

---

## Repositório

### Clonar o repositório

```bash
git clone https://github.com/andrewebemp/automatizar-animacoes.git
cd automatizar-animacoes
```

### Atualizar (baixar últimas alterações)

```bash
git pull origin master
```

### Enviar alterações para o repositório

```bash
git add .
git commit -m "descricao das alteracoes"
git push origin master
```

### Verificar status das alterações locais

```bash
git status
```

### Ver histórico de commits

```bash
git log --oneline -10
```

---

## Fluxo do Usuário

O programa oferece dois modos de operação:

### Modo Wizard (Novo Fluxo) - Recomendado

Fluxo guiado em 6 etapas para criação automatizada de animações.

#### Etapa 1: Upload do Roteiro

O usuário inicia o processo fazendo upload do roteiro de narração.

**Funcionalidades:**
- Upload de arquivo de texto com o roteiro
- Conversão automática para formato SRT (legendas com timing)
- Suporte a transcrição de áudio via Speech-to-Text

**O que acontece:**
- O sistema processa o texto e gera timestamps para cada segmento de fala
- Cada frase ou parágrafo se torna uma legenda com tempo de início e fim

---

#### Etapa 2: Upload/Revisão do SRT

O arquivo SRT é carregado e processado para identificar os blocos de animação.

**Funcionalidades:**
- Upload direto de arquivo SRT existente
- Visualização das legendas com timing
- Edição manual de textos e tempos se necessário
- Geração automática de blocos de animação baseados nas legendas

**O que acontece:**
- Parser extrai cada legenda com seu texto, tempo de início e fim
- Sistema calcula frames correspondentes (30 FPS padrão)
- Cria estrutura de `TimelineElements` para cada segmento

---

#### Etapa 3: Revisão dos Prompts

O sistema gera descrições visuais automáticas para cada elemento da animação.

**Funcionalidades:**
- Visualização dos prompts gerados por IA para cada elemento
- Edição manual das descrições visuais
- Associação de cada prompt com o texto de narração correspondente

**O que acontece:**
- IA analisa o texto de cada legenda
- Sugere elementos visuais apropriados (ex: "Checklist com setas sequenciais", "Pessoa focada no computador com etiqueta CONCENTRAÇÃO")
- Usuário pode ajustar as sugestões conforme necessário

---

#### Etapa 4: Upload das Imagens

O usuário carrega as imagens de whiteboard que serão animadas.

**Funcionalidades:**
- Upload de uma ou múltiplas imagens PNG/JPG
- Detecção automática de elementos visuais via Vision API
- Associação de imagens aos blocos de animação
- Fallback para marcação manual quando a detecção automática falha

**O que acontece:**
- Imagens são convertidas para base64 Data URLs
- Vision API identifica regiões distintas na imagem
- Cada região detectada é associada a um elemento do timeline
- Sistema calcula coordenadas (x, y, largura, altura) de cada elemento

---

#### Etapa 5: Preview e Validação

O usuário visualiza e ajusta as animações antes da exportação.

**Funcionalidades:**
- Preview interativo das animações
- Ajuste fino das regiões dos elementos (arrastar/redimensionar)
- Configuração de direção de revelação por elemento:
  - Centro para fora
  - Esquerda para direita
  - Direita para esquerda
  - Cima para baixo
  - Baixo para cima
  - Detecção automática
- Configuração do modo de exibição:
  - Normal (revela no lugar original)
  - Zoom (elemento ocupa tela inteira)
- Ajuste de porcentagem de revelação (0-100% em incrementos de 10%)

**O que acontece:**
- Renderização em tempo real das animações
- Validação de sincronização com as legendas
- Elementos anteriores permanecem visíveis (revelação progressiva)

---

#### Etapa 6: Exportação

Configuração final e renderização do vídeo.

**Funcionalidades:**
- Seleção de resolução:
  - 360p, 480p, 720p, 1080p, 2K, 4K
- Seleção de proporção:
  - 16:9 (padrão horizontal)
  - 9:16 (vertical/stories)
  - 1:1 (quadrado)
- Inclusão opcional de áudio
- Inclusão opcional de legendas no vídeo
- Barra de progresso durante renderização

**O que acontece:**
- Remotion agrupa o projeto com dados serializados
- Chrome headless via Puppeteer renderiza cada frame
- Saída em MP4 com codec H.264
- Processo pode levar alguns minutos dependendo da duração

---

### Modo Wizard v2 (Novo)

Fluxo alternativo com integração Genspark para geração automatizada de imagens.

#### Etapas:
1. **Import** — Importar dados de projeto existente
2. **Prompts** — Gerar e editar prompts visuais por IA
3. **Images** — Upload e gerenciamento de imagens
4. **Regions** — Definir regiões de animação sobre as imagens
5. **Genspark** — Geração automatizada de imagens via Playwright + Genspark
6. **Export** — Configuração e renderização do vídeo final

---

### Modo Editor (Legado)

Fluxo manual para controle total sobre a criação das animações.

#### Passo 1: Upload da Imagem
- Carregar uma única imagem de whiteboard

#### Passo 2: Criação de Cenas
- Definir manualmente regiões da imagem como cenas
- Organizar a sequência de apresentação

#### Passo 3: Desenho de Elementos
- Ferramentas disponíveis:
  - Retângulo
  - Elipse
  - Polígono
  - Desenho livre
- Criar elementos dentro de cada cena

#### Passo 4: Mapeamento de Legendas
- Associar cada elemento a uma legenda do SRT
- Ou usar "Auto-mapping" para distribuição automática

#### Passo 5: Preview e Exportação
- Visualizar animações
- Exportar vídeo final

---

## Persistência de Dados

### Salvamento Automático
- Auto-save a cada 2 segundos de inatividade
- Dados salvos no localStorage do navegador

### Recuperação de Projeto
- Modal de recuperação aparece ao iniciar se houver projeto não salvo
- Opções: continuar projeto anterior ou iniciar novo

### Dados Persistidos
- Etapa atual do wizard
- Conteúdo do SRT
- Legendas processadas
- Blocos de imagem com elementos
- Configurações de resolução
- Áudio (se houver)

---

## Estrutura de Dados Principal

### ProjectData
```typescript
{
  mode: 'new-flow' | 'legacy'
  currentStep: WizardStep
  srtContent: string
  imageBlocks: ImageBlock[]
  selectedResolution: VideoResolution
  showSubtitlesInVideo: boolean
  audioUrl?: string
}
```

### ImageBlock
- Identificador único e rótulo
- URL da imagem (base64)
- Lista de elementos do timeline
- Status de detecção de elementos
- Configuração de layout em grid

### TimelineElement
- Índice da legenda associada
- Tempos de início/fim (segundos e frames)
- Descrição do elemento (gerada por IA)
- Texto de narração
- Região (coordenadas, forma, pontos)
- Configurações de animação

---

## Tipos de Animação

| Tipo | Descrição |
|------|-----------|
| **Center-out** | Revela do centro para as bordas |
| **Left-to-right** | Revela da esquerda para direita |
| **Right-to-left** | Revela da direita para esquerda |
| **Top-to-bottom** | Revela de cima para baixo |
| **Bottom-to-top** | Revela de baixo para cima |
| **Auto-detect** | Sistema escolhe automaticamente |

---

## Resoluções Suportadas

| Resolução | Dimensões (16:9) |
|-----------|------------------|
| 360p | 640 x 360 |
| 480p | 854 x 480 |
| 720p | 1280 x 720 |
| 1080p | 1920 x 1080 |
| 2K | 2560 x 1440 |
| 4K | 3840 x 2160 |

---

## Instalação e Execução

### Pré-requisitos
- [Node.js](https://nodejs.org/) 18+
- [Git](https://git-scm.com/)
- npm (incluso com Node.js)

### Instalação
```bash
git clone https://github.com/andrewebemp/automatizar-animacoes.git
cd automatizar-animacoes
npm install
```

### Configuração de Ambiente

Copie o arquivo de exemplo e preencha as chaves de API necessárias:

```bash
cp .env.example .env
```

Principais variáveis:

| Variável | Uso |
|----------|-----|
| `OPENAI_API_KEY` | Geração de prompts e detecção de elementos via Vision API |
| `ANTHROPIC_API_KEY` | Alternativa para geração com IA |
| `DEEPSEEK_API_KEY` | Geração de prompts via DeepSeek |
| `OPENROUTER_API_KEY` | Roteamento multi-modelo |
| `GITHUB_TOKEN` | Acesso ao GitHub CLI |

### Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Abre o Remotion Studio para preview das composições |
| `npm run build` | Renderiza o vídeo final em `out/video.mp4` |
| `npm run preview` | Preview rápido do Remotion |
| `npm run editor` | Inicia o editor visual (Vite dev server na porta 3000) |
| `npm run editor:build` | Build de produção do editor |
| `npm run electron` | Abre o app desktop Electron |
| `npm run electron:dev` | Dev mode: editor + Electron simultâneos |
| `npm run dist` | Gera o pacote desktop para distribuição |
| `npm run dist:win` | Gera o pacote desktop para Windows |

### Uso Rápido

**Remotion Studio** (preview de vídeo no navegador):
```bash
npm start
```

**Editor visual** (interface web para criar projetos):
```bash
npm run editor
```

**App desktop** (Electron com todas as funcionalidades):
```bash
npm run electron:dev
```

**Renderizar vídeo final:**
```bash
npm run build
```

Gera o arquivo `out/video.mp4` com as configurações do projeto.

---

## Exemplo de Uso

### Cenário: Vídeo Educacional sobre Produtividade

**Entrada:**
- Roteiro sobre gestão de tempo e produtividade
- Duas imagens de whiteboard com elementos visuais
- Arquivo SRT com timing da narração

**Processo:**
1. Upload do roteiro → Convertido para SRT com 19 segmentos
2. Parse do SRT → Identifica timing de cada fala
3. Geração de prompts → IA sugere elementos visuais:
   - "Checklist com setas sequenciais"
   - "Relógio com checkmark para economia de tempo"
   - "Pessoa concentrada no computador"
4. Upload das imagens → Sistema detecta 13 regiões visuais
5. Criação do timeline → Cada região revela no momento da narração
6. Renderização → Vídeo de 60 segundos com animações sincronizadas

**Saída:** Vídeo MP4 onde elementos aparecem progressivamente conforme a narração, criando uma experiência de whiteboard animado.

---

## Estrutura do Projeto

```
automatizar-animacoes/
├── src/
│   ├── components/
│   │   ├── editor/          # Editor manual (canvas, cenas, elementos) — 8 arquivos
│   │   ├── wizard/          # Interface wizard v1 (fluxo guiado 6 etapas)
│   │   │   └── steps/       # Etapas: Script, SRT, Prompts, Images, Preview, Export
│   │   ├── wizard-new/      # Wizard v2 (Import, Prompts, Images, Regions, Genspark, Export)
│   │   ├── video/           # Composições Remotion (Zoom, Timeline, Export) — 13 arquivos
│   │   ├── region-editor/   # Editor de regiões sobre imagens (Canvas, Toolbar, Preview)
│   │   ├── timeline/        # Import/export/edição de timeline
│   │   ├── settings/        # Configurações e APIs (ApiSettings, SettingsModal)
│   │   └── mode-selector/   # Seletor de modo (editor/wizard/timeline)
│   ├── exporters/           # Exportadores (FCPXML, MLT, OpenShot JSON)
│   │   ├── fcpxml/          # Final Cut Pro XML
│   │   ├── mlt/             # Kdenlive MLT
│   │   └── json/            # OpenShot JSON
│   ├── hooks/               # React hooks (useProjectState, useProjectNew, useTimelineProject)
│   ├── services/            # Serviços (em desenvolvimento)
│   ├── types/               # 13 tipos TypeScript (ProjectData, Region, ImageBlock, VideoConfig, etc.)
│   ├── utils/               # 18 utilitários (srtParser, visionApi, whisperApi, aiPromptGenerator, etc.)
│   ├── Root.tsx             # Raiz do Remotion (composições registradas)
│   └── index.ts             # Entry point
├── editor/                  # Entry point do editor visual (index.html, main.tsx, styles.css)
├── electron/                # Processo principal Electron
│   ├── main.js              # Main process
│   ├── preload.js           # Preload script (bridge renderer ↔ main)
│   ├── folderWatcher.js     # Monitoramento de pastas com chokidar
│   └── gensparkPlaywright.js # Automação Genspark via Playwright
├── remotion.config.ts       # Configuração do Remotion
├── vite.editor.config.ts    # Configuração Vite do editor
├── tsconfig.json            # Configuração TypeScript
└── package.json             # Dependências e scripts
```

### Composições Remotion

O projeto registra 4 composições no Remotion Studio:

| ID | Descrição |
|----|-----------|
| `ZoomVideo` | Fluxo legado com zoom em cenas |
| `VideoNew` | Novo fluxo simplificado |
| `VideoTimeline` | Modo timeline com áudio |
| `Export` | Composição isolada para exportação |

### Formatos de Exportação

| Formato | Software Alvo |
|---------|---------------|
| MP4 (H.264) | Qualquer player |
| FCPXML | Final Cut Pro |
| MLT | Kdenlive |
| JSON | OpenShot |

---

## Controle de Versões

Este projeto usa **tags Git** e **branches** para manter um histórico seguro. Você pode voltar a qualquer versão anterior a qualquer momento.

### Branches

| Branch | Propósito |
|--------|-----------|
| `master` | Desenvolvimento ativo — trabalho do dia a dia |
| `stable` | Última versão estável testada — só atualizada em releases |
| `develop` | Integração de features antes de ir para master |

### Versão atual: v2.0.0

Consulte o [CHANGELOG.md](CHANGELOG.md) para o histórico completo de mudanças.

### Criar uma nova versão (release)

Quando uma funcionalidade importante estiver pronta:

```bash
# 1. Atualize o CHANGELOG.md com as mudanças

# 2. Commit as mudanças
git add .
git commit -m "release: v2.1.0"

# 3. Crie a tag
git tag -a v2.1.0 -m "v2.1.0 - Descrição da versão"

# 4. Envie tudo para o GitHub
git push origin master
git push origin v2.1.0

# 5. Atualize a branch stable
git checkout stable
git merge master
git push origin stable
git checkout master
```

### Voltar para uma versão anterior

Se algo der errado, você pode voltar facilmente:

```bash
# Ver todas as versões disponíveis
git tag -l

# Ver detalhes de uma versão
git show v2.0.0

# Voltar o código para uma versão específica (modo leitura)
git checkout v2.0.0

# Voltar para a versão atual
git checkout master
```

### Reverter alterações ruins

```bash
# Desfazer alterações em um arquivo específico (não commitado)
git checkout -- caminho/do/arquivo.ts

# Desfazer o último commit (mantém os arquivos)
git reset --soft HEAD~1

# Voltar para o estado de uma versão e criar branch a partir dela
git checkout -b fix-emergencia v2.0.0
```

### Comparar versões

```bash
# Ver o que mudou entre duas versões
git diff v1.0.0 v2.0.0

# Ver lista de arquivos alterados entre versões
git diff --name-only v1.0.0 v2.0.0

# Ver commits entre duas versões
git log v1.0.0..v2.0.0 --oneline
```

---

## Licença

ISC
