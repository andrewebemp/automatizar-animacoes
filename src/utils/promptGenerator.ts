import { v4 as uuidv4 } from 'uuid';
import type { Subtitle } from '../types/Subtitle';
import type {
  ImageBlock,
  TimelineElement,
  ImageBlockConfig,
  GridLayout,
  ElementGridPosition,
} from '../types/ImageBlock';
import { DEFAULT_IMAGE_BLOCK_CONFIG } from '../types/ImageBlock';

/**
 * Tipo de intenção da narração
 */
export type NarrationIntent =
  | 'warning'      // Alerta, problema, perigo
  | 'tip'          // Conselho, dica, sugestão positiva
  | 'contrast'     // Comparação, antes/depois, certo/errado
  | 'explanation'  // Explicação neutra, definição
  | 'result'       // Consequência, resultado
  | 'question'     // Pergunta retórica
  | 'neutral';     // Neutro, informativo

/**
 * Sentimento da narração
 */
export type NarrationSentiment = 'positive' | 'negative' | 'neutral';

/**
 * Resultado da análise de intenção da narração
 */
export interface NarrationAnalysis {
  intent: NarrationIntent;
  sentiment: NarrationSentiment;
  instruction: string;  // Instrução específica para a IA de imagem
}

/**
 * Segmento parseado do SRT com informações adicionais
 */
export interface ParsedSegment {
  id: number;
  startTime: number; // ms
  endTime: number; // ms
  text: string;
  duration: number; // ms
}

/**
 * Elemento visual sugerido baseado na análise do texto
 */
export interface SuggestedVisualElement {
  description: string;
  keywords: string[];
  icon: string;
}

/**
 * Palavras de transição que indicam mudança de tópico
 */
const TRANSITION_WORDS = [
  'agora',
  'então',
  'mas',
  'porém',
  'entretanto',
  'primeiro',
  'segundo',
  'terceiro',
  'por outro lado',
  'além disso',
  'finalmente',
  'em conclusão',
  'próximo',
  'seguinte',
  'portanto',
  'assim',
  'dessa forma',
  'contudo',
  'todavia',
  'no entanto',
];

/**
 * Tipo para aspect ratio suportados
 */
export type AspectRatioType = '16:9' | '9:16' | '1:1';

/**
 * Padrões para análise visual do texto
 * Expandido com categorias temáticas para análise inteligente de conteúdo
 */
const VISUAL_PATTERNS: {
  pattern: RegExp;
  element: string;
  icon: string;
}[] = [
  // === PROCESSOS E EXECUÇÃO ===
  {
    pattern: /execut|etapa|processo|passo/i,
    element: 'checklist numerada com setas sequenciais',
    icon: '📋',
  },
  {
    pattern: /começa|inicia|simples/i,
    element: 'seta de início, pessoa começando ação',
    icon: '▶️',
  },
  {
    pattern: /termin|conclu|final/i,
    element: 'checkmark verde, linha de chegada',
    icon: '✅',
  },

  // === FOCO E ATENÇÃO ===
  {
    pattern: /foco|concentr|atenção/i,
    element: "pessoa focada no computador com balão 'CONCENTRAÇÃO'",
    icon: '🎯',
  },
  {
    pattern: /procrastin|distrai|celular|internet/i,
    element: 'smartphone/laptop com X, pessoa bloqueando distrações',
    icon: '📵',
  },
  {
    pattern: /remov|tira|elimina/i,
    element: "banner 'REMOVER DISTRAÇÕES', itens sendo afastados",
    icon: '🚫',
  },

  // === TEMPO E PRODUTIVIDADE ===
  {
    pattern: /tempo|rápido|menos tempo|horário/i,
    element: 'relógio com checkmark ou ampulheta',
    icon: '⏰',
  },
  {
    pattern: /bloco|rotina|tarefa/i,
    element: 'calendário ou lista de tarefas',
    icon: '📅',
  },
  {
    pattern: /render|produtiv|eficien/i,
    element: 'gráfico de barras ascendente, calendários com progresso',
    icon: '📈',
  },

  // === QUALIDADE E EXCELÊNCIA ===
  {
    pattern: /qualidade|excelên/i,
    element: "selo de qualidade com estrela, documento com 'A+'",
    icon: '⭐',
  },
  {
    pattern: /ideal|perfeito|melhor/i,
    element: 'estrela no topo, escada ascendente com pessoa subindo',
    icon: '🌟',
  },

  // === COMUNICAÇÃO ===
  {
    pattern: /conversa|pessoa|outra/i,
    element: 'balões de fala, stick figures conversando',
    icon: '💬',
  },
  {
    pattern: /comunicar|falar|ouvir|mensagem|email|telefone|apresent/i,
    element: 'balões de fala, celular com mensagem, envelope, megafone, palco',
    icon: '📢',
  },
  {
    pattern: /feedback|recomenda/i,
    element: 'balão com coração e like, pessoa fazendo joinha',
    icon: '👍',
  },

  // === PESSOAS E GRUPOS ===
  {
    pattern: /impossível|difícil|todos/i,
    element: 'grupo de pessoas, calendário com múltiplos dias',
    icon: '👥',
  },
  {
    pattern: /cliente|satisf|feliz/i,
    element: 'stick figure sorrindo, carrinho de compras com check',
    icon: '😊',
  },

  // === ACESSO E BLOQUEIOS ===
  {
    pattern: /acess|fácil|difícil de/i,
    element: 'cadeado, barreira, pessoa bloqueando acesso',
    icon: '🔒',
  },

  // === DINHEIRO E FINANÇAS ===
  {
    pattern: /dinheiro|custo|economia|lucro|investimento|financ|orçamento|poupar|gastar|preço|valor/i,
    element: 'cifrão, moedas, cofre, gráfico financeiro, carteira',
    icon: '💰',
  },

  // === IDEIAS E CRIATIVIDADE ===
  {
    pattern: /ideia|criativ|inovaç/i,
    element: 'lâmpada acesa, balão de pensamento',
    icon: '💡',
  },

  // === PROBLEMAS E SOLUÇÕES ===
  {
    pattern: /problema|erro|falha/i,
    element: 'X vermelho, sinal de alerta, pessoa confusa',
    icon: '❌',
  },
  {
    pattern: /solução|resolver|corrig/i,
    element: 'chave, engrenagem funcionando, pessoa com ferramenta',
    icon: '🔧',
  },

  // === SAÚDE E BEM-ESTAR ===
  {
    pattern: /saúde|saudável|exercício|corpo|mente|bem-estar|dormir|energia|cansad|descans/i,
    element: 'coração saudável, pessoa correndo, frutas/vegetais, cérebro feliz',
    icon: '❤️',
  },

  // === TRABALHO E CARREIRA ===
  {
    pattern: /trabalho|emprego|carreira|profissional|escritório|reunião|chefe|equipe|colegas/i,
    element: 'mesa de escritório, pessoa no computador, prédio comercial, crachá',
    icon: '💼',
  },

  // === OBJETIVOS E METAS ===
  {
    pattern: /objetivo|meta|sonho|alcançar|conquistar|sucesso|vitória|resultado/i,
    element: 'alvo com flecha no centro, troféu, bandeira no topo de montanha, pódio',
    icon: '🏆',
  },

  // === APRENDIZADO E EDUCAÇÃO ===
  {
    pattern: /aprender|estudar|conhecimento|aula|curso|livro|escola|universidade|formação/i,
    element: 'livro aberto, lâmpada de ideia, chapéu de formatura, quadro negro',
    icon: '📚',
  },

  // === PLANEJAMENTO E ORGANIZAÇÃO ===
  {
    pattern: /planejar|plano|estratégia|organizar|agenda|calendário|preparar|antecip/i,
    element: 'calendário, checklist com caneta, mapa com rota, fluxograma',
    icon: '🗓️',
  },

  // === CRESCIMENTO E PROGRESSO ===
  {
    pattern: /crescer|progredir|evoluir|desenvolver|avançar|melhorar|subir|aumentar/i,
    element: 'planta crescendo, escada ascendente, gráfico subindo, seta para cima',
    icon: '🌱',
  },

  // === FAMÍLIA E RELACIONAMENTOS ===
  {
    pattern: /família|filhos|pais|casamento|relacionamento|amigos|amor|parceiro/i,
    element: 'família de stick figures, coração, casa com pessoas, mãos dadas',
    icon: '👨‍👩‍👧',
  },

  // === TECNOLOGIA E DIGITAL ===
  {
    pattern: /tecnologia|digital|computador|software|app|sistema|automação|robot/i,
    element: 'laptop, smartphone, engrenagens digitais, robô amigável',
    icon: '💻',
  },

  // === SEGURANÇA E PROTEÇÃO ===
  {
    pattern: /segur|proteg|defend|guard|cuidad/i,
    element: 'escudo, cadeado fechado, pessoa com guarda-chuva protetor',
    icon: '🛡️',
  },

  // === NATUREZA E SUSTENTABILIDADE ===
  {
    pattern: /natureza|ambiente|sustentá|verde|ecológic|planeta|recicl/i,
    element: 'árvore, folha verde, planeta Terra, símbolo de reciclagem',
    icon: '🌍',
  },
];

/**
 * Converte legendas para segmentos parseados
 */
export function subtitlesToSegments(subtitles: Subtitle[]): ParsedSegment[] {
  return subtitles.map((sub) => ({
    id: sub.id,
    startTime: sub.startTime,
    endTime: sub.endTime,
    text: sub.text,
    duration: sub.endTime - sub.startTime,
  }));
}

/**
 * Detecta mudança de tópico entre dois segmentos
 */
export function detectTopicChange(
  _currentText: string,
  nextText: string
): boolean {
  const lowerNext = nextText.toLowerCase().trim();
  return TRANSITION_WORDS.some(
    (word) => lowerNext.startsWith(word) || lowerNext.startsWith(word + ',')
  );
}

/**
 * Analisa o texto de um segmento e sugere elemento visual
 * Versão básica - usada como fallback
 */
export function analyzeSegmentForVisual(text: string): SuggestedVisualElement {
  const lowerText = text.toLowerCase();

  for (const { pattern, element, icon } of VISUAL_PATTERNS) {
    if (pattern.test(lowerText)) {
      return {
        description: element,
        keywords: lowerText.match(pattern) || [],
        icon,
      };
    }
  }

  return {
    description: 'ícone representativo do conceito narrado',
    keywords: [],
    icon: '💡',
  };
}

/**
 * Contexto de narrações vizinhas para análise mais precisa
 */
interface NarrationContext {
  previous?: string;
  current: string;
  next?: string;
  /** Índice do segmento para variar instruções similares */
  segmentIndex?: number;
  /** Total de segmentos no bloco */
  totalSegments?: number;
}

/**
 * Variações de instruções para cada tipo de narração
 * Garante que mesmo tipos iguais gerem visuais diferentes
 */
const INSTRUCTION_VARIATIONS = {
  question: [
    'Ilustre a PERGUNTA: pessoa com mão no queixo pensando, "?" grande flutuando acima, expressão curiosa',
    'Ilustre a DÚVIDA: pessoa olhando para cima com expressão reflexiva, balão de pensamento com "?", livros ou documentos ao redor',
    'Ilustre o QUESTIONAMENTO: pessoa sentada em posição pensativa, múltiplos "?" pequenos ao redor, lâmpada apagada',
    'Ilustre a CURIOSIDADE: pessoa com lupa examinando algo, "?" destacado, setas apontando para diferentes direções',
  ],
  problem: [
    'Ilustre o PROBLEMA: pessoa com expressão frustrada, "X" vermelho grande, nuvem escura acima',
    'Ilustre a DIFICULDADE: pessoa empurrando pedra/obstáculo, sinal de alerta, caminho bloqueado',
    'Ilustre o OBSTÁCULO: pessoa parada diante de muro/barreira, expressão preocupada, setas bloqueadas',
    'Ilustre a FRUSTRAÇÃO: pessoa com mãos na cabeça, pilha de tarefas caindo, relógio com "X"',
  ],
  solution: [
    'Ilustre a SOLUÇÃO: pessoa com postura confiante, "✓" verde destacado, lâmpada acesa',
    'Ilustre a DICA: pessoa apontando para cima, balão com ideia brilhante, estrelas ao redor',
    'Ilustre o MÉTODO: pessoa seguindo caminho claro, setas direcionais, checkmarks em sequência',
    'Ilustre a ESTRATÉGIA: pessoa com mapa/plano nas mãos, alvo com flecha, passos numerados',
  ],
  consequence: [
    'Ilustre o RESULTADO: seta "→" conectando ação ao efeito, pessoa observando consequência',
    'Ilustre o EFEITO: diagrama de causa-efeito, dominós caindo em sequência, desfecho claro',
    'Ilustre a CONSEQUÊNCIA: antes/depois lado a lado, seta de transformação no meio',
    'Ilustre o IMPACTO: ondas de efeito saindo de uma ação central, pessoa reagindo',
  ],
  contrast: [
    'Ilustre o CONTRASTE: célula dividida verticalmente, "X" à esquerda vs "✓" à direita',
    'Ilustre a COMPARAÇÃO: balança com dois lados diferentes, pesos visuais distintos',
    'Ilustre o ANTES/DEPOIS: linha do tempo horizontal, transformação clara no meio',
    'Ilustre a DIFERENÇA: duas versões da mesma pessoa, uma apagada/triste, outra vibrante/feliz',
  ],
  explanation: [
    'Ilustre o CONCEITO: diagrama simples com setas explicativas, ícone central representativo',
    'Ilustre a DEFINIÇÃO: banner com termo destacado, elementos visuais definindo o conceito',
    'Ilustre a EXPLICAÇÃO: quadro branco com esquema, pessoa apresentando conteúdo',
    'Ilustre o ENTENDIMENTO: cérebro com conexões, peças de quebra-cabeça se encaixando',
  ],
  neutral: [
    'Ilustre o TEMA: ícone representativo do assunto, pessoa em contexto relevante',
    'Ilustre a IDEIA: representação visual do conceito mencionado, elementos relacionados ao redor',
    'Ilustre o CONTEXTO: cena que representa a situação descrita, elementos de apoio',
    'Ilustre a SITUAÇÃO: ambiente visual que representa o tema, pessoa interagindo com elementos',
  ],
};

/**
 * Seleciona uma variação de instrução baseada no índice para evitar repetições
 */
function getVariedInstruction(type: keyof typeof INSTRUCTION_VARIATIONS, index: number): string {
  const variations = INSTRUCTION_VARIATIONS[type];
  return variations[index % variations.length];
}

/**
 * Analisa o contexto narrativo de um segmento considerando os vizinhos
 * Retorna instrução específica para a IA de imagem baseada no fluxo da narrativa
 */
export function analyzeNarrationWithContext(context: NarrationContext): string {
  const { current, segmentIndex = 0 } = context;
  const lowerCurrent = current.toLowerCase();

  // ========================================================================
  // 1. DETECTAR TIPO DE NARRAÇÃO PELO CONTEÚDO
  // ========================================================================

  // Detecta se está introduzindo um PROBLEMA
  const isProblemIntro = /\b(problema|erro|falha|difícil|complicad|caótic|infernal|insustentável|tóxic|stress|burnout|frustrad|cansa|esgota|sobrecarga|improdutiv|procrastin|bloqueia|impede|trava|perda|prejuízo|pior|ruim|mal|nunca|jamais|impossível|destrói|prejudica|arruina|acaba com)\b/i.test(lowerCurrent);

  // Detecta se está apresentando uma SOLUÇÃO
  const isSolutionIntro = /\b(solução|resolver|conserta|corrig|funciona|eficaz|eficien|melhor|ideal|dica|conselho|estratégia|método|técnica|truque|segredo|recomend|sugir|faça|experimente|tente|comece|aplique|use)\b/i.test(lowerCurrent);

  // Detecta se é uma CONSEQUÊNCIA/RESULTADO
  const isConsequence = /\b(então|portanto|assim|dessa forma|resultado|consequência|efeito|impacto|por isso|logo|causa|gera|leva a|provoca|acontece|ocorre)\b/i.test(lowerCurrent);

  // Detecta se é uma PERGUNTA
  const isQuestion = /\?$/.test(current.trim()) ||
    /\b(você sabe|já pensou|imagina|será que|sabia que|por que|como|o que|qual)\b/i.test(lowerCurrent);

  // Detecta se é uma EXPLICAÇÃO/DEFINIÇÃO
  const isExplanation = /\b(significa|é quando|consiste|define|definição|conceito|ou seja|isto é|em outras palavras|basicamente|chamamos|conhecid)\b/i.test(lowerCurrent);

  // Detecta se é um CONTRASTE
  const isContrast = /\b(mas|porém|entretanto|enquanto|ao contrário|diferente|invés de|ao invés|em vez de|antes.*depois|errado.*certo|ruim.*bom)\b/i.test(lowerCurrent);

  // Detecta LISTA/ENUMERAÇÃO
  const isListItem = /\b(primeiro|segundo|terceiro|quarto|quinto|1\.|2\.|3\.|4\.|5\.|passo \d|fase \d|etapa \d)\b/i.test(lowerCurrent);

  // ========================================================================
  // 2. GERAR INSTRUÇÃO ESPECÍFICA BASEADA NA ANÁLISE (com variações)
  // ========================================================================

  // PERGUNTA - usar variação baseada no índice
  if (isQuestion) {
    return getVariedInstruction('question', segmentIndex);
  }

  // PROBLEMA sendo apresentado - usar variação
  if (isProblemIntro && !isSolutionIntro) {
    return getVariedInstruction('problem', segmentIndex);
  }

  // SOLUÇÃO sendo apresentada - usar variação
  if (isSolutionIntro && !isProblemIntro) {
    return getVariedInstruction('solution', segmentIndex);
  }

  // CONSEQUÊNCIA/RESULTADO - usar variação
  if (isConsequence) {
    return getVariedInstruction('consequence', segmentIndex);
  }

  // CONTRASTE - usar variação
  if (isContrast) {
    return getVariedInstruction('contrast', segmentIndex);
  }

  // LISTA/ENUMERAÇÃO - manter específico para o número
  if (isListItem) {
    const stepMatch = current.match(/\b(primeiro|segundo|terceiro|quarto|quinto|passo \d|fase \d|etapa \d|\d\.)/i);
    const stepText = stepMatch ? stepMatch[0].toUpperCase() : 'PASSO';
    return `Ilustre o ${stepText} de forma SEQUENCIAL: número "${stepText}" destacado em círculo, ícone representativo da ação específica, seta indicando próximo passo`;
  }

  // EXPLICAÇÃO/DEFINIÇÃO - usar variação
  if (isExplanation) {
    return getVariedInstruction('explanation', segmentIndex);
  }

  // ========================================================================
  // 4. FALLBACK - Análise genérica pelo conteúdo
  // ========================================================================

  // Detecta conceitos específicos no texto atual
  if (/\b(tempo|horário|relógio|calendário|agenda|prazo|deadline)\b/i.test(lowerCurrent)) {
    return 'Ilustre o conceito de TEMPO: relógio, calendário ou linha do tempo, pessoa interagindo com elemento temporal';
  }

  if (/\b(dinheiro|custo|preço|valor|economia|lucro|investimento|financ)\b/i.test(lowerCurrent)) {
    return 'Ilustre o conceito FINANCEIRO: cifrão "$", moedas, gráfico financeiro, pessoa analisando números';
  }

  if (/\b(equipe|time|grupo|colabor|junto|parceria)\b/i.test(lowerCurrent)) {
    return 'Ilustre TRABALHO EM EQUIPE: grupo de stick figures colaborando, setas conectando pessoas, símbolo de união';
  }

  if (/\b(objetivo|meta|alvo|sonho|conquist|sucesso|vitória)\b/i.test(lowerCurrent)) {
    return 'Ilustre OBJETIVO/META: alvo com flecha no centro, pessoa alcançando topo, troféu, bandeira de chegada';
  }

  if (/\b(foco|concentr|atenção)\b/i.test(lowerCurrent)) {
    return 'Ilustre FOCO: pessoa concentrada, lupa ou mira, elementos de distração riscados';
  }

  if (/\b(energia|dispost|motivad|animad)\b/i.test(lowerCurrent)) {
    return 'Ilustre ENERGIA/MOTIVAÇÃO: pessoa com postura confiante, raios de energia, sorriso, sol brilhante';
  }

  // Fallback final
  return 'Ilustre o CONCEITO principal da narração: ícone representativo do tema mencionado, pessoa em contexto relevante, texto-chave do conceito em destaque';
}

/**
 * Versão simplificada para compatibilidade - analisa sem contexto
 * @deprecated Use analyzeNarrationWithContext para análise mais precisa
 */
export function analyzeNarrationIntent(text: string): NarrationAnalysis {
  const instruction = analyzeNarrationWithContext({ current: text });

  // Determina sentiment baseado em palavras-chave simples para compatibilidade
  const lowerText = text.toLowerCase();
  const hasNegative = /\b(problema|difícil|ruim|mal|pior|stress|frustrad|erro|falha|nunca|impossível|destrói|prejudica)\b/i.test(lowerText);
  const hasPositive = /\b(solução|resolver|funciona|melhor|bom|sucesso|dica|conselho|fácil|simples)\b/i.test(lowerText);

  let sentiment: NarrationSentiment = 'neutral';
  let intent: NarrationIntent = 'neutral';

  if (hasNegative && !hasPositive) {
    sentiment = 'negative';
    intent = 'warning';
  } else if (hasPositive && !hasNegative) {
    sentiment = 'positive';
    intent = 'tip';
  }

  return { intent, sentiment, instruction };
}

/**
 * Extrai palavras-chave significativas de um texto
 */
function extractKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  // Remove palavras comuns (stopwords em português)
  const stopwords = new Set([
    'a', 'o', 'e', 'é', 'de', 'da', 'do', 'em', 'um', 'uma', 'para', 'com', 'não',
    'que', 'se', 'na', 'no', 'por', 'mais', 'as', 'os', 'como', 'mas', 'foi',
    'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito',
    'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso',
    'ela', 'entre', 'era', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem',
    'nas', 'me', 'esse', 'eles', 'estão', 'você', 'tinha', 'foram', 'essa', 'num',
    'nem', 'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos', 'elas', 'havia',
    'seja', 'qual', 'será', 'nós', 'tenho', 'lhe', 'deles', 'essas', 'esses',
    'pelas', 'este', 'fosse', 'dele', 'tu', 'te', 'vocês', 'vos', 'lhes', 'meus',
    'minhas', 'teu', 'tua', 'teus', 'tuas', 'nosso', 'nossa', 'nossos', 'nossas',
    'dela', 'delas', 'esta', 'estes', 'estas', 'aquele', 'aquela', 'aqueles',
    'aquelas', 'isto', 'aquilo', 'estou', 'está', 'estamos', 'estão', 'estive',
    'esteve', 'estivemos', 'estiveram', 'estava', 'estávamos', 'estavam',
    'assim', 'então', 'porque', 'porém', 'ainda', 'sobre', 'pode', 'podem',
    'fazer', 'feito', 'sendo', 'sido', 'tendo', 'tido', 'vai', 'vão', 'ir',
    'vez', 'vezes', 'cada', 'todo', 'toda', 'todos', 'todas', 'outro', 'outra',
    'outros', 'outras', 'bem', 'mal', 'agora', 'sempre', 'nunca', 'aqui', 'ali',
    'onde', 'aonde', 'porquê', 'portanto', 'entretanto', 'contudo', 'todavia',
  ]);

  // Extrai palavras significativas (>3 caracteres, não stopwords)
  const words = lowerText
    .replace(/[.,;:!?""''()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopwords.has(word));

  return [...new Set(words)]; // Remove duplicatas
}

/**
 * Gera descrição visual única e específica para um segmento
 * considerando o contexto do bloco inteiro
 */
export function generateUniqueVisualDescription(
  segment: ParsedSegment,
  segmentIndex: number,
  _allSegments: ParsedSegment[],
  usedDescriptions: Set<string>
): SuggestedVisualElement {
  const text = segment.text;
  const lowerText = text.toLowerCase();
  const keywords = extractKeywords(text);

  // Encontra todos os patterns que correspondem ao texto
  const matchingPatterns: { element: string; icon: string; score: number }[] = [];

  for (const { pattern, element, icon } of VISUAL_PATTERNS) {
    if (pattern.test(lowerText)) {
      // Calcula score baseado em quantas palavras-chave do pattern estão no texto
      const patternSource = pattern.source.toLowerCase();
      let score = 1;
      keywords.forEach(kw => {
        if (patternSource.includes(kw)) score += 2;
      });
      matchingPatterns.push({ element, icon, score });
    }
  }

  // Ordena por score (maior primeiro)
  matchingPatterns.sort((a, b) => b.score - a.score);

  // Tenta encontrar uma descrição que ainda não foi usada
  for (const match of matchingPatterns) {
    if (!usedDescriptions.has(match.element)) {
      usedDescriptions.add(match.element);
      return {
        description: match.element,
        keywords,
        icon: match.icon,
      };
    }
  }

  // Se todas as descrições padrão já foram usadas, gera uma descrição contextual
  const contextualDescription = generateContextualDescription(text, keywords, segmentIndex);

  return {
    description: contextualDescription,
    keywords,
    icon: determineIconFromKeywords(keywords),
  };
}

/**
 * Gera uma descrição contextual baseada nas palavras-chave únicas do segmento
 */
function generateContextualDescription(
  text: string,
  keywords: string[],
  index: number
): string {
  const lowerText = text.toLowerCase();

  // Detecta conceitos específicos no texto
  const concepts: string[] = [];

  // Detecta números/quantidades
  if (/\d+|primeiro|segundo|terceiro|quarto|quinto/i.test(text)) {
    concepts.push('numeração ou sequência');
  }

  // Detecta comparações
  if (/melhor|pior|maior|menor|mais|menos/i.test(lowerText)) {
    concepts.push('comparação visual (balança, gráfico comparativo)');
  }

  // Detecta negações/problemas
  if (/não|nunca|jamais|impossível|difícil|problema/i.test(lowerText)) {
    concepts.push('X vermelho ou sinal de alerta');
  }

  // Detecta afirmações/soluções
  if (/sim|sempre|possível|fácil|solução|funciona/i.test(lowerText)) {
    concepts.push('checkmark verde ou sinal positivo');
  }

  // Detecta transições
  if (/mas|porém|entretanto|contudo|todavia/i.test(lowerText)) {
    concepts.push('seta de transição ou divisor');
  }

  // Detecta consequências
  if (/então|portanto|assim|dessa forma|resultado|consequência/i.test(lowerText)) {
    concepts.push('seta indicando resultado');
  }

  // Detecta exemplos
  if (/exemplo|por exemplo|como|tipo/i.test(lowerText)) {
    concepts.push('balão de exemplo ou destaque');
  }

  // Detecta emoções negativas
  if (/infernal|insustentável|improdutiv|cansa|stress|ansieda/i.test(lowerText)) {
    concepts.push('pessoa estressada, nuvem de tempestade, expressão negativa');
  }

  // Detecta emoções positivas
  if (/sustentável|produtiv|equilíbr|feliz|calm|tranquil/i.test(lowerText)) {
    concepts.push('pessoa calma, sol, expressão positiva');
  }

  // Detecta rotina
  if (/rotina|dia a dia|cotidian|diariamente|hábito/i.test(lowerText)) {
    concepts.push('ciclo diário, calendário com repetição');
  }

  // Detecta siglas ou acrônimos (como RPS, R3I)
  const acronymMatch = text.match(/\b[A-Z]{2,5}\b/g);
  if (acronymMatch) {
    concepts.push(`texto destacado "${acronymMatch.join(', ')}" em banner`);
  }

  // Se encontrou conceitos específicos, usa-os
  if (concepts.length > 0) {
    return concepts.slice(0, 2).join(', ');
  }

  // Fallback: extrai as 2-3 palavras-chave mais relevantes
  const relevantKeywords = keywords
    .filter(kw => kw.length > 4)
    .slice(0, 3);

  if (relevantKeywords.length > 0) {
    return `representação visual de: ${relevantKeywords.join(', ')}`;
  }

  // Último fallback
  return `elemento visual ${index + 1} do conceito narrado`;
}

/**
 * Determina o ícone mais apropriado baseado nas palavras-chave
 */
function determineIconFromKeywords(keywords: string[]): string {
  const keywordStr = keywords.join(' ').toLowerCase();

  if (/negativ|infernal|insustentável|improdutiv|stress|problem/.test(keywordStr)) return '⚠️';
  if (/positiv|sustentável|produtiv|sucesso|conquist/.test(keywordStr)) return '✨';
  if (/rotina|dia|tempo|horário/.test(keywordStr)) return '📅';
  if (/resultado|consequência|então|portanto/.test(keywordStr)) return '➡️';
  if (/exemplo|tipo|como/.test(keywordStr)) return '💬';

  return '📌';
}

/**
 * Agrupa segmentos em blocos de imagem (20-60 segundos cada)
 */
export function groupSegmentsIntoImageBlocks(
  segments: ParsedSegment[],
  fps: number,
  config: ImageBlockConfig = DEFAULT_IMAGE_BLOCK_CONFIG
): ImageBlock[] {
  const imageBlocks: ImageBlock[] = [];

  let currentBlock: {
    segments: ParsedSegment[];
    totalDuration: number;
    startTime: number | null;
    endTime: number | null;
  } = {
    segments: [],
    totalDuration: 0,
    startTime: null,
    endTime: null,
  };

  segments.forEach((segment, idx) => {
    if (currentBlock.startTime === null) {
      currentBlock.startTime = segment.startTime;
    }

    currentBlock.segments.push(segment);
    currentBlock.totalDuration = segment.endTime - currentBlock.startTime;
    currentBlock.endTime = segment.endTime;

    const shouldSplit =
      currentBlock.totalDuration >= config.minDuration &&
      (currentBlock.totalDuration >= config.maxDuration ||
        idx === segments.length - 1 ||
        (config.preferTopicBoundaries &&
          segments[idx + 1] &&
          detectTopicChange(segment.text, segments[idx + 1].text)));

    if (shouldSplit || idx === segments.length - 1) {
      // Criar o ImageBlock
      const blockIndex = imageBlocks.length;

      const timeline: TimelineElement[] = currentBlock.segments.map(
        (seg) => {
          // Extrai o label que será usado na imagem (ex: "PROCRASTINAÇÃO", "ROTINAS PRODUTIVAS")
          const elementLabel = extractElementLabel(seg.text);
          return {
            id: uuidv4(),
            subtitleIndex: seg.id,
            startTime: seg.startTime,
            endTime: seg.endTime,
            startFrame: Math.floor((seg.startTime / 1000) * fps),
            endFrame: Math.floor((seg.endTime / 1000) * fps),
            elementDescription: elementLabel, // Usa o label que aparece na imagem
            narrationText: seg.text,
            region: undefined,
            regionSource: undefined,
          };
        }
      );

      // Calcula o grid layout para este bloco
      const gridLayout = calculateGridLayout(timeline.length);
      const elementPositions = calculateElementPositions(timeline.length, gridLayout);

      const block: ImageBlock = {
        id: uuidv4(),
        index: blockIndex,
        prompt: generateImagePrompt(currentBlock.segments, blockIndex + 1, imageBlocks.length + 1),
        startTime: currentBlock.startTime!,
        endTime: currentBlock.endTime!,
        startFrame: Math.floor((currentBlock.startTime! / 1000) * fps),
        endFrame: Math.floor((currentBlock.endTime! / 1000) * fps),
        image: undefined,
        timeline,
        detectionStatus: 'pending',
        gridLayout,
        elementPositions,
        manualDetectionMode: true, // Default to manual mode
      };

      imageBlocks.push(block);

      // Reset para próximo bloco
      currentBlock = {
        segments: [],
        totalDuration: 0,
        startTime: null,
        endTime: null,
      };
    }
  });

  // Atualizar o total de imagens no prompt
  return imageBlocks.map((block, idx) => ({
    ...block,
    prompt: generateImagePrompt(
      segments.filter((s) =>
        block.timeline.some((t) => t.subtitleIndex === s.id)
      ),
      idx + 1,
      imageBlocks.length
    ),
  }));
}

/**
 * Gera prompt para criação de imagem
 * Otimizado para consistência com narração e facilidade de detecção automática
 */
export function generateImagePrompt(
  segments: ParsedSegment[],
  imageIndex: number,
  totalImages: number,
  aspectRatio: AspectRatioType = '16:9'
): string {
  const numElements = segments.length;
  const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0) / 1000;

  // Calcula o grid ideal para os elementos
  const gridLayout = calculateGridLayout(numElements, aspectRatio);
  const { cols, rows } = gridLayout;

  let prompt = `Ilustração de animação em quadro branco, estilo esboço desenhado à mão com contornos pretos sobre fundo branco puro. Estética educacional limpa e explicativa.

═══════════════════════════════════════════════════════════════════
ESTILO VISUAL OBRIGATÓRIO:
═══════════════════════════════════════════════════════════════════
- Fundo branco puro (#FFFFFF)
- Traços pretos estilo desenho à mão/marcador
- Elementos em azul (#0077CC) e vermelho (#CC0000) como destaques
- Estilo stick figure para pessoas
- Ícones simplificados e reconhecíveis
- Texto e caracteres sempre em pt-br (português brasileiro)
- NÃO adicione timestamps ou indicações de tempo na imagem
- NÃO adicionar "Elemento x" ou numeração visível

═══════════════════════════════════════════════════════════════════
LAYOUT OBRIGATÓRIO - GRID ${cols}x${rows}:
═══════════════════════════════════════════════════════════════════
- Dividir a imagem em GRID de ${cols} colunas × ${rows} linhas
- CADA CÉLULA deve conter EXATAMENTE UM elemento da lista abaixo
- Elemento 1 = célula SUPERIOR ESQUERDA
- Elementos seguem ordem de leitura: esquerda→direita, cima→baixo
- PREENCHER cada célula COMPLETAMENTE com o elemento correspondente
- SEPARAÇÃO CLARA entre células (espaço em branco de ~5% entre elas)
- Cada elemento deve OCUPAR 90% da área de sua célula

═══════════════════════════════════════════════════════════════════
CONTEÚDO DA CENA (${numElements} elementos em grid ${cols}x${rows}):
═══════════════════════════════════════════════════════════════════
`;

  segments.forEach((segment, idx) => {
    const positionDesc = getGridPositionDescription(idx + 1, gridLayout);
    const elementLabel = extractElementLabel(segment.text);

    // Analisa com índice para variar instruções similares
    const instruction = analyzeNarrationWithContext({
      current: segment.text,
      segmentIndex: idx,
      totalSegments: segments.length,
    });

    prompt += `
┌─ CÉLULA ${idx + 1} (${positionDesc}) ─────────────────────────────
│ NARRAÇÃO: "${segment.text}"
│
│ INSTRUÇÃO: ${instruction}
│
│ LABEL: "${elementLabel}" em destaque dentro do desenho
│ OCUPAR: Toda a área da célula ${idx + 1}
└────────────────────────────────────────────────────────────────
`;
  });

  prompt += `
═══════════════════════════════════════════════════════════════════
REGRAS DE COMPOSIÇÃO:
═══════════════════════════════════════════════════════════════════
- Imagem ${imageIndex} de ${totalImages}
- Duração total: ${totalDuration.toFixed(1)} segundos
- CRÍTICO: Cada elemento deve ter CONTORNOS CLAROS e FECHADOS
- CRÍTICO: Elementos devem ser GRANDES e preencher suas células
- CRÍTICO: NÃO sobrepor elementos de células diferentes
- Estilo: traços grossos (~3-5px), alto contraste com fundo branco
- Incluir TEXTO/RÓTULO em cada elemento para identificação

═══════════════════════════════════════════════════════════════════
DIFERENCIAÇÃO VISUAL OBRIGATÓRIA:
═══════════════════════════════════════════════════════════════════
- CRÍTICO: CADA CÉLULA DEVE SER VISUALMENTE ÚNICA - NÃO pode haver duas células parecidas
- CRÍTICO: Mesmo que as instruções pareçam similares, VARIE os elementos visuais:
  • Use OBJETOS diferentes em cada célula (relógio, livro, gráfico, computador, etc.)
  • Use POSES/AÇÕES diferentes para a pessoa (sentada, em pé, correndo, pensando, etc.)
  • Use SÍMBOLOS diferentes (?, !, ✓, X, seta, lâmpada, engrenagem, etc.)
  • Use COMPOSIÇÕES diferentes (diagonal, centrado, dividido, empilhado, etc.)
- A "pessoa" (stick figure) pode ter estilo similar, MAS deve estar em SITUAÇÃO DIFERENTE
- Os OBJETOS, ÍCONES e SÍMBOLOS devem ser COMPLETAMENTE DIFERENTES em cada célula
- Se uma célula tem "pessoa pensando com ?", a próxima NÃO pode ter pessoa pensando
- Se uma célula tem "gráfico", a próxima deve ter OUTRO tipo de visual (lista, ícone, diagrama)
- NÃO repetir palavras-chave em elementos próximos (cada label deve ser único)
- IMPORTANTE: Leia TODAS as instruções das células e garanta que NENHUMA seja visualmente similar

ASPECT RATIO: ${aspectRatio}
RESOLUÇÃO: Alta definição (mínimo 2048px no lado maior)

NÃO INCLUIR: fotografias realistas, degradês complexos, sombras realistas, elementos 3D, cores fora da paleta especificada, elementos sobrepostos entre células, molduras ou contornos de quadros ao redor dos elementos.`;

  return prompt;
}

/**
 * Calcula o layout do grid ideal para um número de elementos
 * Para 16:9, prefere layouts mais largos (mais colunas que linhas)
 */
export function calculateGridLayout(numElements: number, aspectRatio: AspectRatioType = '16:9'): GridLayout {
  if (numElements <= 0) return { cols: 1, rows: 1 };
  if (numElements === 1) return { cols: 1, rows: 1 };
  if (numElements === 2) return aspectRatio === '9:16' ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
  if (numElements === 3) return aspectRatio === '9:16' ? { cols: 1, rows: 3 } : { cols: 3, rows: 1 };
  if (numElements === 4) return { cols: 2, rows: 2 };
  if (numElements === 5) return aspectRatio === '9:16' ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
  if (numElements === 6) return aspectRatio === '9:16' ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
  if (numElements === 7) return aspectRatio === '9:16' ? { cols: 2, rows: 4 } : { cols: 4, rows: 2 };
  if (numElements === 8) return aspectRatio === '9:16' ? { cols: 2, rows: 4 } : { cols: 4, rows: 2 };
  if (numElements === 9) return { cols: 3, rows: 3 };
  if (numElements === 10) return aspectRatio === '9:16' ? { cols: 2, rows: 5 } : { cols: 5, rows: 2 };
  if (numElements <= 12) return aspectRatio === '9:16' ? { cols: 3, rows: 4 } : { cols: 4, rows: 3 };

  // Para mais elementos, calcula baseado em sqrt ajustado pelo aspect ratio
  const aspectMultiplier = aspectRatio === '9:16' ? 0.5625 : (aspectRatio === '1:1' ? 1 : 1.7778);
  const cols = Math.ceil(Math.sqrt(numElements * aspectMultiplier));
  const rows = Math.ceil(numElements / cols);
  return { cols, rows };
}

/**
 * Calcula as posições esperadas de cada elemento no grid
 */
export function calculateElementPositions(
  numElements: number,
  gridLayout: GridLayout
): ElementGridPosition[] {
  const { cols, rows } = gridLayout;
  const cellWidthPercent = 100 / cols;
  const cellHeightPercent = 100 / rows;

  // Margem de 5% dentro de cada célula
  const marginPercent = 5;
  const contentWidthPercent = cellWidthPercent - (marginPercent * 2 / cols);
  const contentHeightPercent = cellHeightPercent - (marginPercent * 2 / rows);

  const positions: ElementGridPosition[] = [];

  for (let i = 0; i < numElements; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    positions.push({
      elementIndex: i + 1,
      gridCol: col,
      gridRow: row,
      expectedXPercent: col * cellWidthPercent + marginPercent / cols,
      expectedYPercent: row * cellHeightPercent + marginPercent / rows,
      expectedWidthPercent: contentWidthPercent,
      expectedHeightPercent: contentHeightPercent,
    });
  }

  return positions;
}

/**
 * Gera descrição de posição no grid para um elemento
 */
function getGridPositionDescription(index: number, gridLayout: GridLayout): string {
  const { cols } = gridLayout;
  const col = (index - 1) % cols;
  const row = Math.floor((index - 1) / cols);

  const colNames = ['ESQUERDA', 'CENTRO', 'DIREITA', 'EXTREMA DIREITA'];
  const rowNames = ['SUPERIOR', 'MEIO', 'INFERIOR', 'BASE'];

  const colName = col < colNames.length ? colNames[col] : `COLUNA ${col + 1}`;
  const rowName = row < rowNames.length ? rowNames[row] : `LINHA ${row + 1}`;

  if (gridLayout.cols === 1) return rowName;
  if (gridLayout.rows === 1) return colName;

  return `${rowName} ${colName}`;
}

/**
 * Mapeamento de conceitos para labels de texto
 * Usado para extrair palavras-chave da narração para destaque visual
 * Ordem importa: padrões mais específicos devem vir antes dos genéricos
 */
const LABEL_CONCEPT_MAP: { pattern: RegExp; label: string }[] = [
  // PROCRASTINAÇÃO E PRODUTIVIDADE (mais específicos primeiro)
  { pattern: /rotina.*infernal|infernal/i, label: 'ROTINA INFERNAL' },
  { pattern: /rotina.*produtiv|RPS/i, label: 'ROTINA PRODUTIVA' },
  { pattern: /rotina.*insustentável|insustentável/i, label: 'INSUSTENTÁVEL' },
  { pattern: /ciclo vicioso|ciclo negativo/i, label: 'CICLO VICIOSO' },
  { pattern: /ciclo positivo|ciclo virtuoso/i, label: 'CICLO POSITIVO' },
  { pattern: /se livrar|livrar-se|escapar|sair d/i, label: 'LIBERDADE' },
  { pattern: /escolha|escolher|decidir|decisão/i, label: 'ESCOLHA' },
  { pattern: /procrastin/i, label: 'PROCRASTINAÇÃO' },
  { pattern: /produtiv/i, label: 'PRODUTIVIDADE' },
  { pattern: /improdutiv/i, label: 'IMPRODUTIVO' },
  { pattern: /sobrecarga|sobrecarregad/i, label: 'SOBRECARGA' },
  { pattern: /queimar|burnout|esgota/i, label: 'BURNOUT' },

  // FASES E PROCESSOS NUMERADOS
  { pattern: /primeira fase|fase 1|1ª fase|primeiro passo/i, label: 'FASE 1' },
  { pattern: /segunda fase|fase 2|2ª fase|segundo passo/i, label: 'FASE 2' },
  { pattern: /terceira fase|fase 3|3ª fase|terceiro passo/i, label: 'FASE 3' },
  { pattern: /quarta fase|fase 4|4ª fase|quarto passo/i, label: 'FASE 4' },
  { pattern: /quinta fase|fase 5|5ª fase|quinto passo/i, label: 'FASE 5' },
  { pattern: /etapa|passo|processo/i, label: 'ETAPAS' },

  // CONCEITOS ESPECÍFICOS DE CONTEÚDO
  { pattern: /vídeo|video|youtube|canal/i, label: 'VÍDEO' },
  { pattern: /metodologia|método|técnica|sistema/i, label: 'METODOLOGIA' },
  { pattern: /ferramenta|tool/i, label: 'FERRAMENTA' },
  { pattern: /foco|concentr|atenção/i, label: 'FOCO' },
  { pattern: /distração|distrai/i, label: 'DISTRAÇÃO' },
  { pattern: /tarefa|task|to.?do/i, label: 'TAREFAS' },
  { pattern: /prioridade|prioriz/i, label: 'PRIORIDADE' },

  // ENSINO E APRENDIZADO
  { pattern: /aula|ensin|aprend/i, label: 'AULA' },
  { pattern: /livro|ler|estudar/i, label: 'ESTUDO' },
  { pattern: /dica|conselho|sugestão/i, label: 'DICA' },
  { pattern: /segredo|secreto/i, label: 'SEGREDO' },

  // EMOÇÕES E ESTADOS
  { pattern: /feliz|alegr|satisf/i, label: 'FELIZ' },
  { pattern: /trist|deprim|desanim/i, label: 'TRISTE' },
  { pattern: /stress|estress|ansied/i, label: 'ESTRESSE' },
  { pattern: /calm|tranquil|paz|relaxa/i, label: 'CALMA' },
  { pattern: /motiv|inspir|entusiasm/i, label: 'MOTIVAÇÃO' },
  { pattern: /cansa|exaust|fadig/i, label: 'CANSAÇO' },
  { pattern: /energi|dispost/i, label: 'ENERGIA' },

  // RESULTADOS E CONQUISTAS
  { pattern: /resultado|consequência|efeito/i, label: 'RESULTADO' },
  { pattern: /sucesso|vitória|conquist|alcançar/i, label: 'SUCESSO' },
  { pattern: /fracasso|falha|derrota/i, label: 'FRACASSO' },
  { pattern: /meta|objetivo|goal/i, label: 'META' },
  { pattern: /progresso|avanç|evolu/i, label: 'PROGRESSO' },

  // TEMPO
  { pattern: /tempo|hora|relógio|minuto/i, label: 'TEMPO' },
  { pattern: /dia a dia|diário|cotidian|rotina/i, label: 'DIA A DIA' },
  { pattern: /deadline|prazo|urgente/i, label: 'PRAZO' },
  { pattern: /manhã|acordar|despertar/i, label: 'MANHÃ' },
  { pattern: /noite|dormir|descanso/i, label: 'NOITE' },
  { pattern: /semana|semanal/i, label: 'SEMANA' },

  // COMPARAÇÕES E CONTRASTES
  { pattern: /em vez de|ao invés|diferente de/i, label: 'VS' },
  { pattern: /antes.*depois|depois.*antes/i, label: 'ANTES/DEPOIS' },
  { pattern: /melhor|superior|vantag/i, label: 'MELHOR' },
  { pattern: /pior|inferior|desvantag/i, label: 'PIOR' },
  { pattern: /igual|mesmo|similar/i, label: 'IGUAL' },

  // MUDANÇA E TRANSFORMAÇÃO
  { pattern: /mudan|transform|evolu/i, label: 'MUDANÇA' },
  { pattern: /hábito|costume/i, label: 'HÁBITO' },
  { pattern: /começ|inici|start/i, label: 'INÍCIO' },
  { pattern: /fim|termin|conclu/i, label: 'FIM' },

  // COMUNICAÇÃO E RELACIONAMENTOS
  { pattern: /falar|conversa|comunic/i, label: 'CONVERSA' },
  { pattern: /perguntar|pergunta|questão|\?/i, label: 'PERGUNTA' },
  { pattern: /resposta|responder/i, label: 'RESPOSTA' },
  { pattern: /equipe|time|grupo|juntos/i, label: 'EQUIPE' },

  // CONCEITOS GENÉRICOS (fallback)
  { pattern: /pessoa|você|alguém|gente/i, label: 'PESSOA' },
  { pattern: /dinheiro|custo|valor|preço/i, label: 'DINHEIRO' },
  { pattern: /ideia|pensar|imagin/i, label: 'IDEIA' },
  { pattern: /problema|dificuldade|obstáculo/i, label: 'PROBLEMA' },
  { pattern: /solução|resolver|saída/i, label: 'SOLUÇÃO' },
  { pattern: /verdade|real|fato/i, label: 'VERDADE' },
  { pattern: /mentira|falso|mito/i, label: 'MITO' },
  { pattern: /importante|essencial|crucial/i, label: 'IMPORTANTE' },
  { pattern: /simples|fácil|básico/i, label: 'SIMPLES' },
  { pattern: /difícil|complexo|complicad/i, label: 'DIFÍCIL' },
];

/**
 * Extrai o rótulo/título mais relevante para o elemento
 */
function extractElementLabel(text: string): string {
  const lowerText = text.toLowerCase();

  // Procura conceito mapeado
  for (const concept of LABEL_CONCEPT_MAP) {
    if (concept.pattern.test(lowerText)) {
      return concept.label;
    }
  }

  // Fallback: extrai substantivo principal
  const words = text
    .split(/\s+/)
    .filter(w => w.length > 4 && !/^(quando|então|assim|porque|porém|ainda|também|muito|mais|menos|para|como|onde|qual)$/i.test(w))
    .slice(0, 2);

  return words.join(' ').toUpperCase().substring(0, 20) || 'ELEMENTO';
}

/**
 * Formata tempo em milissegundos para string HH:MM:SS,mmm
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Regenera os prompts de todos os ImageBlocks com um novo aspect ratio
 */
export function regenerateBlocksWithAspectRatio(
  imageBlocks: ImageBlock[],
  segments: ParsedSegment[],
  aspectRatio: AspectRatioType
): ImageBlock[] {
  return imageBlocks.map((block, idx) => {
    const blockSegments = segments.filter((s) =>
      block.timeline.some((t) => t.subtitleIndex === s.id)
    );

    return {
      ...block,
      prompt: generateImagePrompt(
        blockSegments,
        idx + 1,
        imageBlocks.length,
        aspectRatio
      ),
    };
  });
}

/**
 * Redistribui os elementos do timeline entre os blocos de imagem com base nas quantidades especificadas.
 * Permite ao usuário definir manualmente quantos elementos cada imagem deve ter.
 *
 * @param imageBlocks - Blocos de imagem atuais
 * @param elementCounts - Array com a quantidade de elementos desejada para cada bloco
 * @param subtitles - Todas as legendas do projeto
 * @param fps - Frames por segundo do projeto
 * @param aspectRatio - Proporção do vídeo
 * @returns Novos blocos de imagem redistribuídos
 */
export function redistributeElementsAcrossBlocks(
  imageBlocks: ImageBlock[],
  elementCounts: number[],
  subtitles: Subtitle[],
  fps: number,
  aspectRatio: AspectRatioType = '16:9'
): ImageBlock[] {
  // Coleta todos os elementos de timeline de todos os blocos
  const allTimelineElements: TimelineElement[] = imageBlocks.flatMap(block => block.timeline);

  // Valida se a soma das quantidades é igual ao total de elementos
  const totalElements = allTimelineElements.length;
  const requestedTotal = elementCounts.reduce((sum, count) => sum + count, 0);

  if (requestedTotal !== totalElements) {
    console.warn(`[redistributeElements] Soma das quantidades (${requestedTotal}) difere do total de elementos (${totalElements})`);
  }

  // Cria novos blocos com a distribuição especificada
  const newBlocks: ImageBlock[] = [];
  let elementIndex = 0;

  for (let blockIndex = 0; blockIndex < elementCounts.length; blockIndex++) {
    const elementsForThisBlock = elementCounts[blockIndex];

    // Pega os próximos N elementos
    const blockElements = allTimelineElements.slice(elementIndex, elementIndex + elementsForThisBlock);
    elementIndex += elementsForThisBlock;

    if (blockElements.length === 0) continue;

    // Calcula start/end times do bloco
    const blockStartTime = blockElements[0].startTime;
    const blockEndTime = blockElements[blockElements.length - 1].endTime;

    // Calcula o grid layout para este bloco
    const gridLayout = calculateGridLayout(blockElements.length, aspectRatio);
    const elementPositions = calculateElementPositions(blockElements.length, gridLayout);

    // Obtém os segmentos correspondentes para regenerar o prompt
    const blockSegments: ParsedSegment[] = blockElements.map(el => ({
      id: el.subtitleIndex,
      startTime: el.startTime,
      endTime: el.endTime,
      text: el.narrationText,
      duration: el.endTime - el.startTime,
    }));

    // Preserva dados da imagem se existir no bloco original correspondente
    const originalBlock = imageBlocks[blockIndex];

    const newBlock: ImageBlock = {
      id: originalBlock?.id || uuidv4(),
      index: blockIndex,
      prompt: generateImagePrompt(blockSegments, blockIndex + 1, elementCounts.length, aspectRatio),
      startTime: blockStartTime,
      endTime: blockEndTime,
      startFrame: Math.floor((blockStartTime / 1000) * fps),
      endFrame: Math.floor((blockEndTime / 1000) * fps),
      image: originalBlock?.image, // Preserva imagem se existir
      timeline: blockElements,
      detectionStatus: originalBlock?.image ? 'pending' : 'pending', // Reseta para re-detecção
      gridLayout,
      elementPositions,
      manualDetectionMode: originalBlock?.manualDetectionMode ?? true, // Preserva ou default to manual
    };

    newBlocks.push(newBlock);
  }

  return newBlocks;
}

/**
 * Calcula a distribuição inicial de elementos baseada na duração
 * Retorna um array com a quantidade sugerida de elementos para cada bloco
 */
export function calculateInitialDistribution(
  totalElements: number,
  numberOfBlocks: number
): number[] {
  if (numberOfBlocks <= 0) return [];
  if (totalElements <= 0) return Array(numberOfBlocks).fill(0);

  const baseCount = Math.floor(totalElements / numberOfBlocks);
  const remainder = totalElements % numberOfBlocks;

  const distribution: number[] = [];
  for (let i = 0; i < numberOfBlocks; i++) {
    // Distribui os elementos extras nos primeiros blocos
    distribution.push(baseCount + (i < remainder ? 1 : 0));
  }

  return distribution;
}

/**
 * Gera texto do cronograma de animação para download
 */
export function generateTimelineText(
  imageBlocks: ImageBlock[],
  aspectRatio: AspectRatioType = '16:9'
): string {
  const date = new Date().toLocaleDateString('pt-BR');
  const totalDuration = imageBlocks.length > 0
    ? ((imageBlocks[imageBlocks.length - 1].endTime) / 1000).toFixed(1)
    : '0';

  let text = `╔══════════════════════════════════════════════════════════════╗
║  CRONOGRAMA DE ANIMAÇÃO - WHITEBOARD VIDEO                    ║
╠══════════════════════════════════════════════════════════════╣
║  Gerado em: ${date.padEnd(50)}║
║  Aspect Ratio: ${aspectRatio.padEnd(47)}║
║  Total de imagens: ${imageBlocks.length.toString().padEnd(43)}║
║  Duração total: ${(totalDuration + 's').padEnd(46)}║
╚══════════════════════════════════════════════════════════════╝

`;

  imageBlocks.forEach((block) => {
    const blockDuration = ((block.endTime - block.startTime) / 1000).toFixed(1);
    text += `┌${'─'.repeat(62)}┐\n`;
    text += `│  IMAGEM ${block.index + 1} │ ${formatTime(block.startTime)} → ${formatTime(block.endTime)} │ ${blockDuration}s │ ${block.timeline.length} elementos\n`;
    text += `└${'─'.repeat(62)}┘\n\n`;

    text += `┌────────────────────────┬────────────────────────┬────────────────────────────────────────┐\n`;
    text += `│ Nº  │ Tempo            │ Visual                 │ Narração                               │\n`;
    text += `├────────────────────────┼────────────────────────┼────────────────────────────────────────┤\n`;

    block.timeline.forEach((el, idx) => {
      const timeRange = `${formatTime(el.startTime).substring(3, 8)} - ${formatTime(el.endTime).substring(3, 8)}`;
      const visualTrunc = el.elementDescription.length > 20
        ? el.elementDescription.substring(0, 17) + '...'
        : el.elementDescription.padEnd(20);
      const narrationTrunc = el.narrationText.length > 36
        ? el.narrationText.substring(0, 33) + '...'
        : el.narrationText.padEnd(36);

      text += `│ ${(idx + 1).toString().padStart(2)}  │ ${timeRange.padEnd(16)} │ ${visualTrunc.padEnd(22)} │ ${narrationTrunc.padEnd(38)} │\n`;
    });

    text += `└────────────────────────┴────────────────────────┴────────────────────────────────────────┘\n\n`;
  });

  return text;
}
