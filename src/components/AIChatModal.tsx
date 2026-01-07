import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  leftContent: string;
  rightContent: string;
  leftFileName: string;
  rightFileName: string;
  isDarkMode: boolean;
  isAIAvailable: boolean;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  onStatusChange?: (status: 'idle' | 'thinking' | 'ready') => void;
}

export const AIChatModal: React.FC<AIChatModalProps> = ({
  isOpen,
  onClose,
  leftContent,
  rightContent,
  leftFileName,
  rightFileName,
  isDarkMode,
  isAIAvailable,
  initialMessages = [],
  onMessagesChange,
  onStatusChange,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialPromptRef = useRef<string | null>(null);

  // Sync with initialMessages prop and store/update initial prompt with full file contents
  useEffect(() => {
    // Always update the initial prompt ref with current file contents (for API context)
    const fullPrompt = `I'm analyzing a git diff showing changes to a file. Please summarize the new changes being made.

**Before (${leftFileName}):**
\`\`\`
${leftContent}
\`\`\`

**After (${rightFileName}):**
\`\`\`
${rightContent}
\`\`\`

Please analyze this diff and summarize the changes using the following markdown template:

## Summary

Brief overview of what changed and why.

## Changes

### Additions
- List any new code, functions, or features added

### Deletions
- List any code, functions, or features removed

### Modifications
- List any existing code that was changed

## Patterns & Notable Differences

- Any patterns or notable differences observed

---

Focus on summarizing the new changes being made. Format your response exactly like this template, using proper markdown syntax.`;
    initialPromptRef.current = fullPrompt;
    
    // Sync messages from prop
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, leftContent, rightContent, leftFileName, rightFileName]);

  // Notify parent of message changes
  useEffect(() => {
    if (onMessagesChange) {
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  // Reset input when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInput('');
    }
  }, [isOpen]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // No longer initializing here - that's done in App.tsx

  const sendMessage = useCallback(async (content: string, isInitial = false) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content };
    
    // Update messages first and get the new messages array
    let currentMessages: Message[] = [];
    setMessages(prev => {
      // Prevent duplicate messages
      if (isInitial && prev.length > 0) {
        currentMessages = prev;
        return prev; // Already initialized
      }
      if (!isInitial && prev.length > 0 && prev[prev.length - 1].role === 'user' && prev[prev.length - 1].content === content) {
        currentMessages = prev;
        return prev; // Duplicate user message
      }
      currentMessages = isInitial ? [userMessage] : [...prev, userMessage];
      return currentMessages;
    });
    
    // Make API call asynchronously using Rust command
    setIsLoading(true);
    if (onStatusChange) {
      onStatusChange('thinking');
    }
    
    // Prepare messages for the API call
    // Always include the initial prompt with full file contents for context
    // Note: Some models only support 'user' and 'assistant' roles, not 'system'
    const initialPrompt = initialPromptRef.current || (currentMessages[0]?.role === 'user' ? currentMessages[0].content : '');
    
    // Build API messages: start with initial prompt, then add subsequent messages
    const apiMessages: Array<{role: string, content: string}> = [];
    
    if (initialPrompt) {
      // First message: system instruction + initial prompt with full file contents
      apiMessages.push({
        role: 'user',
        content: `You are a helpful assistant that analyzes code diffs and explains changes clearly.\n\n${initialPrompt}`,
      });
    }
    
    // Add all subsequent messages (skip the first user message if it's the initial prompt)
    const messagesToInclude = currentMessages.length > 0 && currentMessages[0].role === 'user' && initialPromptRef.current
      ? currentMessages.slice(1) // Skip first user message (initial prompt)
      : currentMessages; // Include all if no initial prompt stored
    
    messagesToInclude.forEach(msg => {
      apiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    });
    
    invoke<string>('send_lm_studio_message', { messages: apiMessages })
      .then((response) => {
        setMessages(prevMsgs => {
          // Check if we already have this assistant message to prevent duplicates
          const lastMsg = prevMsgs[prevMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === response) {
            return prevMsgs;
          }
          const assistantMessage: Message = {
            role: 'assistant',
            content: response || 'No response received',
          };
          return [...prevMsgs, assistantMessage];
        });
      })
      .catch((error) => {
        setMessages(prevMsgs => {
          const errorContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
          // Check if we already have this error message
          const lastMsg = prevMsgs[prevMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === errorContent) {
            return prevMsgs;
          }
          const errorMessage: Message = {
            role: 'assistant',
            content: errorContent,
          };
          return [...prevMsgs, errorMessage];
        });
      })
      .finally(() => {
        setIsLoading(false);
        if (onStatusChange) {
          onStatusChange('ready');
        }
      });
    
    setInput('');
  }, [isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isOpen) return null;

  const bgColor = isDarkMode ? '#1e1e1e' : '#ffffff';
  const borderColor = isDarkMode ? '#3e3e42' : '#e1e1e1';
  const textColor = isDarkMode ? '#cccccc' : '#333333';
  const inputBg = isDarkMode ? '#2d2d2d' : '#f5f5f5';
  const userMsgBg = isDarkMode ? '#0e639c' : '#e3f2fd';
  const assistantMsgBg = isDarkMode ? '#2d2d2d' : '#f5f5f5';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '80%',
          maxWidth: '800px',
          height: '80%',
          backgroundColor: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: `1px solid ${borderColor}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <h3 style={{ margin: 0, color: textColor }}>AI Diff Analysis</h3>
            {!isAIAvailable && (
              <span style={{ fontSize: '12px', color: '#ff6b6b' }}>
                (LM Studio not available)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: textColor,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.length === 0 && isAIAvailable && (
            <div style={{ color: textColor, textAlign: 'center', padding: '20px' }}>
              Generating summary...
            </div>
          )}
          {messages.length === 0 && !isAIAvailable && (
            <div style={{ color: textColor, textAlign: 'center', padding: '20px' }}>
              LM Studio is not available. Please make sure it's running on localhost:1234
            </div>
          )}
          {messages.map((msg, idx) => {
            // Hide the first user message (the initial prompt with file contents)
            if (idx === 0 && msg.role === 'user') {
              return null;
            }
            
            return (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: msg.role === 'user' ? userMsgBg : assistantMsgBg,
                  color: textColor,
                  wordBreak: 'break-word',
                }}
              >
                {msg.role === 'assistant' ? (
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.6',
                  }}>
                    <ReactMarkdown
                      components={{
                        h1: ({node, ...props}) => <h1 style={{ fontSize: '20px', marginTop: '12px', marginBottom: '8px', fontWeight: 'bold' }} {...props} />,
                        h2: ({node, ...props}) => <h2 style={{ fontSize: '18px', marginTop: '10px', marginBottom: '6px', fontWeight: 'bold' }} {...props} />,
                        h3: ({node, ...props}) => <h3 style={{ fontSize: '16px', marginTop: '8px', marginBottom: '4px', fontWeight: 'bold' }} {...props} />,
                        p: ({node, ...props}) => <p style={{ margin: '8px 0' }} {...props} />,
                        ul: ({node, ...props}) => <ul style={{ margin: '8px 0', paddingLeft: '20px' }} {...props} />,
                        ol: ({node, ...props}) => <ol style={{ margin: '8px 0', paddingLeft: '20px' }} {...props} />,
                        li: ({node, ...props}) => <li style={{ margin: '4px 0' }} {...props} />,
                        code: ({node, inline, ...props}: any) => 
                          inline ? (
                            <code style={{ backgroundColor: isDarkMode ? '#3e3e42' : '#e8e8e8', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '13px' }} {...props} />
                          ) : (
                            <code style={{ display: 'block', backgroundColor: isDarkMode ? '#2d2d2d' : '#f5f5f5', padding: '12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px', overflow: 'auto' }} {...props} />
                          ),
                        pre: ({node, ...props}) => <pre style={{ margin: '8px 0', overflow: 'auto' }} {...props} />,
                        blockquote: ({node, ...props}) => <blockquote style={{ borderLeft: `4px solid ${isDarkMode ? '#555' : '#ccc'}`, paddingLeft: '12px', margin: '8px 0', fontStyle: 'italic' }} {...props} />,
                        hr: ({node, ...props}) => <hr style={{ border: 'none', borderTop: `1px solid ${isDarkMode ? '#444' : '#ddd'}`, margin: '16px 0' }} {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                )}
              </div>
            );
          })}
          {isLoading && (
            <div style={{ color: textColor, padding: '12px' }}>Thinking...</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '16px',
            borderTop: `1px solid ${borderColor}`,
            display: 'flex',
            gap: '8px',
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the diff..."
            disabled={isLoading || !isAIAvailable}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: inputBg,
              border: `1px solid ${borderColor}`,
              borderRadius: '6px',
              color: textColor,
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !isAIAvailable || !input.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: isLoading || !isAIAvailable ? '#666' : '#0e639c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: isLoading || !isAIAvailable ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

