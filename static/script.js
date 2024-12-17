document.addEventListener('DOMContentLoaded', function() {
    // Initialize CodeMirror editor
    let editor = CodeMirror.fromTextArea(document.getElementById('generatedCode'), {
        mode: 'python',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        readOnly: false,
        styleActiveLine: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        scrollbarStyle: 'overlay'
    });

    // Function to update editor mode based on selected language
    function updateEditorMode(language) {
        const modeMap = {
            'python': 'python',
            'javascript': 'javascript',
            'typescript': 'javascript',
            'java': 'text/x-java',
            'cpp': 'text/x-c++src',
            'csharp': 'text/x-csharp',
            'go': 'go',
            'rust': 'rust',
            'php': 'php'
        };
        editor.setOption('mode', modeMap[language] || language);
    }

    // Loading animations
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

    // Function to show loading state
    function setLoading(loading) {
        const generateButton = document.getElementById('generateButton');
        const progressBar = document.getElementById('generation-progress');
        const status = document.getElementById('generation-status');
        
        generateButton.disabled = loading;
        progressBar.classList.toggle('d-none', !loading);
        status.textContent = loading ? 'Generating code...' : '';
    }

    // Generate code
    window.generateCode = async function() {
        try {
            const prompt = document.getElementById('promptInput').value;
            const language = document.getElementById('languageSelect').value;
            
            if (!prompt) {
                alert('Please enter a prompt');
                return;
            }
            
            showLoading('wave');
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt, language })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate code');
            }
            
            editor.setValue(data.code);
            
            // Format and update explanation
            const explanation = data.explanation || '';
            const formattedExplanation = explanation.split('\n').map(line => {
                line = line.trim();
                if (line.startsWith('- ')) {
                    return `<li class="mb-2">${line.substring(2)}</li>`;
                } else if (line.match(/^\d+\./)) {
                    return `<li class="mb-2">${line}</li>`;
                } else if (line.length > 0) {
                    return `<p class="mb-3">${line}</p>`;
                }
                return '';
            }).join('');
            document.getElementById('code-explanation').innerHTML = `<div class="explanation-content">${formattedExplanation}</div>`;
            
            // Format and update future steps
            const futureSteps = data.futureSteps || '';
            const formattedSteps = futureSteps.split('\n').map(line => {
                line = line.trim();
                if (line.startsWith('- ')) {
                    return `<li class="mb-2">${line.substring(2)}</li>`;
                } else if (line.match(/^\d+\./)) {
                    return `<li class="mb-2">${line}</li>`;
                } else if (line.length > 0) {
                    return `<p class="mb-3">${line}</p>`;
                }
                return '';
            }).join('');
            document.getElementById('future-prediction').innerHTML = `<div class="future-steps-content">${formattedSteps}</div>`;
            
        } catch (error) {
            console.error('Error:', error);
            alert(error.message || 'Failed to generate code. Please try again.');
        } finally {
            hideLoading();
        }
    }

    // Analyze code
    async function analyzeCode(code) {
        showLoading('pulse');
        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });
            
            if (!response.ok) {
                throw new Error('Failed to analyze code');
            }
            
            const data = await response.json();
            updateAnalysis(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            hideLoading();
        }
    }

    // Update analysis results
    function updateAnalysis(data) {
        document.getElementById('bugsList').innerHTML = formatList(data.bugs);
        document.getElementById('qualityList').innerHTML = formatList(data.quality);
        document.getElementById('performanceList').innerHTML = formatList(data.performance);
        document.getElementById('securityList').innerHTML = formatList(data.security);
        
        document.getElementById('docParameters').innerHTML = formatParameters(data.parameters);
        document.getElementById('docExamples').textContent = data.examples;
    }

    // Format list items
    function formatList(items) {
        return items.map(item => `<li><i class="bi bi-info-circle"></i> ${item}</li>`).join('');
    }

    // Format parameters
    function formatParameters(params) {
        return params.map(param => `
            <li>
                <strong>${param.name}</strong>: ${param.description}
                ${param.type ? `<span class="text-muted">(${param.type})</span>` : ''}
            </li>
        `).join('');
    }

    // Helper function to format text with basic HTML
    function formatText(text) {
        if (!text) return '';
        return text.split('\n').map(line => {
            line = line.trim();
            if (line.startsWith('- ')) {
                return `<li>${line.substring(2)}</li>`;
            } else if (line.match(/^\d+\./)) {
                return `<li>${line}</li>`;
            }
            return `<p>${line}</p>`;
        }).join('');
    }

    // Copy to clipboard
    window.copyToClipboard = async function() {
        const code = editor.getValue();
        try {
            await navigator.clipboard.writeText(code);
            const copyButton = document.querySelector('.btn-outline-secondary');
            const originalHTML = copyButton.innerHTML;
            copyButton.innerHTML = '<i class="bi bi-check"></i> Copied!';
            setTimeout(() => {
                copyButton.innerHTML = originalHTML;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard. Please try again.');
        }
    }

    // Share code
    window.shareCode = async function() {
        try {
            const code = editor.getValue();
            const language = document.getElementById('languageSelect').value;
            
            showLoading('pulse');
            const response = await fetch('/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language })
            });
            
            if (!response.ok) {
                throw new Error('Failed to share code');
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Show sharing modal with link
            const shareModal = new bootstrap.Modal(document.getElementById('shareModal'));
            const shareLink = document.getElementById('share-link');
            if (shareLink) {
                shareLink.value = window.location.origin + '/shared/' + data.shareId;
            }
            shareModal.show();
            
        } catch (error) {
            console.error('Error sharing code:', error);
            alert('Error sharing code: ' + error.message);
        } finally {
            hideLoading();
        }
    }

    // Function to save snippet
    async function saveSnippet() {
        const code = editor.getValue();
        const language = document.getElementById('languageSelect').value;
        
        if (!code) {
            alert('No code to save');
            return;
        }
        
        const title = prompt('Enter a title for this snippet:');
        if (!title) return;
        
        const description = prompt('Enter a description (optional):');
        
        try {
            const response = await fetch('/api/snippets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language, title, description })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            alert('Snippet saved successfully!');
            
        } catch (error) {
            alert('Error saving snippet: ' + error.message);
        }
    }

    // Function to load history
    window.loadHistory = async function() {
        try {
            showLoading('pulse');
            const response = await fetch('/history');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to load history');
            }
            
            const historyList = document.getElementById('historyContent');
            if (!historyList) {
                throw new Error('History list element not found');
            }
            
            historyList.innerHTML = '';
            
            if (!data.history || data.history.length === 0) {
                historyList.innerHTML = '<div class="text-center text-muted p-3">No history items found</div>';
                return;
            }
            
            data.history.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item p-3 border-bottom';
                historyItem.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between">
                                <h6 class="mb-1">Language: ${item.language}</h6>
                                <small class="text-muted">${new Date(item.timestamp).toLocaleString()}</small>
                            </div>
                            <p class="mb-2 text-wrap">${item.prompt}</p>
                            <button class="btn btn-sm btn-outline-primary" onclick="loadHistoryItem('${item.id}')">
                                Load Code
                            </button>
                        </div>
                    </div>
                `;
                historyList.appendChild(historyItem);
            });
            
            const historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
            historyModal.show();
            
        } catch (error) {
            console.error('Error loading history:', error);
            alert('Error loading history: ' + error.message);
        } finally {
            hideLoading();
        }
    }

    // Function to load a specific history item
    window.loadHistoryItem = async function(historyId) {
        try {
            showLoading('wave');
            const response = await fetch(`/history/${historyId}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to load history item');
            }
            
            editor.setValue(data.code || '');
            
            // Update language selector if available
            const languageSelect = document.getElementById('languageSelect');
            if (languageSelect && data.language) {
                languageSelect.value = data.language;
                updateEditorMode(data.language);
            }
            
            // Update prompt if available
            const promptInput = document.getElementById('promptInput');
            if (promptInput && data.prompt) {
                promptInput.value = data.prompt;
            }
            
            // Close the history modal
            const historyModal = bootstrap.Modal.getInstance(document.getElementById('historyModal'));
            if (historyModal) {
                historyModal.hide();
            }
            
        } catch (error) {
            console.error('Error loading history item:', error);
            alert('Error loading history item: ' + error.message);
        } finally {
            hideLoading();
        }
    }

    // Function to load snippets
    async function loadSnippets() {
        try {
            const response = await fetch('/api/snippets');
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            const snippetsList = document.getElementById('snippets-list');
            snippetsList.innerHTML = '';
            
            data.snippets.forEach(snippet => {
                const snippetItem = document.createElement('div');
                snippetItem.className = 'list-group-item';
                snippetItem.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="mb-1">${snippet.title}</h6>
                            <p class="mb-1">${snippet.description || ''}</p>
                            <small class="text-muted">Language: ${snippet.language} | Created: ${new Date(snippet.timestamp).toLocaleString()}</small>
                        </div>
                        <button class="btn btn-sm btn-outline-primary" onclick="loadSnippet(${snippet.id})">
                            Load
                        </button>
                    </div>
                `;
                snippetsList.appendChild(snippetItem);
            });
            
            const modal = new bootstrap.Modal(document.getElementById('snippets-modal'));
            modal.show();
            
        } catch (error) {
            alert('Error loading snippets: ' + error.message);
        }
    }

    // Function to load a specific snippet
    async function loadSnippet(snippetId) {
        try {
            const snippets = (await (await fetch('/api/snippets')).json()).snippets;
            const snippet = snippets.find(s => s.id === snippetId);
            
            if (!snippet) {
                throw new Error('Snippet not found');
            }
            
            editor.setValue(snippet.code);
            document.getElementById('languageSelect').value = snippet.language;
            updateEditorMode(snippet.language);
            
            bootstrap.Modal.getInstance(document.getElementById('snippets-modal')).hide();
            
        } catch (error) {
            alert('Error loading snippet: ' + error.message);
        }
    }

    // Collaboration
    const collaborateButton = document.getElementById('collaborate-button');
    const collaborateModal = new bootstrap.Modal(document.getElementById('collaborateModal'));
    const startCollaborationButton = document.getElementById('start-collaboration');
    const usernameInput = document.getElementById('username');

    collaborateButton.addEventListener('click', () => {
        usernameInput.value = localStorage.getItem('username') || '';
        collaborateModal.show();
    });

    startCollaborationButton.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (!username) {
            alert('Please enter your name');
            return;
        }

        localStorage.setItem('username', username);
        
        // Get current code and language
        const code = editor.getValue();
        const language = document.getElementById('languageSelect').value;
        
        // Create new session
        window.location.href = `/collaborate`;
    });

    // Event listener for language change
    document.getElementById('languageSelect').addEventListener('change', function(e) {
        updateEditorMode(e.target.value);
    });

    // Add click event listener to the generate button
    const generateButton = document.getElementById('generateButton');
    if (generateButton) {
        generateButton.addEventListener('click', generateCode);
    }

    // Add click event listener to the copy button
    const copyButton = document.querySelector('.copy-button');
    if (copyButton) {
        copyButton.addEventListener('click', copyToClipboard);
    }

    // Initialize the first tab
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        activeTab.click();
    }
});
