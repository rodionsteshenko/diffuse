import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import { generateDiff } from '../utils/diff';

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

  // Sync with initialMessages prop and store/update initial prompt with diff
  useEffect(() => {
    // Always update the initial prompt ref with diff (for API context)
    const diffText = generateDiff(leftContent, rightContent, leftFileName, rightFileName);
    const diffPrompt = `I'm analyzing a git diff showing changes to a file. Please provide a clear, concise summary.

**Diff:**
\`\`\`
${diffText}
\`\`\`

Analyze this diff and provide a summary. Start with a high-level overview of what functionality changed, was added, or removed. Then provide specific details.

## Summary

Start here with a concise 2-3 sentence overview: What overall functionality changed? What was added or removed at a high level? What's the purpose of these changes?

## Changes

### Additions
- New functionality, classes, functions, or features added

### Deletions  
- Functionality, classes, functions, or features removed

### Modifications
- Existing code that was changed or refactored

## Details

- Specific new classes, functions, or patterns introduced
- Notable implementation details or patterns

Keep it concise and focused. Write naturally, not mechanically. Format using proper markdown syntax.`;
    initialPromptRef.current = diffPrompt;
    
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
      // First message: system instruction + initial prompt with diff
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
    
    // Send message to API
    try {
      const response = await invoke<string>('send_lm_studio_message', { messages: apiMessages });
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessages(prevMsgs => {
        const errorContent = `Error: ${errorMessage}`;
        // Check if we already have this error message
        const lastMsg = prevMsgs[prevMsgs.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === errorContent) {
          return prevMsgs;
        }
        const errorMsg: Message = {
          role: 'assistant',
          content: errorContent,
        };
        return [...prevMsgs, errorMsg];
      });
    }
    
    setIsLoading(false);
    if (onStatusChange) {
      onStatusChange('ready');
    }
    
    setInput('');
  }, [isLoading, leftContent, rightContent, leftFileName, rightFileName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isOpen) return null;

  const bgColor = isDarkMode ? '#1a1f2e' : '#f0f4f8';
  const borderColor = isDarkMode ? '#2d3441' : '#c8d1db';
  const textColor = isDarkMode ? '#cbd5e1' : '#1e293b';
  const inputBg = isDarkMode ? '#252b3a' : '#ffffff';
  const userMsgBg = isDarkMode ? '#0e639c' : '#e3f2fd';
  const assistantMsgBg = isDarkMode ? '#252b3a' : '#e8f0f6';

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
            <h3 style={{ margin: 0, color: isDarkMode ? '#7fa8d4' : '#1e40af', fontWeight: 500 }}>AI Diff Analysis</h3>
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
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
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
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: msg.role === 'user' ? userMsgBg : assistantMsgBg,
                  color: textColor,
                  wordBreak: 'break-word',
                }}
              >
                {msg.role === 'assistant' ? (
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.4',
                  }}>
                    <ReactMarkdown
                      components={{
                        h1: ({node, ...props}) => <h1 style={{ fontSize: '18px', marginTop: '8px', marginBottom: '4px', fontWeight: 'bold' }} {...props} />,
                        h2: ({node, ...props}) => <h2 style={{ fontSize: '16px', marginTop: '6px', marginBottom: '3px', fontWeight: 'bold' }} {...props} />,
                        h3: ({node, ...props}) => <h3 style={{ fontSize: '15px', marginTop: '5px', marginBottom: '2px', fontWeight: 'bold' }} {...props} />,
                        p: ({node, ...props}) => <p style={{ margin: '4px 0', lineHeight: '1.4' }} {...props} />,
                        ul: ({node, ...props}) => <ul style={{ margin: '4px 0', paddingLeft: '18px' }} {...props} />,
                        ol: ({node, ...props}) => <ol style={{ margin: '4px 0', paddingLeft: '18px' }} {...props} />,
                        li: ({node, ...props}) => <li style={{ margin: '2px 0', lineHeight: '1.4' }} {...props} />,
                        code: ({node, inline, ...props}: any) => 
                          inline ? (
                            <code style={{ backgroundColor: isDarkMode ? '#3e3e42' : '#e8e8e8', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '12px' }} {...props} />
                          ) : (
                            <code style={{ display: 'block', backgroundColor: isDarkMode ? '#2d2d2d' : '#f5f5f5', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', overflow: 'auto', margin: '4px 0' }} {...props} />
                          ),
                        pre: ({node, ...props}) => <pre style={{ margin: '4px 0', overflow: 'auto' }} {...props} />,
                        blockquote: ({node, ...props}) => <blockquote style={{ borderLeft: `3px solid ${isDarkMode ? '#555' : '#ccc'}`, paddingLeft: '10px', margin: '4px 0', fontStyle: 'italic' }} {...props} />,
                        hr: ({node, ...props}) => <hr style={{ border: 'none', borderTop: `1px solid ${isDarkMode ? '#444' : '#ddd'}`, margin: '8px 0' }} {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{msg.content}</div>
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

