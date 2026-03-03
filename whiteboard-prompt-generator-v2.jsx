import { useState, useCallback } from "react";

const WhiteboardPromptGenerator = () => {
  const [srtContent, setSrtContent] = useState("");
  const [parsedSegments, setParsedSegments] = useState([]);
  const [generatedOutput, setGeneratedOutput] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [fileName, setFileName] = useState("");

  // Parse SRT file content
  const parseSRT = (content) => {
    const blocks = content.trim().split(/\n\n+/);
    const segments = [];

    blocks.forEach((block) => {
      const lines = block.split("\n");
      if (lines.length >= 2) {
        const index = parseInt(lines[0]);
        const timeMatch = lines[1].match(
          /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
        );
        if (timeMatch) {
          const text = lines.slice(2).join(" ").trim();
          const startTime = timeMatch[1];
          const endTime = timeMatch[2];

          const parseTime = (t) => {
            const [h, m, rest] = t.split(":");
            const [s, ms] = rest.split(",");
            return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
          };

          segments.push({
            index,
            startTime,
            endTime,
            startSeconds: parseTime(startTime),
            endSeconds: parseTime(endTime),
            text,
            duration: parseTime(endTime) - parseTime(startTime),
          });
        }
      }
    });

    return segments;
  };

  // Group segments into image blocks (20-60 seconds each)
  const groupSegmentsIntoImages = (segments) => {
    const images = [];
    let currentImage = {
      segments: [],
      totalDuration: 0,
      startTime: null,
      endTime: null,
      startSeconds: 0,
    };

    segments.forEach((segment, idx) => {
      if (currentImage.startTime === null) {
        currentImage.startTime = segment.startTime;
        currentImage.startSeconds = segment.startSeconds;
      }

      currentImage.segments.push(segment);
      currentImage.totalDuration = segment.endSeconds - currentImage.startSeconds;
      currentImage.endTime = segment.endTime;

      const shouldSplit =
        currentImage.totalDuration >= 20 &&
        (currentImage.totalDuration >= 40 ||
          idx === segments.length - 1 ||
          (segments[idx + 1] && detectTopicChange(segment.text, segments[idx + 1].text)));

      if (shouldSplit || idx === segments.length - 1) {
        images.push({ ...currentImage, imageIndex: images.length + 1 });
        currentImage = {
          segments: [],
          totalDuration: 0,
          startTime: null,
          endTime: null,
          startSeconds: 0,
        };
      }
    });

    return images;
  };

  const detectTopicChange = (currentText, nextText) => {
    const transitionWords = [
      "agora", "então", "mas", "porém", "entretanto", "primeiro",
      "segundo", "terceiro", "por outro lado", "além disso",
      "finalmente", "em conclusão", "próximo", "seguinte",
    ];
    const lowerNext = nextText.toLowerCase();
    return transitionWords.some((word) => lowerNext.startsWith(word));
  };

  // Analyze content for visual elements
  const analyzeSegmentForVisual = (text) => {
    const lowerText = text.toLowerCase();
    
    const patterns = [
      { pattern: /execut|etapa|processo|passo/i, element: "checklist numerada com setas sequenciais", icon: "📋" },
      { pattern: /foco|concentr|atenção/i, element: "pessoa focada no computador com balão 'CONCENTRAÇÃO'", icon: "🎯" },
      { pattern: /tempo|rápido|menos tempo|horário/i, element: "relógio com checkmark ou ampulheta", icon: "⏰" },
      { pattern: /qualidade|excelên/i, element: "selo de qualidade com estrela, documento com 'A+'", icon: "⭐" },
      { pattern: /bloco|rotina|tarefa/i, element: "calendário ou lista de tarefas", icon: "📅" },
      { pattern: /procrastin|distrai|celular|internet/i, element: "smartphone/laptop com X, pessoa bloqueando distrações", icon: "📵" },
      { pattern: /conversa|pessoa|outra/i, element: "balões de fala, stick figures conversando", icon: "💬" },
      { pattern: /começa|inicia|simples/i, element: "seta de início, pessoa começando ação", icon: "▶️" },
      { pattern: /termin|conclu|final/i, element: "checkmark verde, linha de chegada", icon: "✅" },
      { pattern: /ideal|perfeito|melhor/i, element: "estrela no topo, escada ascendente com pessoa subindo", icon: "🌟" },
      { pattern: /impossível|difícil|todos/i, element: "grupo de pessoas, calendário com múltiplos dias", icon: "👥" },
      { pattern: /render|produtiv|crescen/i, element: "gráfico de barras ascendente, calendários com progresso", icon: "📈" },
      { pattern: /remov|tira|elimina/i, element: "banner 'REMOVER DISTRAÇÕES', itens sendo afastados", icon: "🚫" },
      { pattern: /acess|fácil|difícil de/i, element: "cadeado, barreira, pessoa bloqueando acesso", icon: "🔒" },
      { pattern: /cliente|satisf|feliz/i, element: "stick figure sorrindo, carrinho de compras com check", icon: "😊" },
      { pattern: /feedback|recomenda/i, element: "balão com coração e like, pessoa fazendo joinha", icon: "👍" },
    ];

    for (const { pattern, element, icon } of patterns) {
      if (pattern.test(lowerText)) {
        return { element, icon };
      }
    }
    return { element: "ícone representativo do conceito narrado", icon: "💡" };
  };

  // Map visual elements from generated image to SRT segments
  const mapImageElementsToTimeline = (imageGroup, imageIndex) => {
    const elements = [];
    
    // Analyze each segment and create element mapping
    imageGroup.segments.forEach((segment, idx) => {
      const { element, icon } = analyzeSegmentForVisual(segment.text);
      elements.push({
        elementNumber: idx + 1,
        srtIndex: segment.index,
        startTime: segment.startTime,
        endTime: segment.endTime,
        duration: segment.duration.toFixed(1),
        narrationText: segment.text,
        visualElement: element,
        icon: icon,
        animationNote: `Revelar elemento ${idx + 1} com efeito draw-on`,
      });
    });

    return elements;
  };

  // Generate prompt for Nano Banana Pro
  const generatePrompt = (imageGroup, imageIndex, totalImages) => {
    const numElements = imageGroup.segments.length;

    let prompt = `Ilustração de animação em quadro branco, estilo esboço desenhado à mão com contornos pretos sobre fundo branco puro. Estética educacional limpa e explicativa.

ESTILO VISUAL OBRIGATÓRIO:
- Fundo branco puro (#FFFFFF)
- Traços pretos estilo desenho à mão/marcador
- Elementos em azul (#0077CC) e vermelho (#CC0000) como destaques
- Estilo stick figure para pessoas
- Ícones simplificados e reconhecíveis
- Layout da esquerda para direita ou de cima para baixo
- Espaçamento generoso entre elementos para animação posterior

CONTEÚDO DA CENA (${numElements} elementos distintos para animar sequencialmente):
`;

    imageGroup.segments.forEach((segment, idx) => {
      const { element } = analyzeSegmentForVisual(segment.text);
      const truncatedText = segment.text.length > 80 
        ? segment.text.substring(0, 80) + "..." 
        : segment.text;
      prompt += `
Elemento ${idx + 1} (${segment.startTime} - ${segment.endTime}): "${truncatedText}"
  → Representar com: ${element}`;
    });

    // Extract key visual themes
    const allText = imageGroup.segments.map(s => s.text).join(" ").toLowerCase();
    const visualThemes = [];
    
    if (/tempo|relógio|hora/.test(allText)) visualThemes.push("relógio, ampulheta");
    if (/foco|concentr/.test(allText)) visualThemes.push("pessoa focada, lupa");
    if (/qualidade|excel/.test(allText)) visualThemes.push("selo de qualidade, estrela");
    if (/produtiv|render|crescen/.test(allText)) visualThemes.push("gráfico ascendente, seta para cima");
    if (/distrai|celular|internet/.test(allText)) visualThemes.push("smartphone com X, laptop");
    if (/execut|tarefa|bloco/.test(allText)) visualThemes.push("checklist, engrenagens");
    if (/ideal|melhor/.test(allText)) visualThemes.push("escada, pessoa subindo, estrela no topo");
    if (/remov|elimina/.test(allText)) visualThemes.push("banner destacado, itens sendo removidos");

    if (visualThemes.length > 0) {
      prompt += `

ELEMENTOS VISUAIS SUGERIDOS:
${visualThemes.join(", ")}`;
    }

    prompt += `

COMPOSIÇÃO:
- Imagem ${imageIndex} de ${totalImages}
- Duração total: ${imageGroup.totalDuration.toFixed(1)} segundos
- Todos os elementos devem ter contornos claros para facilitar animação de "reveal"
- Manter espaço entre elementos para animação sequencial
- Cada elemento deve ser visualmente distinto e separável

ASPECT RATIO: 16:9
RESOLUÇÃO: Alta definição para vídeo

NÃO INCLUIR: fotografias realistas, degradês complexos, sombras realistas, elementos 3D, cores fora da paleta especificada.`;

    return prompt;
  };

  // Process the SRT file
  const processFile = useCallback(() => {
    if (!srtContent.trim()) return;

    setIsProcessing(true);

    setTimeout(() => {
      const segments = parseSRT(srtContent);
      setParsedSegments(segments);

      const imageGroups = groupSegmentsIntoImages(segments);

      const output = imageGroups.map((group, idx) => ({
        imageIndex: idx + 1,
        prompt: generatePrompt(group, idx + 1, imageGroups.length),
        timeRange: `${group.startTime} → ${group.endTime}`,
        duration: group.totalDuration,
        segmentCount: group.segments.length,
        timeline: mapImageElementsToTimeline(group, idx + 1),
        startTime: group.startTime,
        endTime: group.endTime,
      }));

      setGeneratedOutput(output);
      setIsProcessing(false);
      setActiveTab("results");
    }, 500);
  }, [srtContent]);

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setSrtContent(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Generate timeline text for download
  const generateTimelineText = () => {
    let text = `# CRONOGRAMA DE ANIMAÇÃO - WHITEBOARD VIDEO\n`;
    text += `# Total de imagens: ${generatedOutput.length}\n\n`;

    generatedOutput.forEach((img) => {
      text += `${"═".repeat(60)}\n`;
      text += `IMAGEM ${img.imageIndex} | ${img.startTime} → ${img.endTime} | ${img.duration.toFixed(1)}s\n`;
      text += `${"═".repeat(60)}\n\n`;

      img.timeline.forEach((el) => {
        text += `[${el.startTime} - ${el.endTime}] Elemento ${el.elementNumber}\n`;
        text += `  Narração: "${el.narrationText}"\n`;
        text += `  Visual: ${el.visualElement}\n`;
        text += `  Ação: ${el.animationNote}\n\n`;
      });
    });

    return text;
  };

  // Download timeline
  const downloadTimeline = () => {
    const blob = new Blob([generateTimelineText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cronograma_animacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #0d0d0d 0%, #1a1a2e 50%, #0f3460 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#e8e8e8",
      padding: "24px",
    }}>
      {/* Header */}
      <header style={{
        textAlign: "center",
        marginBottom: "32px",
        padding: "32px",
        background: "rgba(255,255,255,0.02)",
        borderRadius: "24px",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(10px)",
      }}>
        <h1 style={{
          fontSize: "2.8rem",
          fontWeight: "800",
          background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 50%, #f472b6 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "12px",
          letterSpacing: "-0.5px",
        }}>
          🎨 Whiteboard Prompt Generator
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "1.15rem", fontWeight: "400" }}>
          Nano Banana Pro • SRT → Prompts + Cronograma de Animação
        </p>
      </header>

      {/* Tabs */}
      <nav style={{
        display: "flex",
        gap: "12px",
        marginBottom: "28px",
        justifyContent: "center",
      }}>
        {[
          { id: "upload", label: "📤 Upload SRT" },
          { id: "results", label: "🎬 Prompts & Timeline" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "14px 28px",
              borderRadius: "14px",
              border: "none",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "600",
              transition: "all 0.25s ease",
              background: activeTab === tab.id
                ? "linear-gradient(135deg, #7c3aed 0%, #00d4ff 100%)"
                : "rgba(255,255,255,0.04)",
              color: activeTab === tab.id ? "#fff" : "#64748b",
              boxShadow: activeTab === tab.id 
                ? "0 8px 32px rgba(124, 58, 237, 0.35)" 
                : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div style={{
          maxWidth: "800px",
          margin: "0 auto",
          background: "rgba(255,255,255,0.02)",
          borderRadius: "20px",
          padding: "32px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div
            style={{
              border: "2px dashed rgba(124, 58, 237, 0.4)",
              borderRadius: "18px",
              padding: "48px",
              textAlign: "center",
              marginBottom: "24px",
              background: "rgba(124, 58, 237, 0.03)",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
            onClick={() => document.getElementById("file-input").click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "#00d4ff";
              e.currentTarget.style.background = "rgba(0, 212, 255, 0.05)";
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.4)";
              e.currentTarget.style.background = "rgba(124, 58, 237, 0.03)";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && file.name.endsWith(".srt")) {
                setFileName(file.name);
                const reader = new FileReader();
                reader.onload = (event) => setSrtContent(event.target.result);
                reader.readAsText(file);
              }
            }}
          >
            <div style={{ fontSize: "3.5rem", marginBottom: "16px" }}>📁</div>
            <p style={{ fontSize: "1.2rem", color: "#94a3b8" }}>
              Clique ou arraste seu arquivo <strong>.SRT</strong> aqui
            </p>
            {fileName && (
              <p style={{
                marginTop: "16px",
                color: "#00d4ff",
                fontWeight: "600",
                fontSize: "1.1rem",
              }}>
                ✓ {fileName}
              </p>
            )}
            <input
              id="file-input"
              type="file"
              accept=".srt"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{
              display: "block",
              marginBottom: "10px",
              color: "#94a3b8",
              fontSize: "0.9rem",
            }}>
              Ou cole o conteúdo do SRT:
            </label>
            <textarea
              value={srtContent}
              onChange={(e) => setSrtContent(e.target.value)}
              placeholder={`1\n00:00:00,000 --> 00:00:05,000\nSeu texto aqui...\n\n2\n00:00:05,000 --> 00:00:10,000\nPróximo segmento...`}
              style={{
                width: "100%",
                height: "180px",
                padding: "16px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.3)",
                color: "#e8e8e8",
                fontSize: "0.9rem",
                fontFamily: "'JetBrains Mono', monospace",
                resize: "vertical",
                lineHeight: "1.6",
              }}
            />
          </div>

          <button
            onClick={processFile}
            disabled={!srtContent.trim() || isProcessing}
            style={{
              width: "100%",
              padding: "18px",
              borderRadius: "14px",
              border: "none",
              cursor: srtContent.trim() && !isProcessing ? "pointer" : "not-allowed",
              fontSize: "1.15rem",
              fontWeight: "700",
              background: srtContent.trim() && !isProcessing
                ? "linear-gradient(135deg, #7c3aed 0%, #00d4ff 100%)"
                : "rgba(255,255,255,0.08)",
              color: srtContent.trim() && !isProcessing ? "#fff" : "#475569",
              transition: "all 0.3s ease",
              boxShadow: srtContent.trim() && !isProcessing 
                ? "0 8px 32px rgba(124, 58, 237, 0.3)" 
                : "none",
            }}
          >
            {isProcessing ? "⏳ Processando..." : "🚀 Gerar Prompts & Cronograma"}
          </button>

          {parsedSegments.length > 0 && (
            <div style={{
              marginTop: "20px",
              padding: "16px 20px",
              background: "rgba(0, 212, 255, 0.08)",
              borderRadius: "12px",
              border: "1px solid rgba(0, 212, 255, 0.2)",
            }}>
              <p style={{ color: "#00d4ff", fontWeight: "600" }}>
                ✓ {parsedSegments.length} segmentos identificados
              </p>
            </div>
          )}
        </div>
      )}

      {/* Results Tab - Prompts & Timeline Together */}
      {activeTab === "results" && (
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          {generatedOutput.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "80px 40px",
              color: "#475569",
              background: "rgba(255,255,255,0.02)",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{ fontSize: "4rem", marginBottom: "20px", opacity: 0.5 }}>🎬</div>
              <p style={{ fontSize: "1.1rem" }}>Nenhum resultado ainda. Faça upload de um arquivo SRT primeiro.</p>
            </div>
          ) : (
            <>
              {/* Action Bar */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
                padding: "16px 20px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <h2 style={{ color: "#fff", fontSize: "1.3rem", fontWeight: "600" }}>
                  🎬 {generatedOutput.length} Imagens Geradas
                </h2>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => copyToClipboard(generatedOutput.map((p) => p.prompt).join("\n\n---\n\n"))}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "10px",
                      border: "1px solid rgba(0, 212, 255, 0.4)",
                      background: "transparent",
                      color: "#00d4ff",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: "500",
                    }}
                  >
                    📋 Copiar Prompts
                  </button>
                  <button
                    onClick={downloadTimeline}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "10px",
                      border: "none",
                      background: "linear-gradient(135deg, #7c3aed, #00d4ff)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: "600",
                    }}
                  >
                    💾 Baixar Cronograma
                  </button>
                </div>
              </div>

              {/* Each Image Card with Prompt + Timeline */}
              {generatedOutput.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "20px",
                    marginBottom: "28px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    overflow: "hidden",
                  }}
                >
                  {/* Card Header */}
                  <div style={{
                    padding: "20px 24px",
                    background: "linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(0, 212, 255, 0.1) 100%)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <div>
                      <h3 style={{
                        color: "#fff",
                        fontSize: "1.4rem",
                        marginBottom: "6px",
                        fontWeight: "700",
                      }}>
                        🖼️ Imagem {item.imageIndex}
                      </h3>
                      <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                        {item.timeRange} • <strong>{item.duration.toFixed(1)}s</strong> • {item.segmentCount} elementos
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(item.prompt)}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "10px",
                        border: "none",
                        background: "linear-gradient(135deg, #7c3aed, #00d4ff)",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        fontWeight: "600",
                      }}
                    >
                      📋 Copiar Prompt
                    </button>
                  </div>

                  {/* Two Column Layout */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0",
                  }}>
                    {/* Left: Prompt */}
                    <div style={{
                      padding: "20px",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <h4 style={{
                        color: "#7c3aed",
                        fontSize: "0.85rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: "12px",
                        fontWeight: "600",
                      }}>
                        📝 Prompt para Nano Banana Pro
                      </h4>
                      <pre style={{
                        background: "rgba(0,0,0,0.4)",
                        padding: "16px",
                        borderRadius: "12px",
                        overflow: "auto",
                        fontSize: "0.8rem",
                        lineHeight: "1.55",
                        color: "#cbd5e1",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: "450px",
                        margin: 0,
                      }}>
                        {item.prompt}
                      </pre>
                    </div>

                    {/* Right: Timeline */}
                    <div style={{ padding: "20px" }}>
                      <h4 style={{
                        color: "#00d4ff",
                        fontSize: "0.85rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: "12px",
                        fontWeight: "600",
                      }}>
                        ⏱️ Cronograma de Animação
                      </h4>
                      <div style={{
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "12px",
                        padding: "12px",
                        maxHeight: "450px",
                        overflow: "auto",
                      }}>
                        {item.timeline.map((el, elIdx) => (
                          <div
                            key={elIdx}
                            style={{
                              padding: "14px",
                              marginBottom: elIdx < item.timeline.length - 1 ? "10px" : 0,
                              background: "rgba(255,255,255,0.03)",
                              borderRadius: "10px",
                              borderLeft: "3px solid #7c3aed",
                            }}
                          >
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "8px",
                            }}>
                              <span style={{
                                background: "linear-gradient(135deg, #7c3aed, #00d4ff)",
                                color: "#fff",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: "700",
                              }}>
                                {el.icon} Elemento {el.elementNumber}
                              </span>
                              <span style={{
                                color: "#64748b",
                                fontSize: "0.8rem",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}>
                                {el.startTime} → {el.endTime}
                              </span>
                            </div>
                            <p style={{
                              color: "#e2e8f0",
                              fontSize: "0.85rem",
                              marginBottom: "8px",
                              lineHeight: "1.5",
                            }}>
                              "{el.narrationText}"
                            </p>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}>
                              <span style={{
                                color: "#00d4ff",
                                fontSize: "0.8rem",
                                fontWeight: "500",
                              }}>
                                →
                              </span>
                              <span style={{
                                color: "#94a3b8",
                                fontSize: "0.8rem",
                                fontStyle: "italic",
                              }}>
                                {el.visualElement}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Info Footer */}
      <footer style={{
        maxWidth: "900px",
        margin: "48px auto 0",
        padding: "28px",
        background: "rgba(124, 58, 237, 0.06)",
        borderRadius: "18px",
        border: "1px solid rgba(124, 58, 237, 0.15)",
      }}>
        <h3 style={{
          color: "#fff",
          marginBottom: "16px",
          fontSize: "1.1rem",
          fontWeight: "600",
        }}>
          💡 Como usar
        </h3>
        <div style={{
          color: "#94a3b8",
          lineHeight: "1.9",
          fontSize: "0.95rem",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}>
          <div>
            <p><strong style={{ color: "#00d4ff" }}>1.</strong> Faça upload do arquivo .SRT</p>
            <p><strong style={{ color: "#00d4ff" }}>2.</strong> O sistema agrupa em blocos de 20-60s</p>
          </div>
          <div>
            <p><strong style={{ color: "#00d4ff" }}>3.</strong> Use os prompts no Nano Banana Pro</p>
            <p><strong style={{ color: "#00d4ff" }}>4.</strong> Siga o cronograma para animar</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default WhiteboardPromptGenerator;
