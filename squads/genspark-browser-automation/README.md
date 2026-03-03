# genspark-browser-automation

Squad para automacao confiavel de geracao de imagens via Genspark no navegador, usando conta Google logada (andrewebemp@gmail.com) com acesso gratuito ao modelo Nano Banana Pro.

## Problema

O sistema atual (`electron/gensparkPlaywright.js`) tem limitacoes:
- Lanca nova instancia do Chrome (perde login)
- Seletores CSS frageis que quebram com updates do Genspark
- Deteccao de imagens via polling DOM (lento e falho)
- Nao seleciona o modelo Nano Banana Pro especificamente
- Navegacao entre prompts via page reload (lento)

## Solucao

Conectar ao Chrome existente via CDP (Chrome DevTools Protocol), mantendo a sessao Google logada, com seletores resilientes e deteccao de imagens via network intercept.

## Agentes

| Agente | Papel |
|--------|-------|
| @browser-engineer | Automacao Chrome via CDP/Puppeteer |
| @ux-integrator | Frontend React (GensparkStep.tsx) |
| @ipc-architect | Electron IPC e session lifecycle |

## Uso

```bash
# Ativar agente
@browser-engineer

# Comandos disponiveis
*connect-chrome      # Conectar ao Chrome com Google logado
*generate-image      # Gerar uma imagem
*batch-generate      # Gerar lote de imagens
*update-selectors    # Atualizar mapa de seletores
```

## Fluxo Principal

```
Chrome aberto (Google logado)
  |
  v
Detectar via CDP --> Conectar Puppeteer.connect()
  |
  v
Nova aba --> genspark.ai/agents/image-generator
  |
  v
Ja logado! --> Selecionar Nano Banana Pro
  |
  v
Injetar prompt --> Aguardar (network intercept) --> Download imagem
  |
  v
Proximo prompt (sem reload) --> Loop ate completar
```

## Arquivos Existentes (refatorar)

- `electron/gensparkPlaywright.js` - Backend de automacao (1465 linhas)
- `src/components/wizard-new/GensparkStep.tsx` - Frontend React (2370 linhas)
