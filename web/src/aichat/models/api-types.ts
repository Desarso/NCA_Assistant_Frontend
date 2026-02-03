// Backend API types
export interface ModelConfig {
  id: string;
  display_name: string;
  provider: string;
  description: string;
  context_size: number;
  capabilities: string[];
  enabled: boolean;
}

export interface ModelsResponse {
  models: ModelConfig[];
}
