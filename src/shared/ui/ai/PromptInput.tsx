import { Send, Sparkles, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxTokens?: number;
  templates?: Array<{ name: string; content: string }>;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Describe what you want to create...",
  disabled = false,
  maxTokens = 4000,
  templates = [],
}: PromptInputProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(value.length / 4);
  const tokenPercentage = (estimatedTokens / maxTokens) * 100;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  const handleTemplateSelect = (template: {
    name: string;
    content: string;
  }) => {
    onChange(template.content);
    setShowTemplates(false);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-glow backdrop-blur-xl">
      <div className="relative">
        {/* Templates Dropdown */}
        {templates.length > 0 && (
          <div className="relative mb-3">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              <span>Templates</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showTemplates ? "rotate-180" : ""
                }`}
              />
            </button>

            {showTemplates && (
              <div className="absolute left-0 top-full z-10 mt-2 w-full rounded-xl border border-white/10 bg-slate-800 shadow-xl">
                {templates.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => handleTemplateSelect(template)}
                    className="w-full rounded-t-lg px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-white/10 hover:text-white first:rounded-t-xl last:rounded-b-xl"
                    type="button"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition-colors focus:border-brand-400/50 disabled:opacity-50"
          rows={3}
          style={{ minHeight: "80px", maxHeight: "200px" }}
        />

        {/* Token Counter */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 rounded-full bg-slate-700">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  tokenPercentage >= 90
                    ? "bg-error-400"
                    : tokenPercentage >= 70
                      ? "bg-warning-400"
                      : "bg-success-400"
                }`}
                style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">
              {estimatedTokens} / {maxTokens} tokens
            </span>
          </div>

          {/* Submit Button */}
          <button
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            <Send className="h-4 w-4" />
            <span>Generate</span>
          </button>
        </div>
      </div>
    </div>
  );
}
