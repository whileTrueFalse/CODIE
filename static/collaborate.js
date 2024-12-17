document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO with reconnection options
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    let editor;
    let sessionId = document.getElementById('current-session-id').textContent.trim();
    let isTyping = false;
    let typingTimeout;

    // Initialize CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: 'python',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true
    });

    // Join Session Button Handler
    document.getElementById('join-session-btn').addEventListener('click', () => {
        const joinSessionId = document.getElementById('join-session-id').value.trim();
        if (joinSessionId) {
            window.location.href = `/collaborate/${joinSessionId}`;
        } else {
            alert('Please enter a session ID');
        }
    });

    // Copy Session ID Button
    document.getElementById('copy-session-id').addEventListener('click', () => {
        const sessionId = document.getElementById('current-session-id').textContent.trim();
        navigator.clipboard.writeText(sessionId).then(() => {
            alert('Session ID copied to clipboard!');
        });
    });

    // Language Select Handler
    document.getElementById('language-select').addEventListener('change', (e) => {
        const language = e.target.value;
        let mode = language;
        if (language === 'cpp' || language === 'csharp' || language === 'java') {
            mode = 'text/x-c++src';
        }
        editor.setOption('mode', mode);
        
        // Emit language change
        socket.emit('code_change', {
            code: editor.getValue(),
            language: language
        });
    });

    // Generate Code Button Handler
    document.getElementById('generate-button').addEventListener('click', async () => {
        try {
            const language = document.getElementById('language-select').value;
            const prompt = window.prompt('Enter your code generation prompt:');
            
            if (!prompt) return;

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    language: language
                })
            });

            const data = await response.json();
            
            if (data.error) {
                alert('Error generating code: ' + data.error);
                return;
            }

            editor.setValue(data.code);
            socket.emit('code_change', {
                code: data.code,
                language: language
            });

            // Add explanation to chat
            if (data.explanation) {
                socket.emit('chat_message', {
                    message: `Code Generation Explanation:\n${data.explanation}`
                });
            }

        } catch (error) {
            console.error('Error:', error);
            alert('Error generating code. Please try again.');
        }
    });

    // Copy Code Button Handler
    document.getElementById('copy-button').addEventListener('click', () => {
        const code = editor.getValue();
        navigator.clipboard.writeText(code).then(() => {
            alert('Code copied to clipboard!');
        });
    });

    // Code Change Handler
    editor.on('change', (cm, change) => {
        if (change.origin !== 'setValue') {
            socket.emit('code_change', {
                code: editor.getValue(),
                language: document.getElementById('language-select').value
            });

            // Handle typing indicator
            if (!isTyping) {
                isTyping = true;
                socket.emit('typing', { typing: true });
            }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isTyping = false;
                socket.emit('typing', { typing: false });
            }, 1000);
        }
    });

    // Chat Message Handler
    document.getElementById('send-message').addEventListener('click', () => {
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();
        
        if (message) {
            socket.emit('chat_message', { message });
            messageInput.value = '';
        }
    });

    // Enter key for chat
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-message').click();
        }
    });

    // End Session Handler
    document.getElementById('end-session').addEventListener('click', () => {
        if (confirm('Are you sure you want to end this session?')) {
            socket.emit('end_session');
            window.location.href = '/';
        }
    });

    // Save Snippet Handler
    document.getElementById('save-snippet').addEventListener('click', async () => {
        const code = editor.getValue();
        const language = document.getElementById('language-select').value;
        const title = prompt('Enter a title for this snippet:');
        
        if (!title) return;
        
        try {
            const response = await fetch('/api/snippets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code,
                    language,
                    title,
                    description: `Saved from collaboration session ${sessionId}`
                })
            });
            
            const data = await response.json();
            if (data.error) {
                alert('Error saving snippet: ' + data.error);
            } else {
                alert('Snippet saved successfully!');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error saving snippet. Please try again.');
        }
    });

    // Loading state management
    function showLoading(type = 'wave') {
        const waveLoader = document.getElementById('loadingContainer');
        const pulseLoader = document.getElementById('pulseLoader');
        
        if (type === 'wave') {
            waveLoader.style.display = 'flex';
            pulseLoader.style.display = 'none';
        } else {
            waveLoader.style.display = 'none';
            pulseLoader.style.display = 'flex';
        }
    }

    function hideLoading() {
        document.getElementById('loadingContainer').style.display = 'none';
        document.getElementById('pulseLoader').style.display = 'none';
    }

    // Update existing code generation function
    async function generateCode() {
        showLoading('wave');
        try {
            const prompt = document.getElementById('promptInput').value;
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt })
            });
            
            if (!response.ok) throw new Error('Failed to generate code');
            
            const data = await response.json();
            document.getElementById('generatedCode').textContent = data.code;
            
            // Show result with animation
            const resultSection = document.querySelector('.result-section');
            resultSection.classList.add('visible');
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate code. Please try again.');
        } finally {
            hideLoading();
        }
    }

    // Update existing code optimization function
    async function optimizeCode() {
        showLoading('pulse');
        try {
            const code = document.getElementById('generatedCode').textContent;
            const response = await fetch('/optimize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });
            
            if (!response.ok) throw new Error('Failed to optimize code');
            
            const data = await response.json();
            document.getElementById('generatedCode').textContent = data.optimizedCode;
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to optimize code. Please try again.');
        } finally {
            hideLoading();
        }
    }

    // Socket Event Handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('join_session', { session_id: sessionId });
    });

    socket.on('session_joined', (data) => {
        console.log('Joined session:', data);
        if (data.code) {
            editor.setValue(data.code);
        }
        if (data.language) {
            document.getElementById('language-select').value = data.language;
            editor.setOption('mode', data.language);
        }
        updateParticipantsList(data.participants);
    });

    socket.on('code_updated', (data) => {
        const currentCursor = editor.getCursor();
        editor.setValue(data.code);
        editor.setCursor(currentCursor);
        if (data.language) {
            document.getElementById('language-select').value = data.language;
            editor.setOption('mode', data.language);
        }
    });

    socket.on('chat_message', (data) => {
        addMessageToChat(data);
    });

    socket.on('participant_joined', (data) => {
        updateParticipantsList(data.participants);
        addMessageToChat({
            sender: 'System',
            message: `${data.participant} joined the session`
        });
    });

    socket.on('participant_left', (data) => {
        updateParticipantsList(data.participants);
        addMessageToChat({
            sender: 'System',
            message: `${data.participant} left the session`
        });
    });

    socket.on('user_typing', (data) => {
        const typingIndicator = document.getElementById('typing-indicator');
        if (data.typing) {
            typingIndicator.textContent = `${data.participant} is typing...`;
        } else {
            typingIndicator.textContent = '';
        }
    });

    socket.on('session_ended', (data) => {
        alert(data.message);
        window.location.href = '/';
    });

    // Helper Functions
    function addMessageToChat(data) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${data.sender === 'You' ? 'own' : 'other'}`;
        
        const senderSpan = document.createElement('strong');
        senderSpan.textContent = data.sender + ': ';
        
        const messageSpan = document.createElement('span');
        messageSpan.textContent = data.message;
        
        messageDiv.appendChild(senderSpan);
        messageDiv.appendChild(messageSpan);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateParticipantsList(participants) {
        const participantsList = document.getElementById('participants-list');
        participantsList.innerHTML = participants.map(participant => 
            `<div class="participant">
                <i class="bi bi-person-fill"></i> ${participant}
            </div>`
        ).join('');
    }
});
