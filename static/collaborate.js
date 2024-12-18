// Initialize Pusher
fetch('/pusher-config')
    .then(response => response.json())
    .then(config => {
        const pusher = new Pusher(config.key, {
            cluster: config.cluster
        });

        let editor;
        let currentRoom;

        document.addEventListener('DOMContentLoaded', function() {
            // Initialize CodeMirror
            editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
                mode: 'python',
                theme: 'monokai',
                lineNumbers: true,
                autoCloseBrackets: true,
                matchBrackets: true,
                indentUnit: 4,
                tabSize: 4,
                lineWrapping: true,
                styleActiveLine: true
            });

            // Get room ID from URL
            const pathParts = window.location.pathname.split('/');
            currentRoom = pathParts[pathParts.length - 1];

            // Subscribe to the room channel
            const channel = pusher.subscribe(`room-${currentRoom}`);

            // Handle incoming code updates
            channel.bind('code-update', function(data) {
                const currentCursor = editor.getCursor();
                editor.setValue(data.code);
                editor.setCursor(currentCursor);
                
                if (data.language) {
                    updateEditorMode(data.language);
                }

                if (data.cursor) {
                    showRemoteCursor(data.cursor);
                }
            });

            // Handle local changes
            let debounceTimeout;
            editor.on('change', function(cm, change) {
                if (change.origin === 'setValue') return;

                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    sendUpdate({
                        code: cm.getValue(),
                        language: cm.getMode().name,
                        cursor: cm.getCursor()
                    });
                }, 100);
            });

            // Handle cursor movement
            editor.on('cursorActivity', function(cm) {
                if (!currentRoom) return;

                sendUpdate({
                    cursor: cm.getCursor(),
                    code: cm.getValue(),
                    language: cm.getMode().name
                });
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
                sendUpdate({
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
                    sendUpdate({
                        code: data.code,
                        language: language
                    });

                    // Add explanation to chat
                    if (data.explanation) {
                        addMessageToChat({
                            sender: 'System',
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

            // Chat Message Handler
            document.getElementById('send-message').addEventListener('click', () => {
                const messageInput = document.getElementById('message-input');
                const message = messageInput.value.trim();
                
                if (message) {
                    addMessageToChat({
                        sender: 'You',
                        message: message
                    });
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
                            description: `Saved from collaboration session ${currentRoom}`
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

            function sendUpdate(data) {
                fetch(`/collaborate/${currentRoom}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                }).catch(console.error);
            }

            function showRemoteCursor(position) {
                const remoteCursor = document.createElement('div');
                remoteCursor.className = 'remote-cursor';
                
                const coords = editor.charCoords(position, 'local');
                remoteCursor.style.left = `${coords.left}px`;
                remoteCursor.style.top = `${coords.top}px`;
                
                editor.getWrapperElement().appendChild(remoteCursor);
                
                setTimeout(() => remoteCursor.remove(), 2000);
            }

            function updateEditorMode(language) {
                const modeMap = {
                    'python': 'python',
                    'javascript': 'javascript',
                    'java': 'text/x-java',
                    'cpp': 'text/x-c++src',
                    'csharp': 'text/x-csharp',
                    'php': 'php',
                    'ruby': 'ruby',
                    'go': 'go',
                    'rust': 'rust'
                };
                
                editor.setOption('mode', modeMap[language] || language);
            }
        });
    });
