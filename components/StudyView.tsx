import React, { useState, useEffect, useRef, useMemo } from 'react';
import Markdown from 'react-markdown';
import { ConstitutionTopic } from '../types';
import { generateStudyOutline, generateInteractiveDiagram, InteractiveDiagram } from '../services/geminiService';
import { BackIcon, LoadingSpinner, BookIcon } from './Icons';

interface StudyViewProps {
  topic: ConstitutionTopic;
  onBack: () => void;
}

declare global {
  interface Window {
    mermaid: any;
    callNodeClick: (nodeId: string) => void;
  }
}

// Helper: Convert text to ID-friendly slug
const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') 
    .replace(/[\u0300-\u036f]/g, '') 
    .replace(/\s+/g, '-') 
    .replace(/[^\w\-]+/g, '') 
    .replace(/\-\-+/g, '-') 
    .replace(/^-+/, '') 
    .replace(/-+$/, ''); 
};

// Helper: Extract label text from Mermaid node definition
const getNodeLabelFromChart = (nodeId: string, mermaidCode: string): string | null => {
  if (!nodeId || !mermaidCode) return null;
  const regex = new RegExp(`\\b${nodeId}\\s*[\\[\\(\\{]+["']?([^"'\\]\\)\\}]+)["']?[\\]\\)\\}]+`);
  const match = mermaidCode.match(regex);
  return match ? match[1] : null;
};

// Helper: Clean Mermaid code from common syntax errors
const cleanMermaidCode = (code: string) => {
  if (!code) return '';
  
  // Normalize newlines (handle escaped newlines from JSON)
  let clean = code.replace(/\\n/g, '\n');
  
  // Remove markdown blocks if present
  clean = clean.replace(/```(?:mermaid|json)?/g, '').replace(/```/g, '').trim();
  
  // FIX CRITICAL: Separate fused lines (e.g. "5 5graph" -> "5 5\ngraph")
  clean = clean.replace(/([0-9a-z;])\s*(graph\s+[A-Z]{2}|flowchart\s+[A-Z]{2})/gi, '$1\n$2');
  
  // FIX CRITICAL: Separate fused lines (e.g. ":::mainclassDef" -> ":::main\nclassDef")
  clean = clean.replace(/([^\n])\s*(classDef)/gi, '$1\n$2');

  // FIX CRITICAL: Separate graph declaration from first node (e.g. "graph LRN1" -> "graph LR\nN1")
  clean = clean.replace(/(graph\s+[A-Z]{2})([^\s\n])/gi, '$1\n$2');

  // Ensure it starts with graph if missing completely
  if (!clean.match(/^\s*(graph|flowchart)\s+[A-Z]{2}/)) {
    // If not found, assume graph LR and prepend
    clean = 'graph LR\n' + clean;
  } else {
    // If found, ensure nothing comes before it (strips preamble garbage)
    const graphMatch = clean.match(/^\s*(graph|flowchart)\s+[A-Z]{2}/m);
    if (graphMatch && graphMatch.index !== undefined) {
      clean = clean.substring(graphMatch.index);
    }
  }

  // AGGRESSIVE CLEANING: Fix broken brackets or quotes inside labels
  clean = clean.replace(/\["([^"]*)"\]/g, (match, content) => {
    // Remove problematic characters: parens, braces, quotes, semicolons inside the label
    const safeContent = content.replace(/[\(\)\[\]\{\}"';]/g, ' ').trim();
    return `["${safeContent}"]`;
  });
  
  // Remove empty lines
  clean = clean.split('\n').filter(line => line.trim().length > 0).join('\n');

  return clean;
};

// Helper to parse Mermaid graph syntax for relationships
const parseGraphRelationships = (mermaidCode: string) => {
  const parents: Record<string, string[]> = {};
  const children: Record<string, string[]> = {};
  
  const regex = /([A-Za-z0-9_]+)\s*[-=.]*>\s*([A-Za-z0-9_]+)/g;
  let match;
  
  while ((match = regex.exec(mermaidCode)) !== null) {
    const parent = match[1];
    const child = match[2];
    
    if (!children[parent]) children[parent] = [];
    if (!children[parent].includes(child)) children[parent].push(child);
    
    if (!parents[child]) parents[child] = [];
    if (!parents[child].includes(parent)) parents[child].push(parent);
  }
  
  return { parents, children };
};

const downloadSvgAsPng = (filename: string) => {
  const svgElement = document.querySelector('.mermaid svg') as SVGSVGElement;
  if (!svgElement) return;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const svgRect = svgElement.getBoundingClientRect();
  
  const scale = 2; 
  canvas.width = svgRect.width * scale;
  canvas.height = svgRect.height * scale;

  if (!ctx) return;

  const img = new Image();
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const pngUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = `${filename}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    URL.revokeObjectURL(url);
  };

  img.src = url;
};

const MermaidChart = ({ chart, onNodeClick, highlightedNodeId }: { chart: string, onNodeClick: (id: string) => void, highlightedNodeId: string | null }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [renderError, setRenderError] = useState(false);

  const cleanChart = useMemo(() => cleanMermaidCode(chart), [chart]);
  const relationships = useMemo(() => parseGraphRelationships(cleanChart), [cleanChart]);

  useEffect(() => {
    window.callNodeClick = (nodeId: string) => {
      onNodeClick(nodeId);
    };
  }, [onNodeClick]);

  useEffect(() => {
    if (ref.current && window.mermaid && cleanChart) {
      setRenderError(false);
      try {
        ref.current.innerHTML = '';
        ref.current.removeAttribute('data-processed');
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        window.mermaid.render(id, cleanChart).then((result: any) => {
           if (ref.current) {
             ref.current.innerHTML = result.svg;
             const svg = ref.current.querySelector('svg');
             if(svg) {
               svg.style.width = "100%";
               svg.style.height = "100%";
               svg.style.maxWidth = "none";
               
               // Manual Click Handler Attachment
               const nodes = svg.querySelectorAll('.node');
               nodes.forEach((node: Element) => {
                 const htmlNode = node as HTMLElement;
                 htmlNode.style.cursor = 'pointer';
                 
                 htmlNode.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const elementId = htmlNode.id;
                    // Format is usually flowchart-{ID}-{Random}
                    const parts = elementId.split('-');
                    let mermaidId = elementId;
                    
                    if (parts.length >= 2 && (parts[0] === 'flowchart' || parts[0] === 'graph')) {
                        mermaidId = parts[1];
                    }
                    
                    onNodeClick(mermaidId);
                 });
               });
             }
           }
        }).catch((e: any) => {
           console.error("Mermaid Render Failed:", e);
           setRenderError(true);
        });
      } catch (e) {
        console.error("Mermaid Init Error:", e);
        setRenderError(true);
      }
    }
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [cleanChart, onNodeClick]);

  // Highlighting & Animation Logic
  useEffect(() => {
    if (!ref.current) return;
    const svg = ref.current.querySelector('svg');
    if (!svg) return;

    const allNodes = svg.querySelectorAll('.node');
    const allEdges = svg.querySelectorAll('.edgePaths path, .edgeLabels');
    
    allNodes.forEach(node => {
      (node as HTMLElement).style.opacity = '1';
      (node as HTMLElement).style.filter = 'none';
      const shape = node.querySelector('rect, circle, polygon, path') as HTMLElement;
      if (shape) {
        shape.style.stroke = '';
        shape.style.strokeWidth = '';
        shape.style.animation = 'none';
      }
    });
    allEdges.forEach(edge => (edge as HTMLElement).style.opacity = '1');

    if (!highlightedNodeId) return;

    const relatives = new Set<string>();
    if (relationships.children[highlightedNodeId]) {
      relationships.children[highlightedNodeId].forEach(id => relatives.add(id));
    }
    if (relationships.parents[highlightedNodeId]) {
      relationships.parents[highlightedNodeId].forEach(id => relatives.add(id));
    }

    allNodes.forEach(node => {
      const element = node as HTMLElement;
      const idAttr = element.id; 
      
      const isTarget = idAttr.includes(`-${highlightedNodeId}-`) || idAttr === highlightedNodeId || idAttr.endsWith(`-${highlightedNodeId}`);
      let isRelative = false;
      if (!isTarget) {
        for (const relId of relatives) {
          if (idAttr.includes(`-${relId}-`) || idAttr === relId || idAttr.endsWith(`-${relId}`)) {
            isRelative = true;
            break;
          }
        }
      }

      const shape = element.querySelector('rect, circle, polygon, path') as HTMLElement;

      if (isTarget) {
        element.style.opacity = '1';
        if (shape) {
          shape.style.stroke = '#F1BF00'; 
          shape.style.strokeWidth = '4px';
          shape.style.animation = 'mermaid-pulse-gold 2.5s infinite ease-in-out';
        }
      } else if (isRelative) {
        element.style.opacity = '1';
        if (shape) {
          shape.style.stroke = '#AA151B';
          shape.style.strokeWidth = '3px';
          shape.style.animation = 'mermaid-pulse-red 2.5s infinite ease-in-out';
        }
      } else {
        element.style.opacity = '0.2';
      }
    });
    
    allEdges.forEach(edge => (edge as HTMLElement).style.opacity = '0.1');

  }, [highlightedNodeId, cleanChart, relationships]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAdjustment = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.5, scale + scaleAdjustment), 4);
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (renderError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 border border-red-900/50 rounded-lg text-slate-400 p-6 text-center">
        <p className="mb-2 font-bold text-red-400">Error de visualización</p>
        <p className="text-xs text-slate-500 mb-4">Prueba a regenerar el plan para corregir la sintaxis.</p>
        <pre className="text-[10px] text-left bg-black p-2 rounded mb-4 overflow-auto max-w-sm max-h-32 text-red-300 border border-red-900/30 whitespace-pre-wrap font-mono">
          {cleanChart}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden border border-slate-700 rounded-lg">
      <style>{`
        @keyframes mermaid-pulse-gold {
          0%, 100% { stroke-width: 4px; filter: drop-shadow(0 0 3px rgba(241, 191, 0, 0.4)); }
          50% { stroke-width: 6px; filter: drop-shadow(0 0 10px rgba(241, 191, 0, 0.8)); }
        }
        @keyframes mermaid-pulse-red {
          0%, 100% { stroke-width: 3px; filter: drop-shadow(0 0 2px rgba(170, 21, 27, 0.3)); }
          50% { stroke-width: 5px; filter: drop-shadow(0 0 6px rgba(170, 21, 27, 0.6)); }
        }
      `}</style>
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button onClick={() => setScale(s => Math.min(s + 0.2, 4))} className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 shadow border border-slate-600 font-mono font-bold text-lg">+</button>
        <button onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 shadow border border-slate-600 font-mono font-bold text-lg">-</button>
        <button onClick={() => { setScale(1); setPosition({x:0, y:0}); }} className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 shadow border border-slate-600 text-lg">⟲</button>
      </div>
      <div 
        className="w-full h-full cursor-move flex items-center justify-center bg-[#0f172a]"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          ref={ref}
          className="mermaid origin-center transition-transform duration-75 ease-out select-none"
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
};

export const StudyView: React.FC<StudyViewProps> = ({ topic, onBack }) => {
  const [content, setContent] = useState<string | null>(null);
  const [diagramData, setDiagramData] = useState<InteractiveDiagram | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'schema'>('summary');
  const [isSavedMaterial, setIsSavedMaterial] = useState(false);
  
  const textPanelRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load persistence
  useEffect(() => {
    // Reset state first to avoid showing previous topic data
    setContent(null);
    setDiagramData(null);
    setIsSavedMaterial(false);

    const cachedText = localStorage.getItem(`study_text_${topic.id}`);
    const cachedDiagram = localStorage.getItem(`study_diagram_obj_${topic.id}`);
    
    if (cachedText) {
      setContent(cachedText);
      setIsSavedMaterial(true);
      // Restore scroll
      setTimeout(() => {
        if (textPanelRef.current) {
          const savedScroll = localStorage.getItem(`study_scroll_${topic.id}`);
          if (savedScroll) {
            textPanelRef.current.scrollTop = parseInt(savedScroll, 10);
          }
        }
      }, 100);
    }

    if (cachedDiagram) {
      try {
        setDiagramData(JSON.parse(cachedDiagram));
      } catch (e) {
        console.error("Error parsing cached diagram", e);
      }
    }
  }, [topic.id]);

  // Effect to handle scroll after tab switch
  useEffect(() => {
    if (activeTab === 'summary' && pendingScrollId && content) {
      setTimeout(() => {
        const element = document.getElementById(pendingScrollId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.classList.add('bg-spanishYellow/20', 'rounded', 'px-2');
          setTimeout(() => element.classList.remove('bg-spanishYellow/20', 'rounded', 'px-2'), 2000);
        }
        setPendingScrollId(null);
      }, 300);
    }
  }, [activeTab, pendingScrollId, content]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!pendingScrollId) {
      localStorage.setItem(`study_scroll_${topic.id}`, e.currentTarget.scrollTop.toString());
    }
  };

  const handleGenerate = async () => {
    if (isSavedMaterial && !window.confirm("Ya tienes un Plan de Estudio guardado. ¿Quieres generar uno nuevo desde cero?")) {
      return;
    }

    setLoading(true);
    // Clear previous data before generating new
    setContent(null);
    setDiagramData(null);
    
    const [textResult, diagramResult] = await Promise.all([
      generateStudyOutline(topic.title),
      generateInteractiveDiagram(topic.title)
    ]);
    
    setContent(textResult);
    setDiagramData(diagramResult);
    setIsSavedMaterial(true);
    
    // Explicit Save to Local Storage immediately
    localStorage.setItem(`study_text_${topic.id}`, textResult);
    if (diagramResult) {
      localStorage.setItem(`study_diagram_obj_${topic.id}`, JSON.stringify(diagramResult));
    }
    
    setLoading(false);
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 3000);
  };

  const handleDownloadHtml = () => {
    if (!content) return;
    let diagramHtml = '';
    if (diagramData) {
      diagramHtml = `<div class="mermaid">${cleanMermaidCode(diagramData.mermaidCode)}</div>`;
    }
    const htmlContent = `
      <!DOCTYPE html><html><head><title>${topic.title}</title>
      <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script></head>
      <body><h1>${topic.title}</h1><div>${content.replace(/\n/g, '<br/>')}</div><hr/>${diagramHtml}
      <script>mermaid.initialize({ startOnLoad: true });</script></body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${topic.title.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const jumpToTextContext = () => {
    if (!selectedNodeId || !diagramData) return;
    const label = getNodeLabelFromChart(selectedNodeId, diagramData.mermaidCode);
    if (label) {
      setPendingScrollId(slugify(label));
      setActiveTab('summary');
    }
  };

  const handleCopyMermaidCode = () => {
    if (diagramData?.mermaidCode) {
      navigator.clipboard.writeText(cleanMermaidCode(diagramData.mermaidCode))
        .then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        })
        .catch(err => console.error("Error copying code:", err));
    }
  };

  const selectedNodeDescription = selectedNodeId && diagramData?.nodeDetails ? diagramData.nodeDetails[selectedNodeId] : null;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden">
      <div className="flex-none p-4 bg-slate-900 border-b border-slate-700 shadow-md z-10 relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-spanishRed via-spanishYellow to-spanishRed"></div>
        <div className="flex justify-between items-center mb-4 pt-2">
          <button onClick={onBack} className="flex items-center gap-2 text-spanishYellow hover:text-white transition-colors">
            <BackIcon /> <span>Temario</span>
          </button>
          <div className="flex items-center gap-3">
            {isSavedMaterial && (
              <span className="text-emerald-400 text-xs md:text-sm font-medium border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded flex items-center gap-1">
                💾 Plan Guardado
              </span>
            )}
            {showSaveConfirm && (
              <span className="text-spanishYellow text-sm font-medium animate-pulse flex items-center gap-1">
                ✓ Guardado
              </span>
            )}
            {content && (
              <button onClick={handleGenerate} className="text-spanishRed hover:text-white hover:bg-spanishRed/20 border border-spanishRed/30 px-3 py-1.5 rounded-sm text-xs font-medium transition-all">
                Regenerar
              </button>
            )}
          </div>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-white truncate border-l-4 border-spanishRed pl-3">{topic.title}</h1>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {!content && !loading && (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-spanishRed via-spanishYellow to-spanishRed"></div>
              <h3 className="text-2xl font-bold mb-3 text-white">Estudio Guiado con IA</h3>
              <p className="text-slate-400 mb-8">Genera un resumen detallado y un esquema visual con IA.</p>
              <button onClick={handleGenerate} className="w-full bg-spanishRed hover:bg-red-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-all border border-red-900">
                Generar Plan de Estudio
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <LoadingSpinner />
            <p className="mt-4 text-spanishYellow animate-pulse">Analizando legislación y generando esquemas...</p>
          </div>
        )}

        {content && !loading && (
          <>
            <div className="flex border-b border-slate-700 bg-slate-900">
              <button onClick={() => setActiveTab('summary')} className={`flex-1 py-3 text-center font-medium transition-colors border-b-4 ${activeTab === 'summary' ? 'border-spanishRed text-white bg-slate-800' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                📄 Guía de Estudio
              </button>
              <button onClick={() => setActiveTab('schema')} className={`flex-1 py-3 text-center font-medium transition-colors border-b-4 ${activeTab === 'schema' ? 'border-spanishYellow text-white bg-slate-800' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                🕸️ Mapa Mental
              </button>
            </div>

            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'summary' && (
                <div ref={textPanelRef} onScroll={handleScroll} className="h-full overflow-y-auto p-6 md:p-8 scrollbar-thin scrollbar-thumb-slate-700">
                  <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed">
                    <Markdown
                      components={{
                        h1: ({node, ...props}) => <h1 id={slugify(String(props.children))} className="text-3xl font-bold text-white mt-8 mb-4 border-b-2 border-spanishRed pb-2 inline-block bg-gradient-to-r from-spanishRed/20 to-transparent pr-8 pl-2 rounded-sm scroll-mt-24" {...props} />,
                        h2: ({node, ...props}) => <h2 id={slugify(String(props.children))} className="text-xl font-bold text-spanishYellow mt-6 mb-3 flex items-center scroll-mt-24" {...props} />,
                        h3: ({node, ...props}) => <h3 id={slugify(String(props.children))} className="text-lg font-semibold text-white mt-4 mb-2 pl-4 border-l-2 border-spanishYellow scroll-mt-24" {...props} />,
                        strong: ({node, ...props}) => <strong className="text-spanishYellow font-semibold" {...props} />,
                        li: ({node, ...props}) => <li className="marker:text-spanishRed" {...props} />
                      }}
                    >
                      {content}
                    </Markdown>
                  </div>
                  <div className="mt-12 pt-6 border-t border-slate-700 text-center">
                     <button onClick={handleDownloadHtml} className="text-slate-400 hover:text-white text-xs underline">Descargar Guía Offline</button>
                  </div>
                </div>
              )}

              {activeTab === 'schema' && (
                <div className="h-full flex flex-col relative bg-slate-900">
                  {diagramData?.mermaidCode ? (
                    <>
                      <MermaidChart chart={diagramData.mermaidCode} onNodeClick={handleNodeClick} highlightedNodeId={selectedNodeId} />
                      
                      <div className="absolute bottom-6 left-6 z-20 flex gap-2">
                        <button 
                          onClick={() => downloadSvgAsPng(topic.title)}
                          className="bg-slate-800 border border-spanishYellow/30 text-spanishYellow hover:bg-spanishYellow hover:text-slate-900 px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                        >
                          <span className="text-lg">⬇</span> Descargar Mapa
                        </button>
                        <button
                          onClick={handleCopyMermaidCode}
                          className="bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                        >
                          <span>📋</span> {copySuccess ? '¡Copiado!' : 'Copiar Código'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <p>No se pudo generar el gráfico.</p>
                    </div>
                  )}

                  {selectedNodeDescription && (
                    <div className="absolute top-4 right-4 w-72 md:w-80 max-h-[80%] overflow-y-auto bg-slate-900/95 border border-spanishYellow/50 shadow-2xl rounded-xl p-4 z-20 backdrop-blur-sm scrollbar-thin scrollbar-thumb-slate-600">
                      <div className="flex justify-between items-start mb-3 border-b border-slate-700 pb-2">
                        <h4 className="font-bold text-spanishYellow">Paso Clave</h4>
                        <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-white">✕</button>
                      </div>
                      <div className="text-sm text-slate-200 leading-relaxed mb-4 prose prose-invert prose-sm">
                        <Markdown>{selectedNodeDescription}</Markdown>
                      </div>
                      <button onClick={jumpToTextContext} className="w-full flex items-center justify-center gap-2 bg-spanishRed hover:bg-red-700 text-white text-xs font-bold py-2 px-3 rounded transition-colors shadow-md border border-red-800">
                        <BookIcon className="w-4 h-4" /> Ver en la Guía
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};