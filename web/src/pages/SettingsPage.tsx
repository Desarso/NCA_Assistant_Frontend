import { useState, useEffect } from "react";
import { ModelSelector } from "@/components/model-selector";

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] = useState<string>("");

  useEffect(() => {
    // Load saved model preference
    const savedModel = localStorage.getItem("preferred_model");
    if (savedModel) {
      setSelectedModel(savedModel);
    }
  }, []);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    // Save to localStorage
    localStorage.setItem("preferred_model", modelId);
    console.log("Selected model:", modelId);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">AI Model</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select the AI model to use for your conversations
          </p>
          <ModelSelector 
            value={selectedModel} 
            onChange={handleModelChange}
            className="max-w-md"
          />
        </div>

        {selectedModel && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm">
              <span className="font-medium">Current model:</span> {selectedModel}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This preference is saved locally and will apply to new conversations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
