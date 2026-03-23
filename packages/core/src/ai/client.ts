export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AIClient {
  chat(messages: ChatMessage[]): Promise<string>;
}
