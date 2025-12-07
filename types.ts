export enum AppView {
  HOME = 'HOME',
  TOPIC_LIST = 'TOPIC_LIST',
  STUDY = 'STUDY',
  QUIZ = 'QUIZ',
  CHAT = 'CHAT'
}

export interface ConstitutionTopic {
  id: string;
  title: string;
  description: string;
  articles: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum QuizMode {
  REAL = 'REAL', // Exam mode: No immediate feedback, timer styled
  REVIEW = 'REVIEW' // Review mode: Immediate feedback and explanations
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizState {
  questions: QuizQuestion[];
  userAnswers: number[]; // Index of selected answer, -1 if unanswered
  currentQuestionIndex: number;
  isFinished: boolean;
  score: number;
  mode: QuizMode;
}

export interface OutlineRequest {
  topicId: string;
  focusArea?: string;
}

export interface FailedQuestion {
  topicTitle: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  date: number;
}

export interface TopicProgress {
  topicId: string;
  isPassed: boolean;
  bestScore: number; // Percentage 0-100
  lastAttempt: number;
}