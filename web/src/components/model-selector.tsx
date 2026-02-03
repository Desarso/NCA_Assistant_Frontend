import { useState, useEffect } from "react";
import { HOST } from "@/aichat/utils/utils";
import { ModelConfig } from "@/aichat/models/api-types";

interface ModelSelectorProps {
  value?: string;
  onChange: (modelId: string) => void;
  className?: string;
}

export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${HOST}/api/v1/models`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      
      const data = await response.json();
      setModels(data.models || []);
      
      // If no value is set and we have models, set the first one as default
      if (!value && data.models && data.models.length > 0) {
        onChange(data.models[0].id);
      }
    } catch (err) {
      console.error("Error fetching models:", err);
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={className}>
        <select 
          disabled 
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground opacity-50"
        >
          <option>Loading models...</option>
        </select>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <select 
          disabled 
          className="w-full px-3 py-2 border border-destructive rounded-md bg-background text-foreground opacity-50"
        >
          <option>Error loading models</option>
        </select>
        <p className="text-xs text-destructive mt-1">{error}</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className={className}>
        <select 
          disabled 
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground opacity-50"
        >
          <option>No models available</option>
        </select>
      </div>
    );
  }

  return (
    <div className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
      >
        <option value="">Select a model</option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.display_name} - {model.description}
          </option>
        ))}
      </select>
      
      {value && (
        <div className="mt-2 space-y-1">
          {(() => {
            const selectedModel = models.find(m => m.id === value);
            if (!selectedModel) return null;
            
            return (
              <>
                <p className="text-xs text-muted-foreground">
                  Provider: <span className="font-medium">{selectedModel.provider}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Context: <span className="font-medium">{(selectedModel.context_size / 1000).toFixed(0)}k tokens</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedModel.capabilities.map(cap => (
                    <span 
                      key={cap}
                      className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
