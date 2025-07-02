document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const startButton = document.getElementById('start-button');
    const buttonText = document.getElementById('button-text');
    const statusText = document.getElementById('status');
    const chatMessages = document.getElementById('chat-messages');
    
    // Set your API key directly here
    const apiKey = 'AIzaSyBYbhtm_JnQTbD4Z82ZqH_lYB_fF0qPbLo'; // Replace with your actual Gemini API key
    
    let recognition;
    let isListening = false;
    let permissionGranted = false;
    
    // Initialize the app with the API key already set
    startButton.disabled = false;
    
    // Check microphone permissions on load
    checkMicrophonePermission();
    
    // Permission handling functions
    async function checkMicrophonePermission() {
        try {
            // Check if we can get permission state
            if (navigator.permissions && navigator.permissions.query) {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                
                if (permissionStatus.state === 'granted') {
                    permissionGranted = true;
                    statusText.textContent = 'Ready to listen. Click the microphone button.';
                } else if (permissionStatus.state === 'prompt') {
                    statusText.textContent = 'Click microphone to grant permission.';
                } else if (permissionStatus.state === 'denied') {
                    statusText.textContent = '❗ Microphone access denied. Please enable in browser settings.';
                    startButton.classList.add('disabled');
                }
                
                // Listen for permission changes
                permissionStatus.onchange = function() {
                    checkMicrophonePermission();
                };
            } else {
                // Fallback for browsers that don't support permission API
                statusText.textContent = 'Ready to listen. Click the microphone button.';
            }
        } catch (error) {
            console.error('Permission check error:', error);
            statusText.textContent = 'Ready to listen. Click the microphone button.';
        }
    }
    
    // Function to request microphone access once at startup
    async function requestMicrophoneAccess() {
        if (permissionGranted) return true;
        
        try {
            // Get user media to trigger permission request
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // If we get here, permission was granted
            permissionGranted = true;
            
            // Stop all tracks to release the microphone
            stream.getTracks().forEach(track => track.stop());
            
            statusText.textContent = 'Ready to listen. Click the microphone button.';
            return true;
        } catch (error) {
            console.error('Microphone access error:', error);
            statusText.textContent = '❗ Could not access microphone. Please check permissions.';
            return false;
        }
    }
    
    // Show processing indicator
    function showProcessingIndicator() {
        const indicator = document.getElementById('processing-indicator');
        if (indicator) indicator.style.display = 'flex';
    }

    // Hide processing indicator
    function hideProcessingIndicator() {
        const indicator = document.getElementById('processing-indicator');
        if (indicator) indicator.style.display = 'none';
    }

    // Show speaking indicator
    function showSpeakingIndicator() {
        const indicator = document.getElementById('speaking-indicator');
        if (indicator) indicator.style.display = 'flex';
    }

    // Hide speaking indicator
    function hideSpeakingIndicator() {
        const indicator = document.getElementById('speaking-indicator');
        if (indicator) indicator.style.display = 'none';
    }
    
    // Set up speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onstart = () => {
            isListening = true;
            startButton.classList.add('listening');
            buttonText.textContent = 'Listening...';
            statusText.textContent = 'I\'m listening...';
        };
        
        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            stopListening();
            addMessage('user', transcript);
            
            statusText.textContent = 'Processing your request...';
            showProcessingIndicator(); // Show processing animation
            
            try {
                const response = await getGeminiResponse(transcript);
                hideProcessingIndicator(); // Hide processing animation
                addMessage('assistant', response);
                speakResponse(response);
            } catch (error) {
                hideProcessingIndicator(); // Hide processing animation
                statusText.textContent = `Error: ${error.message}`;
                addMessage('assistant', `I'm sorry, there was an error: ${error.message}`);
            }
        };
        
        recognition.onerror = (event) => {
            stopListening();
            
            if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                permissionGranted = false;
                statusText.textContent = '❗ Microphone access denied. Please enable in browser settings.';
            } else {
                statusText.textContent = `Error: ${event.error}`;
            }
        };
        
        recognition.onend = () => {
            stopListening();
        };
        
        // Request microphone access once when the page loads
        requestMicrophoneAccess().then(granted => {
            if (!granted) {
                // Add info to tell users how to enable microphone
                const permissionMessage = document.createElement('div');
                permissionMessage.className = 'message assistant';
                permissionMessage.innerHTML = `
                    <p><strong>Microphone access needed</strong></p>
                    <p>This voice assistant requires microphone access to work. Please allow microphone access when prompted.</p>
                    <p>If you denied permission, you can click the 🔒 or 🎤 icon in your browser's address bar to change settings.</p>
                `;
                chatMessages.appendChild(permissionMessage);
            }
        });
        
    } else {
        startButton.disabled = true;
        statusText.textContent = 'Speech recognition is not supported in your browser.';
    }
    
    // Toggle listening
    startButton.addEventListener('click', async () => {
        if (!isListening) {
            // If permission isn't granted, try to get it first
            if (!permissionGranted) {
                const granted = await requestMicrophoneAccess();
                if (!granted) return;
            }
            startListening();
        } else {
            stopListening();
        }
    });
    
    // Start listening
    function startListening() {
        try {
            recognition.start();
        } catch (error) {
            statusText.textContent = `Couldn't start listening: ${error.message}`;
        }
    }
    
    // Stop listening
    function stopListening() {
        isListening = false;
        startButton.classList.remove('listening');
        buttonText.textContent = 'Click to Speak';
        
        try {
            recognition.stop();
        } catch (error) {
            // Ignore errors when stopping
        }
    }
    
    // Add message to chat
    function addMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        
        const messageText = document.createElement('p');
        messageText.textContent = text;
        
        messageDiv.appendChild(messageText);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Get response from Gemini API with improved prompt
    async function getGeminiResponse(userInput) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        
        // Simple prompt instruction to generate better voice responses
        const promptInstruction = 
            "You are a helpful, friendly voice assistant. Respond in a conversational way with brief, " +
            "simple language that's easy to understand when spoken aloud. Keep answers concise " +
            "but make sure they fully address the user's question. If possible, limit your response to 2-3 " +
            "sentences unless more detail is clearly needed. Speak directly to the user as if having a casual conversation.";
        
        const requestBody = {
            contents: [{
                parts: [
                    { text: promptInstruction },
                    { text: userInput }
                ]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 150  // Limit response length for voice responses
            }
        };
        
        try {
            const response = await fetch(`${url}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Error calling Gemini API');
            }
            
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw error;
        }
    }
    
    // Convert response to speech
    function speakResponse(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
            
            utterance.onstart = () => {
                statusText.textContent = 'Speaking...';
                showSpeakingIndicator(); // Show speaking animation
            };
            
            utterance.onend = () => {
                statusText.textContent = 'Ready to listen. Click the microphone button.';
                hideSpeakingIndicator(); // Hide speaking animation
            };
        } else {
            statusText.textContent = 'Text-to-speech is not supported in your browser.';
        }
    }
    
    // Set up additional UI controls if they exist
    
    // Clear chat history
    const clearChatButton = document.getElementById('clear-chat');
    if (clearChatButton) {
        clearChatButton.addEventListener('click', () => {
            // Keep only the first welcome message
            while (chatMessages.children.length > 1) {
                chatMessages.removeChild(chatMessages.lastChild);
            }
        });
    }

    // Toggle dark/light mode
    const toggleThemeButton = document.getElementById('toggle-theme');
    if (toggleThemeButton) {
        toggleThemeButton.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const themeIcon = toggleThemeButton.querySelector('i');
            if (themeIcon) {
                themeIcon.classList.toggle('fa-moon');
                themeIcon.classList.toggle('fa-sun');
            }
        });
    }

    // About modal
    const aboutLink = document.getElementById('about-link');
    if (aboutLink) {
        aboutLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert('This is a voice assistant powered by Google Gemini. You can ask questions or give commands by speaking to it.');
        });
    }

    // Add keyboard shortcut (spacebar) to activate microphone
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !isListening && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault(); // Prevent scrolling
            startButton.click(); // Use the click handler which handles permissions
        }
    });
});