import React, { useState, useEffect } from 'react';
import { AppView, ConstitutionTopic, TopicProgress } from './types';
import { TOPICS } from './constants';
import { StudyView } from './components/StudyView';
import { QuizView } from './components/QuizView';
import { ChatAssistant } from './components/ChatAssistant';
import { BookIcon, ChatIcon, QuizIcon, HomeIcon } from './components/Icons';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [selectedTopic, setSelectedTopic] = useState<ConstitutionTopic | null>(null);
  
  // Inicialización perezosa: lee de localStorage inmediatamente al iniciar la app
  const [guidedMode, setGuidedMode] = useState(() => {
    const saved = localStorage.getItem('guided_mode');
    return saved === 'true';
  });
  
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});

  useEffect(() => {
    // Load progress from localStorage
    const savedProgress = localStorage.getItem('topic_progress');
    if (savedProgress) {
      setProgress(JSON.parse(savedProgress));
    }
  }, [currentView]); // Reload progress when view changes

  const toggleGuidedMode = () => {
    const newVal = !guidedMode;
    setGuidedMode(newVal);
    localStorage.setItem('guided_mode', newVal.toString());
  };

  const handleStartStudy = (topic: ConstitutionTopic) => {
    setSelectedTopic(topic);
    setCurrentView(AppView.STUDY);
  };

  const handleStartQuiz = (topic: ConstitutionTopic) => {
    setSelectedTopic(topic);
    setCurrentView(AppView.QUIZ);
  };

  const isTopicLocked = (index: number) => {
    if (!guidedMode) return false;
    if (index === 0) return false; // First topic always unlocked
    
    // Check if previous topic is passed
    const prevTopic = TOPICS[index - 1];
    const prevProgress = progress[prevTopic.id];
    return !prevProgress?.isPassed;
  };

  const renderContent = () => {
    switch (currentView) {
      case AppView.STUDY:
        if (!selectedTopic) return null;
        return <StudyView topic={selectedTopic} onBack={() => setCurrentView(AppView.TOPIC_LIST)} />;
      case AppView.QUIZ:
        if (!selectedTopic) return null;
        return <QuizView topic={selectedTopic} onBack={() => setCurrentView(AppView.TOPIC_LIST)} />;
      case AppView.CHAT:
        return <ChatAssistant />;
      case AppView.TOPIC_LIST:
        return (
          <div className="p-4 md:p-8 max-w-7xl mx-auto overflow-y-auto h-full">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 relative inline-block">
                  Temario Oficial
                  <span className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-spanishRed via-spanishYellow to-spanishRed rounded-full"></span>
                </h1>
                <p className="text-slate-400 mt-2">Selecciona un título para estudiar o realizar un test.</p>
              </div>
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                <div className="flex items-center gap-3 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                  <span className={`text-sm font-medium ${guidedMode ? 'text-spanishYellow' : 'text-slate-400'}`}>
                    Modo Guiado {guidedMode ? 'ON' : 'OFF'}
                  </span>
                  <button 
                    onClick={toggleGuidedMode}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${guidedMode ? 'bg-spanishRed' : 'bg-slate-600'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${guidedMode ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>
                <button 
                  onClick={() => setCurrentView(AppView.HOME)}
                  className="self-start md:self-auto flex items-center gap-2 text-spanishYellow hover:text-white transition-colors border border-spanishYellow/30 hover:border-spanishYellow px-4 py-2 rounded-lg"
                >
                  <HomeIcon className="w-5 h-5" /> Volver al Inicio
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
              {TOPICS.map((topic, index) => {
                const locked = isTopicLocked(index);
                const topicProgress = progress[topic.id];
                const isPassed = topicProgress?.isPassed;

                return (
                  <div key={topic.id} className={`bg-slate-800 rounded-xl border transition-all shadow-lg overflow-hidden flex flex-col group relative ${locked ? 'border-slate-700 opacity-60 grayscale' : 'border-slate-700 hover:border-spanishRed hover:shadow-[0_0_15px_rgba(170,21,27,0.3)]'}`}>
                    {/* Decorative flag stripe on hover */}
                    {!locked && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-spanishRed via-spanishYellow to-spanishRed opacity-0 group-hover:opacity-100 transition-opacity"></div>}
                    
                    <div className="p-6 flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-xs font-bold bg-slate-900 text-spanishYellow border border-spanishYellow/20 px-2 py-1 rounded uppercase tracking-wide">
                          {topic.articles}
                        </span>
                        {locked ? (
                          <span className="text-slate-500">🔒 Bloqueado</span>
                        ) : isPassed ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-bold text-sm">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Aprobado
                          </span>
                        ) : null}
                      </div>
                      <h3 className={`text-xl font-bold text-slate-100 mb-2 transition-colors ${!locked && 'group-hover:text-spanishRed'}`}>{topic.title}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">{topic.description}</p>
                    </div>
                    
                    <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex gap-2">
                      <button 
                        onClick={() => !locked && handleStartStudy(topic)}
                        disabled={locked}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors ${locked ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-spanishRed hover:bg-red-700 text-white shadow-lg shadow-red-900/20'}`}
                      >
                        <BookIcon /> Estudiar
                      </button>
                      <button 
                        onClick={() => !locked && handleStartQuiz(topic)}
                        disabled={locked}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors ${locked ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-white hover:text-spanishYellow'}`}
                      >
                        <QuizIcon /> Test
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case AppView.HOME:
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-950 overflow-y-auto">
            <div className="max-w-4xl w-full py-12 relative">
              {/* Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-spanishRed/5 rounded-full blur-3xl -z-10"></div>

              <div className="inline-block p-1 rounded-full bg-gradient-to-br from-spanishRed via-spanishYellow to-spanishRed mb-8 shadow-2xl">
                 <div className="bg-slate-900 p-4 rounded-full">
                    <span className="text-5xl">🇪🇸</span>
                 </div>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-spanishRed via-spanishYellow to-spanishRed mb-6 tracking-tight drop-shadow-sm">
                Constitución Española AI
              </h1>
              <p className="text-xl text-slate-300 mb-16 max-w-2xl mx-auto leading-relaxed border-t border-b border-slate-800 py-6">
                Tu plataforma inteligente para dominar la Carta Magna. <br/>
                <span className="text-spanishYellow">Estudia</span>, <span className="text-spanishYellow">Visualiza</span> y <span className="text-spanishYellow">Aprueba</span>.
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                <button 
                  onClick={() => setCurrentView(AppView.TOPIC_LIST)}
                  className="group relative p-8 bg-slate-900 border border-slate-700 hover:border-spanishRed rounded-3xl transition-all hover:shadow-[0_0_30px_rgba(170,21,27,0.2)] text-left overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-spanishRed/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <BookIcon className="w-32 h-32 text-spanishRed" />
                  </div>
                  <div className="relative z-10">
                    <div className="w-14 h-14 bg-spanishRed/20 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-spanishRed transition-colors ring-1 ring-spanishRed/30">
                      <BookIcon className="w-7 h-7 text-spanishRed group-hover:text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Estudio Guiado con IA</h2>
                    <p className="text-slate-400 group-hover:text-slate-200 leading-relaxed">
                      Tu preparadora virtual te guiará paso a paso por los temas subidos. Genera esquemas y planes personalizados.
                    </p>
                  </div>
                </button>

                <button 
                  onClick={() => setCurrentView(AppView.CHAT)}
                  className="group relative p-8 bg-slate-900 border border-slate-700 hover:border-spanishYellow rounded-3xl transition-all hover:shadow-[0_0_30px_rgba(241,191,0,0.15)] text-left overflow-hidden"
                >
                   <div className="absolute inset-0 bg-gradient-to-br from-spanishYellow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ChatIcon className="w-32 h-32 text-spanishYellow" />
                  </div>
                  <div className="relative z-10">
                    <div className="w-14 h-14 bg-spanishYellow/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-spanishYellow transition-colors ring-1 ring-spanishYellow/30">
                      <ChatIcon className="w-7 h-7 text-spanishYellow group-hover:text-slate-900" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Asistente IA</h2>
                    <p className="text-slate-400 group-hover:text-slate-200 leading-relaxed">
                      Un tutor personal 24/7. Pregunta dudas legales y pide reglas mnemotécnicas.
                    </p>
                  </div>
                </button>
              </div>

              <div className="mt-16 text-slate-600 text-sm font-medium tracking-widest uppercase">
                Oposiciones • Derecho • Administración
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-spanishRed selection:text-white">
      {/* Sidebar Navigation */}
      <nav className="w-16 md:w-64 flex-none bg-slate-900 border-r-4 border-r-slate-800 flex flex-col items-center md:items-stretch py-6 z-20 relative shadow-2xl">
        {/* Spanish Flag Border on the right */}
        <div className="absolute right-[-4px] top-0 bottom-0 w-1 bg-gradient-to-b from-spanishRed via-spanishYellow to-spanishRed"></div>

        <div className="mb-10 px-4 flex justify-center md:justify-start cursor-pointer group" onClick={() => setCurrentView(AppView.HOME)}>
           <div className="w-10 h-10 bg-gradient-to-br from-spanishRed to-red-800 rounded-lg shadow-lg flex items-center justify-center font-bold text-white text-xl border border-spanishYellow/50 group-hover:scale-110 transition-transform">
             <span className="text-spanishYellow">CE</span>
           </div>
           <span className="hidden md:block ml-3 font-bold text-lg mt-1 tracking-tight group-hover:text-spanishYellow transition-colors">AI Tutor</span>
        </div>

        <div className="flex-1 w-full space-y-3 px-3">
           <button 
            onClick={() => setCurrentView(AppView.HOME)}
            className={`w-full flex items-center gap-4 p-3 rounded-lg transition-all border ${currentView === AppView.HOME ? 'bg-spanishRed text-white border-spanishRed shadow-lg shadow-red-900/40' : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'}`}
          >
            <div className="w-6"><HomeIcon /></div>
            <span className="hidden md:block font-medium">Inicio</span>
          </button>

          <button 
            onClick={() => setCurrentView(AppView.TOPIC_LIST)}
            className={`w-full flex items-center gap-4 p-3 rounded-lg transition-all border ${currentView === AppView.TOPIC_LIST || currentView === AppView.STUDY || currentView === AppView.QUIZ ? 'bg-spanishRed text-white border-spanishRed shadow-lg shadow-red-900/40' : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'}`}
          >
            <div className="w-6"><BookIcon /></div>
            <span className="hidden md:block font-medium">Temario</span>
          </button>
          
          <button 
            onClick={() => setCurrentView(AppView.CHAT)}
            className={`w-full flex items-center gap-4 p-3 rounded-lg transition-all border ${currentView === AppView.CHAT ? 'bg-spanishRed text-white border-spanishRed shadow-lg shadow-red-900/40' : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'}`}
          >
            <div className="w-6"><ChatIcon /></div>
            <span className="hidden md:block font-medium">Asistente</span>
          </button>
        </div>

        <div className="mt-auto px-4 text-[10px] text-slate-600 hidden md:block text-center">
          &copy; 2024 CE Tutor AI<br/>
          <span className="text-spanishRed">Made in Spain</span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden bg-slate-950 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
        {renderContent()}
      </main>
    </div>
  );
}