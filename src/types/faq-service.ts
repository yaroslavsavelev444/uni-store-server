// types/faq.types.ts

export interface PublicFaqTopic {
  id: string;
  title: string;
  questions: PublicFaqQuestion[];
}

export interface PublicFaqQuestion {
  id: string;
  question: string;
  answer: string;
}

export interface CreateTopicData {
  title: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateTopicData {
  title?: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export interface CreateQuestionData {
  question: string;
  answer: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateQuestionData {
  question?: string;
  answer?: string;
  order?: number;
  isActive?: boolean;
}

export interface TopicOrder {
  topicId: string;
  order: number;
}

export interface QuestionOrder {
  questionId: string;
  order: number;
}

export interface ReorderTopicsInput {
  orders: TopicOrder[];
}

export interface ReorderQuestionsInput {
  topicId: string;
  orders: QuestionOrder[];
}
