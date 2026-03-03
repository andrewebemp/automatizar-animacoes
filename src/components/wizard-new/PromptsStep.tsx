import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { Subtitle } from '../../types/Subtitle';
import { loadApiConfig, isPromptGenConfigValid } from '../../types/ApiConfig';
import {
  generatePromptsFromSubtitles,
  previewSceneDivision,
  formatOutputText,
  DEFAULT_STYLE_CONFIG,
  DEFAULT_SCENE_CONFIG,
  PROMPT_MODELS,
  type SceneConfig,
  type PromptStyleConfig,
  type AIConfig,
  type DividedScene,
  type GeneratedScenePrompt,
  type SceneDuration,
  type ElementsPerScene,
  type AspectRatio,
  type PromptProvider,
} from '../../utils/aiPromptGenerator';

interface PromptsStepProps {
  /** Legendas do projeto */
  subtitles: Subtitle[];
  /** Callback para voltar ao passo anterior */
  onBack: () => void;
  /** Callback para avançar para o próximo passo */
  onNext: () => void;
  /** Callback para pular este passo */
  onSkip: () => void;
  /** Callback para salvar o projeto */
  onSave?: () => void;
  /** Callback quando prompts são gerados (para salvar no projeto) */
  onPromptsGenerated?: (prompts: GeneratedScenePrompt[]) => void;
}

// Tipo para o modo de geração
type GenerationMode = 'template' | 'scene';

// Templates padrão para o modo template
const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em criar descrições visuais para ilustrações whiteboard educacionais.

REGRA PRINCIPAL - SEJA LITERAL E CONTEXTUAL:
As descrições devem representar DIRETAMENTE o que o texto diz, não metáforas abstratas.
- Se o texto fala de "aula", desenhe alguém ensinando ou um quadro
- Se o texto fala de "foco no trabalho", desenhe pessoa concentrada trabalhando
- Se o texto fala de "lista de tarefas", desenhe uma lista com checkmarks
- Se o texto fala de "tempo/cronômetro", desenhe relógio ou cronômetro
- Se o texto menciona termos específicos como "Processo PEÃO" ou "Etapa 2", INCLUA esse texto no elemento

TIPOS DE ELEMENTOS A USAR:
1. PESSOAS TRABALHANDO: pessoa escrevendo em caderno, pessoa digitando no laptop, pessoa estudando com livro, pessoa apresentando em quadro, pessoa anotando em post-it, mão segurando caneta, pessoa lendo documento, pessoa em reunião, pessoa fazendo anotações, pessoa pesquisando no celular, pessoa explicando com as mãos, pessoa em videoconferência, duas pessoas conversando, grupo em brainstorm, pessoa assistindo aula no computador, pessoa organizando mesa, pessoa arquivando documentos, pessoa planejando no quadro, pessoa revisando texto, pessoa corrigindo erros, pessoa delegando tarefas, pessoa priorizando lista, pessoa definindo metas, pessoa fazendo revisão semanal, pessoa preparando apresentação, pessoa tomando notas em reunião, pessoa criando cronograma, pessoa analisando dados, pessoa comparando opções, pessoa finalizando projeto
2. QUADROS E LISTAS: quadro branco com texto, quadro branco com diagrama, lista de tarefas simples, checklist com ticks verdes, checklist parcialmente completo, lista com itens riscados, lista numerada, kanban board (fazer/fazendo/feito), flipchart com anotações, painel com papéis fixados, matriz de prioridades, mapa mental básico, tabela comparativa, lista com prioridades (1, 2, 3), cronograma visual, matriz de Eisenhower (urgente/importante), lista de metas diárias, lista de metas semanais, quadro de visão/objetivos, checklist de rotina matinal, checklist de rotina noturna, lista de hábitos com streak, tracker de progresso, quadro de recompensas, lista de micro-tarefas, backlog de projetos, lista de quick wins, painel de deadlines, mural de conquistas, quadro antes/depois
3. TEMPO: relógio de parede, relógio despertador, cronômetro, calendário mensal, calendário com data circulada, ampulheta, ampulheta quase vazia, timer, contagem regressiva, agenda semanal, relógio marcando prazo, linha do tempo, página de calendário sendo virada, ícone de 24 horas, setas indicando passagem de tempo, timer pomodoro (25 min), bloco de tempo colorido, time blocking no calendário, deadline se aproximando, prazo com bandeira vermelha, relógio com zona de foco, calendário com rotina marcada, horário de pico de energia, janela de tempo produtivo, alarme tocando, lembrete na tela, ciclo de 90 minutos, semana dividida em blocos, mês com progresso marcado, ano em retrospectiva
4. DOCUMENTOS: folha de papel, documento com texto, pilha de papéis, bloco de notas espiral, caderno aberto, post-it amarelo, post-its coloridos, agenda diária, planner semanal, pasta de documentos, clipboard com papel, envelope, documento com assinatura, papel grampeado, formulário preenchido, diário de gratidão, journal de reflexão, template de planejamento, ficha de metas SMART, planner mensal, bullet journal, página de brain dump, lista de não fazer, contrato consigo mesmo, carta para o eu do futuro, registro de conquistas, log de tempo, diário de produtividade, ficha de revisão semanal, documento de plano de ação
5. TECNOLOGIA: laptop aberto, computador desktop, tela com gráfico de barras, tela com gráfico subindo, celular na mão, celular com notificação, tablet, tela com planilha, tela com apresentação, tela com dashboard, tela de progresso/loading, mouse, teclado, fones de ouvido, ícone de nuvem/cloud, app de tarefas na tela, app de pomodoro, bloqueador de distrações ativo, celular no modo avião, celular virado para baixo, notificações desativadas, app de hábitos com streak, tela com foco mode, computador com uma única aba, smartwatch com lembrete, tela dividida (trabalho/descanso), app de meditação, playlist de foco, extensão bloqueando redes sociais, dashboard de metas pessoais
6. SÍMBOLOS SIMPLES: seta para direita, seta para cima, seta curva, checkmark verde, X vermelho, círculo vazio, estrela, estrela com brilho, lâmpada acesa, lâmpada com raios, alvo com flecha no centro, troféu, medalha, thumbs up, thumbs down, ponto de exclamação, ponto de interrogação, sino, bandeira, cifrão, moedas empilhadas, coração, foguete decolando, escada de progresso, montanha com bandeira no topo, corrente com elo quebrado (mau hábito), corrente forte (bom hábito), semente virando planta, barra de progresso enchendo, cérebro com engrenagens, bateria carregando, bateria cheia, bateria vazia, ciclo virtuoso, espiral ascendente, ponte entre dois pontos, chave abrindo fechadura, peças de quebra-cabeça se encaixando, dominós em sequência, bússola apontando norte, âncora (o que te prende), asas (o que te liberta)
7. EXPRESSÕES: pessoa feliz completando tarefa, pessoa focada no trabalho, pessoa aliviada suspirando, pessoa comemorando com braços levantados, pessoa satisfeita, pessoa pensativa com mão no queixo, pessoa concentrada escrevendo, pessoa confusa com interrogação, pessoa preocupada com papéis, pessoa estressada, pessoa tendo ideia com lâmpada, pessoa relaxada após terminar, pessoa sorrindo olhando resultado, pessoa determinada, pessoa fazendo gesto de vitória, pessoa procrastinando no celular, pessoa entediada olhando para o teto, pessoa ansiosa olhando relógio, pessoa sobrecarregada com pilha de tarefas, pessoa paralisada sem saber por onde começar, pessoa distraída por notificação, pessoa resistindo tentação, pessoa respirando fundo antes de começar, pessoa entrando em estado de flow, pessoa ignorando distração, pessoa dizendo não para interrupção, pessoa acordando motivada, pessoa revisando dia com satisfação, pessoa se recompensando após meta, pessoa visualizando objetivo futuro

REGRA DE VARIEDADE:
- NÃO repita o mesmo tipo de elemento entre imagens próximas
- Se uma imagem usou "pessoa no computador", a próxima use "lista de tarefas" ou "quadro"
- Varie entre: pessoas, objetos, símbolos, diagramas

REGRAS DE DESCRIÇÃO:
- 1-2 frases CURTAS e DIRETAS
- Descreva: elemento principal + ação/estado + texto visível se relevante
- SEMPRE inclua termos específicos do conteúdo quando mencionados
- Textos em português brasileiro

EXEMPLO BASEADO EM CONTEXTO:
Texto: "Nessa aula trataremos da 2ª etapa do Processo PEÃO, que é Executar"
Descrição BOA: "Quadro branco com professor apontando, escrito '2ª ETAPA - EXECUTAR' em destaque, diagrama simples do Processo PEÃO ao lado"
Descrição RUIM: "Foguete decolando com chamas vermelhas representando início de jornada, palavra INÍCIO nas nuvens"`;

const DEFAULT_BASE_PROMPT = `Ilustração estilo esboço de quadro branco, 1920x1080px, fundo branco limpo, estilo artístico desenhado à mão com contornos em tinta preta e coloração suave estilo aquarela. Desenhos expressivos e emocionais com detalhes ricos. Sem moldura, sem borda, sem margens ao redor da imagem.

EXATAMENTE {NUM_ELEMENTS} METÁFORAS VISUAIS, bem espaçadas no canvas:

{ELEMENTS}

ESTILO: Esboço artístico como ilustração editorial, rostos e linguagem corporal expressivos, acentos de cor suaves com sombreamento sutil, linhas tremidas desenhadas à mão com personalidade, detalhes de hachura nas sombras, texto mínimo integrado naturalmente. Somente em português brasileiro.

COMPOSIÇÃO: Apenas {NUM_ELEMENTS} elementos principais, espaço branco generoso entre eles, tamanhos variados criando hierarquia, posicionamento orgânico e espalhado. Layout limpo e respirável. Elementos flutuando livremente sobre fundo branco puro.

NEGATIVO: layout em grade, composição lotada, estilo clip-art corporativo, muitos rótulos separados, setas de fluxograma entre elementos, fotorrealista, 3D, mãos desenhando, moldura, borda, margem, vinheta, moldura decorativa, moldura de quadro, decoração nas margens`;

// Storage keys para salvar templates
const TEMPLATE_STORAGE_KEY = 'automatizar-animacoes-prompt-templates';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f0f1a',
  },
  header: {
    padding: '24px 32px',
    borderBottom: '1px solid #2a2a4e',
    backgroundColor: '#1a1a2e',
    flexShrink: 0,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    margin: 0,
  },
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 360,
    borderRight: '1px solid #2a2a4e',
    backgroundColor: '#1a1a2e',
    overflow: 'auto',
    flexShrink: 0,
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  section: {
    padding: 20,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'white',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    marginBottom: 6,
    color: '#94a3b8',
    fontSize: 12,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    minHeight: 80,
  },
  button: {
    padding: '12px 24px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPrimary: {
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
  },
  buttonSecondary: {
    backgroundColor: '#4a4a6e',
    color: 'white',
  },
  buttonSuccess: {
    backgroundColor: '#22c55e',
    color: 'white',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #2a2a4e',
  },
  previewScene: {
    padding: '12px 16px',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    marginBottom: 8,
  },
  previewSceneNumber: {
    color: '#6366f1',
    fontWeight: 600,
    fontSize: 12,
    marginBottom: 4,
  },
  previewSceneText: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 1.5,
    maxHeight: 60,
    overflow: 'hidden',
  },
  previewSceneTime: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  outputArea: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 20,
    border: '1px solid #2a2a4e',
    overflow: 'auto',
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#ccc',
    whiteSpace: 'pre-wrap' as const,
    minHeight: 300,
  },
  footer: {
    padding: '16px 32px',
    borderTop: '1px solid #2a2a4e',
    backgroundColor: '#1a1a2e',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  warning: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid #fbbf24',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  warningText: {
    color: '#fbbf24',
    fontSize: 13,
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #2a2a4e',
    marginBottom: 16,
  },
  tab: {
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#888',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#6366f1',
    borderBottomColor: '#6366f1',
  },
  collapsible: {
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  collapsibleContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  promptCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    border: '1px solid #2a2a4e',
  },
  promptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  promptSceneNumber: {
    color: '#6366f1',
    fontWeight: 600,
    fontSize: 16,
  },
  promptTime: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  promptNarration: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    color: '#ccc',
    fontSize: 13,
    fontStyle: 'italic',
  },
  promptElements: {
    marginBottom: 12,
  },
  promptElementsTitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 8,
  },
  promptElementsList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  promptElement: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#a5b4fc',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 12,
  },
  promptContent: {
    backgroundColor: '#0f0f1a',
    padding: 12,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#22c55e',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  copyButton: {
    padding: '6px 12px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid #6366f1',
    borderRadius: 4,
    color: '#a5b4fc',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

type TabType = 'config' | 'preview' | 'output';

// Interface para prompts gerados no modo template
interface TemplateGeneratedPrompt {
  imageNumber: number;
  range: string;
  numElements: number;
  sourceText: string;
  elements: string;
  fullPrompt: string;
}

export const PromptsStep: React.FC<PromptsStepProps> = ({
  subtitles,
  onBack,
  onNext,
  onSkip,
  onSave,
  onPromptsGenerated,
}) => {
  // Modo de geração (template é o padrão)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('template');

  // Estado de configuração de cena (para modo scene)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig>(DEFAULT_SCENE_CONFIG);

  // Estado de configuração de estilo (para modo scene)
  const [styleConfig, setStyleConfig] = useState<PromptStyleConfig>(DEFAULT_STYLE_CONFIG);
  const [showAdvancedStyle, setShowAdvancedStyle] = useState(false);

  // Estado para modo template
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      }
    } catch { /* ignore */ }
    return DEFAULT_SYSTEM_PROMPT;
  });
  const [basePrompt, setBasePrompt] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.basePrompt || DEFAULT_BASE_PROMPT;
      }
    } catch { /* ignore */ }
    return DEFAULT_BASE_PROMPT;
  });
  const [legendsPerImage, setLegendsPerImage] = useState<number>(3);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showBasePrompt, setShowBasePrompt] = useState(false);

  // Estado de geração
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedScenePrompt[]>([]);
  const [templatePrompts, setTemplatePrompts] = useState<TemplateGeneratedPrompt[]>([]);

  // Estado da UI
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [templatesSaved, setTemplatesSaved] = useState(false);

  // Carrega configuração da API
  const [, forceUpdate] = useState(0);

  // Salva templates no localStorage quando alterados
  const saveTemplates = useCallback(() => {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify({
        systemPrompt,
        basePrompt,
      }));
      setTemplatesSaved(true);
      setTimeout(() => setTemplatesSaved(false), 2000);
    } catch { /* ignore */ }
  }, [systemPrompt, basePrompt]);

  // Calcular distribuição das legendas para modo template
  const templateDistribution = useMemo(() => {
    if (subtitles.length === 0) return { ranges: [], imageCount: 0 };
    const ranges: { start: number; end: number }[] = [];
    let current = 1;
    while (current <= subtitles.length) {
      const end = Math.min(current + legendsPerImage - 1, subtitles.length);
      ranges.push({ start: current, end });
      current = end + 1;
    }
    return { ranges, imageCount: ranges.length };
  }, [subtitles.length, legendsPerImage]);

  useEffect(() => {
    const handleFocus = () => {
      forceUpdate((n) => n + 1);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const apiConfig = useMemo(() => loadApiConfig(), [forceUpdate]);
  const isPromptGenValid = useMemo(() => isPromptGenConfigValid(apiConfig.promptGen), [apiConfig.promptGen]);

  // Preview da divisão de cenas
  const scenesPreview: DividedScene[] = useMemo(() => {
    if (!subtitles || subtitles.length === 0) return [];
    return previewSceneDivision(subtitles, sceneConfig.sceneDuration);
  }, [subtitles, sceneConfig.sceneDuration]);

  // Handler para gerar prompts
  const handleGenerate = useCallback(async () => {
    if (!isPromptGenValid) {
      setError('Configure a API de Geração de Prompts nas Configurações antes de gerar.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress('Iniciando geração...');

    const aiConfig: AIConfig = {
      provider: apiConfig.promptGen!.provider as PromptProvider,
      model: apiConfig.promptGen!.model,
      apiKey: apiConfig.promptGen!.apiKey,
    };

    try {
      const result = await generatePromptsFromSubtitles(
        subtitles,
        sceneConfig,
        styleConfig,
        aiConfig,
        (msg) => setProgress(msg)
      );

      if (!result.success) {
        setError(result.error || 'Erro desconhecido ao gerar prompts');
        return;
      }

      setGeneratedPrompts(result.scenes);
      onPromptsGenerated?.(result.scenes);
      setActiveTab('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsGenerating(false);
    }
  }, [isPromptGenValid, apiConfig.promptGen, subtitles, sceneConfig, styleConfig, onPromptsGenerated]);

  // Handler para gerar prompts no modo template
  const handleGenerateTemplate = useCallback(async () => {
    if (!isPromptGenValid) {
      setError('Configure a API de Geração de Prompts nas Configurações antes de gerar.');
      return;
    }

    if (templateDistribution.ranges.length === 0) {
      setError('Nenhuma legenda disponível para gerar prompts.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setTemplatePrompts([]);
    setProgress(`Gerando prompts... 0/${templateDistribution.imageCount}`);

    const generatedList: TemplateGeneratedPrompt[] = [];
    const allPreviousMetaphors: string[] = [];

    // Texto completo para contexto
    const fullContextText = subtitles.map(s => s.text).join(' ');

    try {
      for (let i = 0; i < templateDistribution.ranges.length; i++) {
        const range = templateDistribution.ranges[i];
        // Pega o texto das legendas do range (índice 0-based, range é 1-based)
        const rangeSubtitles = subtitles.slice(range.start - 1, range.end);
        const sourceText = rangeSubtitles.map(s => s.text).join(' ');
        const numElements = range.end - range.start + 1;

        setProgress(`Gerando imagem ${i + 1}/${templateDistribution.imageCount}...`);

        // Gera a lista de formato dinâmica baseada no número de elementos
        const formatList = Array.from({ length: numElements }, (_, idx) =>
          `[${idx + 1}] Descrição visual detalhada do ${idx + 1}º elemento`
        ).join('\n\n');

        // Monta contexto de metáforas anteriores para evitar repetição
        const usedThemesList = allPreviousMetaphors.length > 0
          ? `\n\n⚠️ TEMAS/OBJETOS PROIBIDOS (já usados):\n${allPreviousMetaphors.slice(-5).join('\n---\n')}`
          : '';

        const fullSystemPrompt = `${systemPrompt}

FORMATO DE RESPOSTA (APENAS isso, sem explicações):
${formatList}

CONTEXTO COMPLETO:
"${fullContextText.substring(0, 500)}..."${usedThemesList}`;

        // Chamada à API
        const provider = apiConfig.promptGen!.provider;
        const model = apiConfig.promptGen!.model;
        const apiKey = apiConfig.promptGen!.apiKey;

        let aiElements = '';

        try {
          // Mensagem do usuário mais explícita sobre a quantidade
          const userMessage = `IMAGEM ${i + 1} - Crie EXATAMENTE ${numElements} metáforas visuais (numeradas de [1] a [${numElements}]) para:\n\n"${sourceText}"\n\nIMPORTANTE: Você DEVE retornar exatamente ${numElements} elementos, um para cada legenda. Cada elemento deve começar com [N] onde N é o número.`;

          if (provider === 'openrouter') {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                max_tokens: 1500,
                messages: [
                  { role: 'system', content: fullSystemPrompt },
                  { role: 'user', content: userMessage },
                ],
              }),
            });
            const data = await response.json();
            aiElements = data.choices?.[0]?.message?.content || '[Erro ao gerar elementos]';
          } else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                max_tokens: 1500,
                messages: [
                  { role: 'system', content: fullSystemPrompt },
                  { role: 'user', content: userMessage },
                ],
              }),
            });
            const data = await response.json();
            aiElements = data.choices?.[0]?.message?.content || '[Erro ao gerar elementos]';
          } else if (provider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model,
                max_tokens: 1500,
                system: fullSystemPrompt,
                messages: [
                  { role: 'user', content: userMessage },
                ],
              }),
            });
            const data = await response.json();
            aiElements = data.content?.[0]?.text || '[Erro ao gerar elementos]';
          } else if (provider === 'google') {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [
                  { role: 'user', parts: [{ text: `${fullSystemPrompt}\n\n${userMessage}` }] },
                ],
                generationConfig: { maxOutputTokens: 1500 },
              }),
            });
            const data = await response.json();
            aiElements = data.candidates?.[0]?.content?.parts?.[0]?.text || '[Erro ao gerar elementos]';
          }
        } catch (err) {
          aiElements = `[Erro: ${err instanceof Error ? err.message : 'Falha na requisição'}]`;
        }

        // Guarda as metáforas para evitar repetição
        allPreviousMetaphors.push(aiElements);

        // Monta o prompt final usando o template base
        const finalPrompt = basePrompt
          .replace(/{NUM_ELEMENTS}/g, numElements.toString())
          .replace('{ELEMENTS}', aiElements);

        const newPrompt: TemplateGeneratedPrompt = {
          imageNumber: i + 1,
          range: `${range.start}-${range.end}`,
          numElements,
          sourceText,
          elements: aiElements,
          fullPrompt: finalPrompt,
        };

        generatedList.push(newPrompt);
        setTemplatePrompts([...generatedList]);
      }

      setProgress(`Concluído! ${generatedList.length} prompts gerados.`);

      // Converte para o formato esperado pelo onPromptsGenerated
      const convertedPrompts: GeneratedScenePrompt[] = generatedList.map(p => ({
        sceneNumber: p.imageNumber,
        startTime: 0,
        endTime: 0,
        narrationText: p.sourceText,
        visualElements: [],
        imagePrompt: p.fullPrompt,
      }));
      onPromptsGenerated?.(convertedPrompts);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsGenerating(false);
    }
  }, [isPromptGenValid, templateDistribution, subtitles, systemPrompt, basePrompt, apiConfig.promptGen, onPromptsGenerated]);

  // Handler para copiar prompt individual
  const handleCopyPrompt = useCallback((index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  // Handler para copiar todos
  const handleCopyAll = useCallback(() => {
    const text = formatOutputText(generatedPrompts);
    navigator.clipboard.writeText(text);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, [generatedPrompts]);

  // Handler para download
  const handleDownload = useCallback(() => {
    const text = formatOutputText(generatedPrompts);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompts-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedPrompts]);

  // Handler para copiar todos (modo template)
  const handleCopyAllTemplate = useCallback(() => {
    const text = templatePrompts
      .map((p) => `=== IMAGEM ${p.imageNumber} (Legendas ${p.range}) ===\n\n${p.fullPrompt}`)
      .join('\n\n\n---\n\n\n');
    navigator.clipboard.writeText(text);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, [templatePrompts]);

  // Handler para download (modo template)
  const handleDownloadTemplate = useCallback(() => {
    const text = templatePrompts
      .map((p) => `=== IMAGEM ${p.imageNumber} (Legendas ${p.range}) ===\n\nTexto fonte:\n${p.sourceText}\n\nElementos visuais:\n${p.elements}\n\nPrompt completo:\n\`\`\`\n${p.fullPrompt}\n\`\`\``)
      .join('\n\n\n' + '='.repeat(50) + '\n\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompts-template-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [templatePrompts]);

  // Prompts são opcionais - sempre pode avançar se tiver legendas
  const canProceed = subtitles.length > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Passo 2: Gerar Prompts para Imagens</h2>
        <p style={styles.subtitle}>
          Configure as opções e gere prompts detalhados para cada cena usando IA.
          Encontradas {scenesPreview.length} cenas com base nas legendas.
        </p>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Sidebar - Configurações */}
        <div style={styles.sidebar}>
          {/* Aviso se API não configurada */}
          {!isPromptGenValid && (
            <div style={{ ...styles.section, ...styles.warning }}>
              <p style={styles.warningText}>
                A API de Geração de Prompts não está configurada.
                Vá em <strong>Menu - Configurações</strong> para adicionar sua API Key.
              </p>
            </div>
          )}

          {/* Seletor de Modo */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Modo de Geração</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setGenerationMode('template')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: generationMode === 'template' ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  backgroundColor: generationMode === 'template' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0,0,0,0.3)',
                  color: generationMode === 'template' ? '#a5b4fc' : '#888',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Template
              </button>
              <button
                onClick={() => setGenerationMode('scene')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: generationMode === 'scene' ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  backgroundColor: generationMode === 'scene' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0,0,0,0.3)',
                  color: generationMode === 'scene' ? '#a5b4fc' : '#888',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Por Cenas
              </button>
            </div>
            <p style={{ color: '#666', fontSize: 11, marginTop: 8 }}>
              {generationMode === 'template'
                ? 'Usa templates personalizáveis para gerar prompts de imagem.'
                : 'Divide por duração das cenas e gera prompts baseados em estilo.'}
            </p>
          </div>

          {/* Configurações do Modo Template */}
          {generationMode === 'template' && (
            <>
              {/* Legendas por Imagem */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Legendas por Imagem</div>
                <select
                  value={legendsPerImage}
                  onChange={(e) => setLegendsPerImage(parseInt(e.target.value))}
                  style={styles.select}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'legenda' : 'legendas'} por imagem
                    </option>
                  ))}
                </select>
                {templateDistribution.imageCount > 0 && (
                  <div style={{ marginTop: 8, padding: 10, backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: 6 }}>
                    <p style={{ color: '#a5b4fc', fontSize: 12, margin: 0 }}>
                      {templateDistribution.imageCount} {templateDistribution.imageCount === 1 ? 'imagem será gerada' : 'imagens serão geradas'}
                    </p>
                  </div>
                )}
              </div>

              {/* System Prompt */}
              <div style={styles.section}>
                <div
                  style={{ ...styles.sectionTitle, ...styles.collapsible }}
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                >
                  <span>{showSystemPrompt ? '▼' : '▶'}</span>
                  <span>Instruções para Geração</span>
                </div>
                {showSystemPrompt && (
                  <div style={styles.collapsibleContent}>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      style={{ ...styles.textarea, minHeight: 200, fontSize: 11 }}
                      placeholder="Instruções de como a IA deve gerar os elementos visuais..."
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={saveTemplates}
                        style={{
                          ...styles.button,
                          ...(templatesSaved ? styles.buttonSuccess : styles.buttonSecondary),
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: 12,
                        }}
                      >
                        {templatesSaved ? '✓ Salvo!' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                        style={{ ...styles.button, ...styles.buttonSecondary, flex: 1, padding: '8px 12px', fontSize: 12 }}
                      >
                        Restaurar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Base Prompt Template */}
              <div style={styles.section}>
                <div
                  style={{ ...styles.sectionTitle, ...styles.collapsible }}
                  onClick={() => setShowBasePrompt(!showBasePrompt)}
                >
                  <span>{showBasePrompt ? '▼' : '▶'}</span>
                  <span>Template da Imagem</span>
                </div>
                {showBasePrompt && (
                  <div style={styles.collapsibleContent}>
                    <textarea
                      value={basePrompt}
                      onChange={(e) => setBasePrompt(e.target.value)}
                      style={{ ...styles.textarea, minHeight: 150, fontSize: 11 }}
                      placeholder="Template do prompt final..."
                    />
                    <p style={{ color: '#666', fontSize: 10, marginTop: 4 }}>
                      Use <code style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 3 }}>{'{ELEMENTS}'}</code> para elementos e <code style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 3 }}>{'{NUM_ELEMENTS}'}</code> para quantidade.
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={saveTemplates}
                        style={{
                          ...styles.button,
                          ...(templatesSaved ? styles.buttonSuccess : styles.buttonSecondary),
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: 12,
                        }}
                      >
                        {templatesSaved ? '✓ Salvo!' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => setBasePrompt(DEFAULT_BASE_PROMPT)}
                        style={{ ...styles.button, ...styles.buttonSecondary, flex: 1, padding: '8px 12px', fontSize: 12 }}
                      >
                        Restaurar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Configurações do Modo Scene */}
          {generationMode === 'scene' && (
            <>
              {/* Configuração de Cenas */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Configuração de Cenas</div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Duração das Cenas (segundos)</label>
                  <select
                    value={sceneConfig.sceneDuration}
                    onChange={(e) =>
                      setSceneConfig((prev) => ({ ...prev, sceneDuration: e.target.value as SceneDuration }))
                    }
                    style={styles.select}
                  >
                    <option value="15-30">15 a 30 segundos</option>
                    <option value="25-50">25 a 50 segundos</option>
                    <option value="40-60">40 a 60 segundos</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Elementos por Cena</label>
                  <select
                    value={sceneConfig.elementsPerScene}
                    onChange={(e) =>
                      setSceneConfig((prev) => ({ ...prev, elementsPerScene: e.target.value as ElementsPerScene }))
                    }
                    style={styles.select}
                  >
                    <option value="2-4">2 a 4 elementos</option>
                    <option value="4-8">4 a 8 elementos</option>
                    <option value="8-12">8 a 12 elementos</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Aspect Ratio</label>
                  <select
                    value={sceneConfig.aspectRatio}
                    onChange={(e) =>
                      setSceneConfig((prev) => ({ ...prev, aspectRatio: e.target.value as AspectRatio }))
                    }
                    style={styles.select}
                  >
                    <option value="16:9">16:9 (Horizontal - 1920x1080)</option>
                    <option value="9:16">9:16 (Vertical - 1080x1920)</option>
                    <option value="1:1">1:1 (Quadrado - 1080x1080)</option>
                  </select>
                </div>
              </div>

              {/* Configuração de Estilo (Avançado) */}
              <div style={styles.section}>
                <div
                  style={{ ...styles.sectionTitle, ...styles.collapsible }}
                  onClick={() => setShowAdvancedStyle(!showAdvancedStyle)}
                >
                  <span>{showAdvancedStyle ? '▼' : '▶'}</span>
                  <span>Configuração de Estilo</span>
                </div>

                {showAdvancedStyle && (
                  <div style={styles.collapsibleContent}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Style Prompt</label>
                      <textarea
                        value={styleConfig.stylePrompt}
                        onChange={(e) => setStyleConfig((prev) => ({ ...prev, stylePrompt: e.target.value }))}
                        style={{ ...styles.textarea, minHeight: 100 }}
                        placeholder="Prompt de estilo base..."
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Visual Elements</label>
                      <textarea
                        value={styleConfig.visualElements}
                        onChange={(e) => setStyleConfig((prev) => ({ ...prev, visualElements: e.target.value }))}
                        style={styles.textarea}
                        placeholder="Descrição de elementos visuais..."
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Composition Style</label>
                      <textarea
                        value={styleConfig.compositionStyle}
                        onChange={(e) => setStyleConfig((prev) => ({ ...prev, compositionStyle: e.target.value }))}
                        style={styles.textarea}
                        placeholder="Estilo de composição..."
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Negative Prompts</label>
                      <textarea
                        value={styleConfig.negativePrompts}
                        onChange={(e) => setStyleConfig((prev) => ({ ...prev, negativePrompts: e.target.value }))}
                        style={styles.textarea}
                        placeholder="O que evitar..."
                      />
                    </div>

                    <button
                      onClick={() => setStyleConfig(DEFAULT_STYLE_CONFIG)}
                      style={{ ...styles.button, ...styles.buttonSecondary, width: '100%', marginTop: 8 }}
                    >
                      Restaurar Padrão
                    </button>
                  </div>
                )}
              </div>

              {/* Preview das Cenas */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Preview das Cenas ({scenesPreview.length})</div>

                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {scenesPreview.slice(0, 10).map((scene) => (
                    <div key={scene.sceneNumber} style={styles.previewScene}>
                      <div style={styles.previewSceneNumber}>Cena {scene.sceneNumber}</div>
                      <div style={styles.previewSceneText}>
                        {scene.combinedText.substring(0, 120)}
                        {scene.combinedText.length > 120 ? '...' : ''}
                      </div>
                      <div style={styles.previewSceneTime}>
                        {formatTime(scene.startTime)} - {formatTime(scene.endTime)} ({scene.durationSeconds.toFixed(0)}s)
                      </div>
                    </div>
                  ))}
                  {scenesPreview.length > 10 && (
                    <div style={{ color: '#666', textAlign: 'center', padding: 12, fontSize: 12 }}>
                      ... e mais {scenesPreview.length - 10} cenas
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Botão de Gerar */}
          <div style={{ padding: 20 }}>
            <button
              onClick={generationMode === 'template' ? handleGenerateTemplate : handleGenerate}
              disabled={!isPromptGenValid || isGenerating || subtitles.length === 0}
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                ...((!isPromptGenValid || isGenerating) ? styles.buttonDisabled : {}),
                width: '100%',
              }}
            >
              {isGenerating ? (
                <>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 16,
                      height: 16,
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <span>Gerando...</span>
                </>
              ) : (
                <>
                  <span>Gerar Prompts com IA</span>
                </>
              )}
            </button>

            {/* CSS para animação */}
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>

            {progress && !error && (
              <div style={{ color: '#22c55e', marginTop: 12, fontSize: 13, textAlign: 'center' }}>
                {progress}
              </div>
            )}

            {error && (
              <div style={{ color: '#ef4444', marginTop: 12, fontSize: 13, textAlign: 'center' }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Main - Output */}
        <div style={styles.main}>
          {/* Modo Template - Prompts gerados */}
          {generationMode === 'template' && templatePrompts.length === 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                gap: 16,
              }}
            >
              <div style={{ fontSize: 64 }}>🎨</div>
              <div style={{ fontSize: 18 }}>Nenhum prompt gerado ainda</div>
              <div style={{ fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
                Configure as opções na barra lateral e clique em "Gerar Prompts com IA" para
                criar prompts usando templates personalizáveis.
              </div>
            </div>
          )}

          {generationMode === 'template' && templatePrompts.length > 0 && (
            <>
              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'white', fontSize: 16, fontWeight: 600 }}>
                  {templatePrompts.length} Prompts Gerados (Template)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCopyAllTemplate}
                    style={styles.copyButton}
                  >
                    {copiedIndex === -1 ? '✓ Copiado!' : 'Copiar Todos'}
                  </button>
                  <button
                    onClick={handleDownloadTemplate}
                    style={styles.copyButton}
                  >
                    Baixar .txt
                  </button>
                </div>
              </div>

              {/* Lista de Prompts Template */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {templatePrompts.map((prompt, index) => (
                  <div key={prompt.imageNumber} style={styles.promptCard}>
                    <div style={styles.promptHeader}>
                      <span style={styles.promptSceneNumber}>Imagem {prompt.imageNumber}</span>
                      <span style={styles.promptTime}>
                        Legendas {prompt.range} ({prompt.numElements} elementos)
                      </span>
                    </div>

                    <div style={styles.promptNarration}>"{prompt.sourceText}"</div>

                    <div style={styles.promptElements}>
                      <div style={styles.promptElementsTitle}>Elementos Visuais Gerados:</div>
                      <pre style={{
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        padding: 12,
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#fbbf24',
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}>
                        {prompt.elements}
                      </pre>
                    </div>

                    <div style={styles.promptContent}>{prompt.fullPrompt}</div>

                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button
                        onClick={() => handleCopyPrompt(index, prompt.fullPrompt)}
                        style={styles.copyButton}
                      >
                        {copiedIndex === index ? '✓ Copiado!' : 'Copiar Prompt'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Modo Scene - Prompts gerados */}
          {generationMode === 'scene' && generatedPrompts.length === 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                gap: 16,
              }}
            >
              <div style={{ fontSize: 64 }}>🎨</div>
              <div style={{ fontSize: 18 }}>Nenhum prompt gerado ainda</div>
              <div style={{ fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
                Configure as opções na barra lateral e clique em "Gerar Prompts com IA" para
                criar prompts detalhados para cada cena.
              </div>
            </div>
          )}

          {generationMode === 'scene' && generatedPrompts.length > 0 && (
            <>
              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'white', fontSize: 16, fontWeight: 600 }}>
                  {generatedPrompts.length} Prompts Gerados (Por Cenas)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCopyAll}
                    style={styles.copyButton}
                  >
                    {copiedIndex === -1 ? '✓ Copiado!' : 'Copiar Todos'}
                  </button>
                  <button
                    onClick={handleDownload}
                    style={styles.copyButton}
                  >
                    Baixar .txt
                  </button>
                </div>
              </div>

              {/* Lista de Prompts */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {generatedPrompts.map((prompt, index) => (
                  <div key={prompt.sceneNumber} style={styles.promptCard}>
                    <div style={styles.promptHeader}>
                      <span style={styles.promptSceneNumber}>Cena {prompt.sceneNumber}</span>
                      <span style={styles.promptTime}>
                        {formatTime(prompt.startTime)} - {formatTime(prompt.endTime)}
                      </span>
                    </div>

                    <div style={styles.promptNarration}>"{prompt.narrationText}"</div>

                    {prompt.visualElements.length > 0 && (
                      <div style={styles.promptElements}>
                        <div style={styles.promptElementsTitle}>Elementos Visuais Sugeridos:</div>
                        <div style={styles.promptElementsList}>
                          {prompt.visualElements.map((el, i) => (
                            <span key={i} style={styles.promptElement}>
                              {el}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={styles.promptContent}>{prompt.imagePrompt}</div>

                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button
                        onClick={() => handleCopyPrompt(index, prompt.imagePrompt)}
                        style={styles.copyButton}
                      >
                        {copiedIndex === index ? '✓ Copiado!' : 'Copiar Prompt'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button onClick={onBack} style={{ ...styles.button, ...styles.buttonSecondary }}>
          ← Voltar
        </button>

        <div style={{ display: 'flex', gap: 12 }}>
          {onSave && (
            <button onClick={onSave} style={{ ...styles.button, ...styles.buttonSecondary }}>
              💾 Salvar
            </button>
          )}
          <button
            onClick={onSkip}
            style={{
              ...styles.button,
              ...styles.buttonSecondary,
            }}
          >
            Pular (Sem Prompts) →
          </button>
          <button
            onClick={onNext}
            disabled={!canProceed || (templatePrompts.length === 0 && generatedPrompts.length === 0)}
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              ...((!canProceed || (templatePrompts.length === 0 && generatedPrompts.length === 0)) ? styles.buttonDisabled : {}),
            }}
          >
            Próximo: Gerar Imagens →
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper para formatar tempo
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default PromptsStep;
