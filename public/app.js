/**
 * WanderAI - ChatGPT-Style AI Trip Planner
 * Client-side logic & streaming handler
 */

// --- State & Storage ---
const STORAGE_KEY = 'wanderai_trips_v1';
const API_KEY_STORAGE = 'wanderai_custom_groq_key';
const MODEL_STORAGE = 'wanderai_groq_model';

let conversations = [];
let currentChatId = null;
let isGenerating = false;
let abortController = null;
let appConfig = { hasApiKey: false, model: 'openai/gpt-oss-120b' };

// --- DOM Elements ---
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const newChatBtn = document.getElementById('newChatBtn');
const navNewTripBtn = document.getElementById('navNewTripBtn');
const tripSearchInput = document.getElementById('tripSearchInput');
const historyItems = document.getElementById('historyItems');
const clearAllTripsBtn = document.getElementById('clearAllTripsBtn');

const currentTripTitle = document.getElementById('currentTripTitle');
const activeModelName = document.getElementById('activeModelName');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const apiBanner = document.getElementById('apiBanner');
const bannerSettingsBtn = document.getElementById('bannerSettingsBtn');
const dismissBannerBtn = document.getElementById('dismissBannerBtn');

const chatContainer = document.getElementById('chatContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messagesList = document.getElementById('messagesList');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');

const wizardDestination = document.getElementById('wizardDestination');
const wizardDays = document.getElementById('wizardDays');
const wizardBudget = document.getElementById('wizardBudget');
const wizardStyle = document.getElementById('wizardStyle');
const wizardGenerateBtn = document.getElementById('wizardGenerateBtn');

const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');
const exportMarkdownBtn = document.getElementById('exportMarkdownBtn');
const exportPrintBtn = document.getElementById('exportPrintBtn');
const copyAllTextBtn = document.getElementById('copyAllTextBtn');

const openSettingsBtn = document.getElementById('openSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsApiKey = document.getElementById('settingsApiKey');
const settingsModel = document.getElementById('settingsModel');
const toast = document.getElementById('toast');

// --- Initialization ---
async function init() {
  loadConversations();
  setupEventListeners();
  await checkConfig();
  
  // Render sidebar
  renderHistory();

  // Load last active or new chat
  if (conversations.length > 0) {
    loadConversation(conversations[0].id);
  } else {
    createNewChat();
  }
}

// --- API Configuration Check ---
async function checkConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      appConfig = await res.json();
    }
  } catch (err) {
    console.warn('Could not check server config:', err);
  }

  const clientKey = localStorage.getItem(API_KEY_STORAGE);
  const selectedModel = localStorage.getItem(MODEL_STORAGE) || appConfig.model || 'openai/gpt-oss-120b';
  
  activeModelName.textContent = selectedModel.replace(/^.*\//, '');

  const hasKey = appConfig.hasApiKey || Boolean(clientKey && clientKey.trim());
  
  if (hasKey) {
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Groq Connected';
    apiBanner.classList.add('hidden');
  } else {
    statusDot.className = 'status-dot warning';
    statusText.textContent = 'Key Missing';
    apiBanner.classList.remove('hidden');
  }
}

// --- Conversations & LocalStorage ---
function loadConversations() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    conversations = saved ? JSON.parse(saved) : [];
  } catch {
    conversations = [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.error('Error saving conversations:', err);
  }
}

function getCurrentConversation() {
  return conversations.find(c => c.id === currentChatId);
}

function createNewChat() {
  const newChat = {
    id: 'chat_' + Date.now(),
    title: 'New Adventure',
    createdAt: new Date().toISOString(),
    messages: []
  };
  conversations.unshift(newChat);
  saveConversations();
  loadConversation(newChat.id);
  renderHistory();
  if (window.innerWidth <= 768) {
    sidebar.classList.add('collapsed');
  }
}

function loadConversation(id) {
  currentChatId = id;
  const chat = getCurrentConversation();
  if (!chat) return;

  currentTripTitle.textContent = chat.title || 'New Adventure';
  renderHistory();
  renderMessages();
}

function deleteConversation(id, event) {
  if (event) event.stopPropagation();
  conversations = conversations.filter(c => c.id !== id);
  saveConversations();
  renderHistory();

  if (currentChatId === id) {
    if (conversations.length > 0) {
      loadConversation(conversations[0].id);
    } else {
      createNewChat();
    }
  }
  showToast('Trip deleted');
}

function clearAllConversations() {
  if (!confirm('Are you sure you want to delete all saved trip plans?')) return;
  conversations = [];
  saveConversations();
  createNewChat();
  showToast('All trip history cleared');
}

// --- Render History in Sidebar ---
function renderHistory(filterText = '') {
  historyItems.innerHTML = '';
  const filtered = conversations.filter(c => 
    c.title.toLowerCase().includes(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    historyItems.innerHTML = '<div style="padding: 10px; font-size: 0.78rem; color: var(--text-muted);">No saved trips found</div>';
    return;
  }

  filtered.forEach(chat => {
    const item = document.createElement('div');
    item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="history-item-title">${escapeHtml(chat.title)}</span>
      <div class="history-item-actions">
        <button class="history-action-btn delete" title="Delete Trip" aria-label="Delete Trip">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    item.addEventListener('click', () => loadConversation(chat.id));
    const delBtn = item.querySelector('.delete');
    delBtn.addEventListener('click', (e) => deleteConversation(chat.id, e));

    historyItems.appendChild(item);
  });
}

// --- Render Messages in Main Chat ---
function renderMessages() {
  const chat = getCurrentConversation();
  if (!chat || chat.messages.length === 0) {
    welcomeScreen.classList.remove('hidden');
    messagesList.classList.add('hidden');
    messagesList.innerHTML = '';
    return;
  }

  welcomeScreen.classList.add('hidden');
  messagesList.classList.remove('hidden');
  messagesList.innerHTML = '';

  chat.messages.forEach((msg, idx) => {
    appendMessageElement(msg.role, msg.content, idx === chat.messages.length - 1 && msg.role === 'assistant');
  });

  scrollToBottom();
}

function appendMessageElement(role, content, isLatestAssistant = false) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.innerHTML = role === 'user' 
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
    
    // Actions & Followup chips footer
    const footer = document.createElement('div');
    footer.className = 'message-footer';

    // Actions (Copy)
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button class="msg-action-btn copy-msg-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy Itinerary</span>
      </button>
    `;
    actions.querySelector('.copy-msg-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(content);
      showToast('Copied to clipboard!');
    });
    footer.appendChild(actions);

    // Follow-up suggestions for latest assistant response
    if (isLatestAssistant && !isGenerating) {
      const suggestions = document.createElement('div');
      suggestions.className = 'suggested-chips';
      const promptSuggestions = [
        '▶️ Continue writing next days / details',
        '🎒 What should I pack for this trip?',
        '💰 How can I lower this budget by 25%?',
        '🚊 Best transportation passes to buy?',
        '🌿 Give me 3 hidden gems away from tourists'
      ];
      promptSuggestions.forEach(text => {
        const chip = document.createElement('button');
        chip.className = 'suggested-chip';
        chip.textContent = text;
        chip.addEventListener('click', () => submitMessage(text));
        suggestions.appendChild(chip);
      });
      footer.appendChild(suggestions);
    }

    bubble.appendChild(footer);
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesList.appendChild(row);
  return { row, bubble };
}

// --- Streaming Chat Submission ---
async function submitMessage(userPrompt) {
  const prompt = (userPrompt || messageInput.value || '').trim();
  if (!prompt || isGenerating) return;

  const chat = getCurrentConversation();
  if (!chat) return;

  // If this is the first message, generate a smart title
  if (chat.messages.length === 0) {
    chat.title = generateTitleFromPrompt(prompt);
    currentTripTitle.textContent = chat.title;
  }

  // Add user message to state
  chat.messages.push({ role: 'user', content: prompt });
  saveConversations();
  renderHistory();

  // Reset input
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Render user message
  welcomeScreen.classList.add('hidden');
  messagesList.classList.remove('hidden');
  appendMessageElement('user', prompt);
  scrollToBottom();

  // Prepare Assistant message container
  isGenerating = true;
  updateUIForGenerating(true);
  abortController = new AbortController();

  const assistantRow = document.createElement('div');
  assistantRow.className = 'message-row assistant';
  assistantRow.innerHTML = `
    <div class="message-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
    </div>
    <div class="message-bubble">
      <div class="streaming-content"></div>
      <span class="streaming-cursor"></span>
    </div>
  `;
  messagesList.appendChild(assistantRow);
  scrollToBottom();

  const streamingContentEl = assistantRow.querySelector('.streaming-content');
  const cursorEl = assistantRow.querySelector('.streaming-cursor');
  let accumulatedText = '';

  try {
    const selectedModel = localStorage.getItem(MODEL_STORAGE) || appConfig.model || 'openai/gpt-oss-120b';
    const customKey = localStorage.getItem(API_KEY_STORAGE) || '';

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({
        messages: chat.messages,
        model: selectedModel,
        apiKey: customKey
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || `Server responded with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          break;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.error) {
              throw new Error(data.error);
            }
            if (data.content) {
              accumulatedText += data.content;
              streamingContentEl.innerHTML = renderMarkdown(accumulatedText);
              scrollToBottom();
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }
    }

    // Finished successfully
    cursorEl?.remove();
    chat.messages.push({ role: 'assistant', content: accumulatedText });
    saveConversations();
    renderMessages(); // Clean render with action buttons
  } catch (err) {
    if (err.name === 'AbortError') {
      accumulatedText += '\n\n*(Generation stopped by user)*';
      cursorEl?.remove();
      chat.messages.push({ role: 'assistant', content: accumulatedText });
      saveConversations();
      renderMessages();
      showToast('Generation stopped');
    } else {
      cursorEl?.remove();
      const errorMessage = `⚠️ **Error:** ${err.message}\n\nPlease verify your **Groq API key** in the \`.env\` file or in **Settings**.`;
      streamingContentEl.innerHTML = renderMarkdown(errorMessage);
      chat.messages.push({ role: 'assistant', content: errorMessage });
      saveConversations();
      showToast('Failed to generate response');
    }
  } finally {
    isGenerating = false;
    abortController = null;
    updateUIForGenerating(false);
  }
}

function updateUIForGenerating(generating) {
  sendBtn.disabled = generating;
  if (generating) {
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
  } else {
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
  }
}

function generateTitleFromPrompt(prompt) {
  const clean = prompt.replace(/[^\w\s]/gi, ' ').trim();
  const words = clean.split(/\s+/).slice(0, 5).join(' ');
  return words.length > 28 ? words.substring(0, 28) + '...' : (words || 'Trip Plan');
}

// --- Markdown Rendering ---
function renderMarkdown(text) {
  if (!text) return '';
  if (window.marked) {
    try {
      const rawHtml = window.marked.parse(text, { breaks: true, gfm: true });
      return window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
    } catch {
      // Fallback
    }
  }
  // Simple fallback
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- Quick Trip Wizard ---
function handleWizardGenerate() {
  const dest = wizardDestination.value.trim();
  const days = wizardDays.value;
  const budget = wizardBudget.value;
  const style = wizardStyle.value;

  if (!dest) {
    wizardDestination.focus();
    showToast('Please enter a destination to plan');
    return;
  }

  const prompt = `Plan a comprehensive ${days} trip itinerary to ${dest} for a ${style} traveler on a ${budget} budget. 

Please structure the plan with:
1. Trip Overview (Best season, vibe, estimated daily budget)
2. Day-by-day morning, afternoon, and evening schedule with iconic places & neighborhood recommendations
3. Food & Dining highlights (local must-try dishes and spot suggestions)
4. Estimated Budget Breakdown in a clean table (Stay, Meals, Transit, Activities)
5. Practical Tips: Best transit pass, essential packing checklist, and insider hidden gems.`;

  submitMessage(prompt);
}

// --- Export Functions ---
function exportAsMarkdown() {
  const chat = getCurrentConversation();
  if (!chat || chat.messages.length === 0) {
    showToast('No itinerary to export');
    return;
  }

  let mdContent = `# ${chat.title}\n\nGenerated by WanderAI Trip Planner\n\n---\n\n`;
  chat.messages.forEach(m => {
    if (m.role === 'user') {
      mdContent += `### 👤 Traveler Request:\n${m.content}\n\n`;
    } else {
      mdContent += `### ✈️ WanderAI Itinerary:\n${m.content}\n\n---\n\n`;
    }
  });

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chat.title.replace(/\s+/g, '_')}_itinerary.md`;
  a.click();
  URL.revokeObjectURL(url);
  exportMenu.classList.remove('show');
  showToast('Markdown downloaded!');
}

function exportPrintPDF() {
  exportMenu.classList.remove('show');
  window.print();
}

function copyAllItinerary() {
  const chat = getCurrentConversation();
  if (!chat || chat.messages.length === 0) {
    showToast('No itinerary to copy');
    return;
  }
  const assistantMessages = chat.messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .join('\n\n---\n\n');

  navigator.clipboard.writeText(assistantMessages || chat.messages.map(m => m.content).join('\n\n'));
  exportMenu.classList.remove('show');
  showToast('Full itinerary copied to clipboard!');
}

// --- Toast Feedback ---
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2400);
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Sidebar toggles
  toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  closeSidebarBtn.addEventListener('click', () => sidebar.classList.add('collapsed'));
  newChatBtn.addEventListener('click', createNewChat);
  navNewTripBtn.addEventListener('click', createNewChat);
  clearAllTripsBtn.addEventListener('click', clearAllConversations);

  // Search
  tripSearchInput.addEventListener('input', (e) => renderHistory(e.target.value));

  // Chat Form Submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitMessage();
  });

  // Stop button
  stopBtn.addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
    }
  });

  // Auto-expanding textarea & keyboard shortcuts
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      createNewChat();
    }
    if (e.key === 'Escape') {
      if (!settingsModal.classList.contains('hidden')) {
        settingsModal.classList.add('hidden');
      }
      if (exportMenu.classList.contains('show')) {
        exportMenu.classList.remove('show');
      }
    }
  });

  // Wizard Generate Button
  wizardGenerateBtn.addEventListener('click', handleWizardGenerate);
  wizardDestination.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleWizardGenerate();
  });

  // Prompt Cards
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      submitMessage(prompt);
    });
  });

  // Quick modifier chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const mod = chip.getAttribute('data-modifier');
      const chat = getCurrentConversation();
      if (chat && chat.messages.length > 0) {
        submitMessage(mod);
      } else {
        messageInput.value = (messageInput.value ? messageInput.value + ' ' : '') + mod;
        messageInput.focus();
      }
    });
  });

  // Export Dropdown
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
      exportMenu.classList.remove('show');
    }
  });

  exportMarkdownBtn.addEventListener('click', exportAsMarkdown);
  exportPrintBtn.addEventListener('click', exportPrintPDF);
  copyAllTextBtn.addEventListener('click', copyAllItinerary);

  // Settings Modal
  function openSettings() {
    settingsApiKey.value = localStorage.getItem(API_KEY_STORAGE) || '';
    settingsModel.value = localStorage.getItem(MODEL_STORAGE) || appConfig.model || 'openai/gpt-oss-120b';
    settingsModal.classList.remove('hidden');
  }

  openSettingsBtn.addEventListener('click', openSettings);
  bannerSettingsBtn?.addEventListener('click', openSettings);

  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

  saveSettingsBtn.addEventListener('click', () => {
    const key = settingsApiKey.value.trim();
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
    localStorage.setItem(MODEL_STORAGE, settingsModel.value);
    activeModelName.textContent = settingsModel.value.replace(/^.*\//, '');
    settingsModal.classList.add('hidden');
    checkConfig();
    showToast('Settings saved!');
  });

  dismissBannerBtn?.addEventListener('click', () => {
    apiBanner.classList.add('hidden');
  });
}

// Start app
document.addEventListener('DOMContentLoaded', init);
