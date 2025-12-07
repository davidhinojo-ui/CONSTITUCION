import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, FailedQuestion } from '../types';
import { chatWithTutor } from '../services/geminiService';
import { LoadingSpinner } from './Icons';

export const ChatAssistant: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: '¡Hola! Soy tu asistente legal. Pregúntame cualquier duda sobre la Constitución Española o sobre cómo preparar tus oposiciones. También puedo ayudarte a repasar tus fallos en los test.',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const apiHistory = messages.map(m => ({role: m.role, text: m.text}));
    const responseText = await chatWithTutor(userMsg.text, apiHistory);

    const modelMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, modelMsg]);
    setLoading(false);
  };

  const handleReviewMistakes = () => {
    const storedMistakes = localStorage.getItem('failed_questions');
    if (!storedMistakes) {
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: 'No tienes fallos registrados todavía. Realiza algunos test primero para que pueda ayudarte a repasar.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, msg]);
      return;
    }

    const mistakes: FailedQuestion[] = JSON.parse(storedMistakes);
    if (mistakes.length === 0) {
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: '¡Enhorabuena! No tienes fallos pendientes de repasar.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, msg]);
      return;
    }

    // Get last 5 mistakes to prevent huge prompt
    const recentMistakes = mistakes.slice(-5);
    const mistakesText = recentMistakes.map((m, i) => 
      `${i+1}. Tema: ${m.topicTitle}\n   Pregunta: ${m.question}\n   Mi respuesta: ${m.userAnswer}\n   Correcta: ${m.correctAnswer}\n`
    ).join('\n');

    const prompt = `Hola tutor, he fallado estas preguntas en mis últimos test. Por favor, explícamelas de forma sencilla y dame alguna regla mnemotécnica para no volver a fallarlas:\n\n${mistakesText}`;
    
    handleSend(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="flex-none p-4 border-b border-slate-700 bg-slate-900 z-10 flex justify-between items-center relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-spanishRed via-spanishYellow to-spanishRed"></div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse border border-green-400"></span>
          Asistente Constitucional
        </h2>
        <button 
          onClick={handleReviewMistakes}
          disabled={loading}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-spanishYellow border border-spanishYellow/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <span className="text-lg">↺</span> Repasar Fallos
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-5 py-3 text-sm md:text-base leading-relaxed shadow-md ${
                msg.role === 'user' 
                  ? 'bg-spanishRed text-white rounded-br-sm' 
                  : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
              }`}
            >
              {msg.text.split('\n').map((line, i) => (
                 <p key={i} className="min-h-[1rem] mb-1">{line}</p>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
             <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-bl-sm border border-slate-700 flex items-center gap-2">
                <div className="w-2 h-2 bg-spanishYellow rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-spanishRed rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-spanishYellow rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
             </div>
          </div>
        )}
      </div>

      <div className="flex-none p-4 border-t border-slate-700 bg-slate-900">
        <div className="relative max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-800 text-white rounded-xl border border-slate-600 px-4 py-3 focus:outline-none focus:border-spanishYellow placeholder-slate-500"
            placeholder="Escribe tu duda aquí..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <button 
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="bg-spanishRed hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-xl font-medium transition-colors shadow-lg"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
};