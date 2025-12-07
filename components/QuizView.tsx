import React, { useState, useEffect } from 'react';
import { ConstitutionTopic, QuizMode, QuizQuestion, QuizState, FailedQuestion, TopicProgress } from '../types';
import { generateQuizQuestions } from '../services/geminiService';
import { BackIcon, LoadingSpinner } from './Icons';

interface QuizViewProps {
  topic: ConstitutionTopic;
  onBack: () => void;
}

export const QuizView: React.FC<QuizViewProps> = ({ topic, onBack }) => {
  const [setupMode, setSetupMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [quizState, setQuizState] = useState<QuizState>({
    questions: [],
    userAnswers: [],
    currentQuestionIndex: 0,
    isFinished: false,
    score: 0,
    mode: QuizMode.REVIEW
  });

  const startQuiz = async (mode: QuizMode) => {
    setSetupMode(false);
    setLoading(true);
    const questions = await generateQuizQuestions(topic.title, 5); // Default 5 questions
    setQuizState({
      questions,
      userAnswers: new Array(questions.length).fill(-1),
      currentQuestionIndex: 0,
      isFinished: false,
      score: 0,
      mode
    });
    setLoading(false);
  };

  const handleAnswer = (optionIndex: number) => {
    if (quizState.isFinished) return;
    // In review mode, block answering again if already answered
    if (quizState.mode === QuizMode.REVIEW && quizState.userAnswers[quizState.currentQuestionIndex] !== -1) return;

    const newAnswers = [...quizState.userAnswers];
    newAnswers[quizState.currentQuestionIndex] = optionIndex;

    setQuizState(prev => ({
      ...prev,
      userAnswers: newAnswers
    }));
  };

  const nextQuestion = () => {
    if (quizState.currentQuestionIndex < quizState.questions.length - 1) {
      setQuizState(prev => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex + 1
      }));
    } else {
      finishQuiz();
    }
  };

  const saveMistakes = (questions: QuizQuestion[], userAnswers: number[]) => {
    const mistakes: FailedQuestion[] = [];
    
    questions.forEach((q, idx) => {
      const userAnswerIdx = userAnswers[idx];
      if (userAnswerIdx !== -1 && userAnswerIdx !== q.correctAnswerIndex) {
        mistakes.push({
          topicTitle: topic.title,
          question: q.question,
          userAnswer: q.options[userAnswerIdx],
          correctAnswer: q.options[q.correctAnswerIndex],
          explanation: q.explanation,
          date: Date.now()
        });
      }
    });

    if (mistakes.length > 0) {
      const stored = localStorage.getItem('failed_questions');
      let allMistakes: FailedQuestion[] = stored ? JSON.parse(stored) : [];
      // Add new mistakes and keep only last 50 to avoid storage overflow
      allMistakes = [...allMistakes, ...mistakes].slice(-50);
      localStorage.setItem('failed_questions', JSON.stringify(allMistakes));
    }
  };

  const saveProgress = (score: number, total: number) => {
    const percentage = Math.round((score / total) * 100);
    const isPassed = percentage >= 50; // Pass mark is 50%

    const storedProgress = localStorage.getItem('topic_progress');
    const allProgress: Record<string, TopicProgress> = storedProgress ? JSON.parse(storedProgress) : {};

    const currentBest = allProgress[topic.id]?.bestScore || 0;

    allProgress[topic.id] = {
      topicId: topic.id,
      isPassed: isPassed || (allProgress[topic.id]?.isPassed ?? false),
      bestScore: Math.max(currentBest, percentage),
      lastAttempt: Date.now()
    };

    localStorage.setItem('topic_progress', JSON.stringify(allProgress));
  };

  const finishQuiz = () => {
    let score = 0;
    quizState.questions.forEach((q, idx) => {
      if (quizState.userAnswers[idx] === q.correctAnswerIndex) score++;
    });
    
    saveMistakes(quizState.questions, quizState.userAnswers);
    saveProgress(score, quizState.questions.length);

    setQuizState(prev => ({
      ...prev,
      isFinished: true,
      score
    }));
  };

  // Setup Screen
  if (setupMode) {
    return (
      <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-spanishYellow hover:text-white mb-6 w-fit transition-colors">
          <BackIcon /> <span>Cancelar</span>
        </button>
        <div className="max-w-xl mx-auto w-full text-center">
          <div className="mb-6 inline-block p-4 rounded-full bg-slate-800 border border-slate-700 shadow-xl">
            <span className="text-4xl">📝</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Test: {topic.title}</h1>
          <p className="text-slate-400 mb-8">Selecciona el modo de evaluación</p>
          
          <div className="grid gap-4">
            <button 
              onClick={() => startQuiz(QuizMode.REVIEW)}
              className="bg-spanishRed hover:bg-red-700 text-white p-6 rounded-xl border border-red-900 transition-all flex flex-col items-center shadow-lg hover:shadow-red-900/30"
            >
              <span className="text-xl font-bold mb-2">Modo Repaso</span>
              <span className="text-red-100 text-sm">Corrección inmediata y explicaciones detalladas tras cada pregunta.</span>
            </button>
            
            <button 
              onClick={() => startQuiz(QuizMode.REAL)}
              className="bg-slate-800 hover:bg-slate-700 text-white p-6 rounded-xl border border-slate-600 hover:border-spanishYellow transition-all flex flex-col items-center group"
            >
              <span className="text-xl font-bold mb-2 group-hover:text-spanishYellow transition-colors">Modo Examen Real</span>
              <span className="text-slate-400 text-sm">Sin feedback inmediato. Resultados al final.</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900">
        <LoadingSpinner />
        <p className="mt-4 text-spanishYellow animate-pulse">Generando preguntas personalizadas...</p>
      </div>
    );
  }

  // Error State (if API fails)
  if (quizState.questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 p-6 text-center">
         <p className="text-red-400 mb-4">No se pudieron generar las preguntas. Verifica tu conexión o API Key.</p>
         <button onClick={onBack} className="bg-slate-700 px-4 py-2 rounded text-white">Volver</button>
      </div>
    );
  }

  // Results Screen
  if (quizState.isFinished) {
    return (
      <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
           <div className="text-center mb-8">
             <h2 className="text-3xl font-bold mb-2 text-white">Resultados</h2>
             <div className="text-6xl font-bold text-spanishYellow my-6 drop-shadow-md">
               {quizState.score} <span className="text-2xl text-slate-500">/ {quizState.questions.length}</span>
             </div>
             <p className="text-slate-300 mb-2 font-medium">
               {quizState.score === quizState.questions.length ? "¡Excelente! Dominas este tema." : 
                quizState.score >= quizState.questions.length / 2 ? "Bien hecho, pero hay margen de mejora." : "Necesitas repasar este título."}
             </p>
             <p className="text-xs text-slate-500">
               {quizState.score >= quizState.questions.length / 2 
                 ? "Has APROBADO este tema. Se ha guardado tu progreso."
                 : "No has superado el 50%. Sigue estudiando."}
             </p>
           </div>

           <div className="space-y-6">
             {quizState.questions.map((q, idx) => (
               <div key={idx} className={`p-4 rounded-lg border ${quizState.userAnswers[idx] === q.correctAnswerIndex ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-red-500/50 bg-red-900/10'}`}>
                 <p className="font-semibold mb-2">{idx + 1}. {q.question}</p>
                 <div className="text-sm text-slate-300">
                    <p>Tu respuesta: <span className={quizState.userAnswers[idx] === q.correctAnswerIndex ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {q.options[quizState.userAnswers[idx]] || 'Sin responder'}
                    </span></p>
                    {quizState.userAnswers[idx] !== q.correctAnswerIndex && (
                      <p>Correcta: <span className="text-emerald-400 font-bold">{q.options[q.correctAnswerIndex]}</span></p>
                    )}
                 </div>
                 <p className="mt-2 text-xs text-slate-300 italic bg-slate-800 p-3 rounded border-l-2 border-spanishYellow">{q.explanation}</p>
               </div>
             ))}
           </div>
           
           <div className="flex justify-center gap-4 mt-8 pb-8">
             <button onClick={onBack} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium border border-slate-600">Volver al Temario</button>
             <button onClick={() => startQuiz(quizState.mode)} className="px-6 py-3 bg-spanishRed hover:bg-red-700 text-white rounded-lg font-medium shadow-lg">Repetir Test</button>
           </div>
        </div>
      </div>
    );
  }

  // Active Quiz Interface
  const currentQ = quizState.questions[quizState.currentQuestionIndex];
  const hasAnsweredCurrent = quizState.userAnswers[quizState.currentQuestionIndex] !== -1;
  const isCorrect = hasAnsweredCurrent && quizState.userAnswers[quizState.currentQuestionIndex] === currentQ.correctAnswerIndex;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-4 md:p-8 max-w-3xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6 text-sm text-slate-400">
        <span>Pregunta {quizState.currentQuestionIndex + 1} de {quizState.questions.length}</span>
        <span className="uppercase tracking-wider font-bold text-spanishYellow border border-spanishYellow/20 px-2 py-1 rounded">{quizState.mode === QuizMode.REAL ? 'Modo Examen' : 'Modo Repaso'}</span>
      </div>

      <div className="w-full bg-slate-800 h-2 rounded-full mb-8 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-spanishRed to-spanishYellow h-full transition-all duration-300"
          style={{ width: `${((quizState.currentQuestionIndex) / quizState.questions.length) * 100}%` }}
        />
      </div>

      <h2 className="text-xl md:text-2xl font-bold mb-8 leading-snug border-l-4 border-spanishRed pl-4">{currentQ.question}</h2>

      <div className="space-y-3 flex-1">
        {currentQ.options.map((option, idx) => {
          let buttonClass = "w-full p-4 rounded-lg border text-left transition-all relative ";
          
          if (quizState.mode === QuizMode.REVIEW && hasAnsweredCurrent) {
            // Show styles immediately in Review Mode
            if (idx === currentQ.correctAnswerIndex) {
               buttonClass += "border-emerald-500 bg-emerald-900/20 text-emerald-100 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
            } else if (idx === quizState.userAnswers[quizState.currentQuestionIndex]) {
               buttonClass += "border-red-500 bg-red-900/20 text-red-100";
            } else {
               buttonClass += "border-slate-700 bg-slate-800 opacity-50";
            }
          } else if (quizState.mode === QuizMode.REAL && hasAnsweredCurrent) {
            // In Real mode, just highlight selection, don't show correct/incorrect
            if (idx === quizState.userAnswers[quizState.currentQuestionIndex]) {
               buttonClass += "border-spanishYellow bg-yellow-900/20 text-yellow-100 shadow-[0_0_10px_rgba(241,191,0,0.2)]";
            } else {
               buttonClass += "border-slate-700 bg-slate-800 hover:bg-slate-750";
            }
          } else {
            // Default state
            buttonClass += "border-slate-700 bg-slate-800 hover:border-spanishYellow hover:bg-slate-750 hover:text-white";
          }

          return (
            <button 
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={hasAnsweredCurrent}
              className={buttonClass}
            >
               <span className={`inline-block w-6 font-bold mr-2 ${hasAnsweredCurrent && idx === currentQ.correctAnswerIndex ? 'text-emerald-400' : 'text-slate-500'}`}>{String.fromCharCode(65 + idx)}.</span>
               {option}
            </button>
          );
        })}
      </div>

      {/* Explanation Area (Only Review Mode) */}
      {quizState.mode === QuizMode.REVIEW && hasAnsweredCurrent && (
        <div className={`mt-6 p-4 rounded-lg border ${isCorrect ? 'border-emerald-500/30 bg-emerald-900/10' : 'border-red-500/30 bg-red-900/10'}`}>
          <p className="font-bold mb-1">{isCorrect ? '¡Correcto!' : 'Incorrecto'}</p>
          <p className="text-sm text-slate-300 leading-relaxed">{currentQ.explanation}</p>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button 
          onClick={nextQuestion}
          disabled={!hasAnsweredCurrent}
          className={`px-6 py-3 rounded-lg font-bold transition-colors ${
            hasAnsweredCurrent 
              ? 'bg-spanishRed text-white hover:bg-red-700 shadow-lg' 
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
        >
          {quizState.currentQuestionIndex === quizState.questions.length - 1 ? 'Ver Resultados' : 'Siguiente'}
        </button>
      </div>
    </div>
  );
};