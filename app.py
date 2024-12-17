from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from datetime import datetime, timedelta
import os
import logging
import uuid
import json
import requests
from dotenv import load_dotenv
from database import (
    init_db, save_snippet, get_snippets, get_snippet,
    save_generation_history, get_generation_history,
    create_collaboration_session, get_collaboration_session,
    update_collaboration_code, save_collaboration_message,
    get_collaboration_messages, end_collaboration_session,
    save_shared_code, get_shared_code
)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# OpenRouter API configuration
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY')
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

def generate_code_with_ai(prompt, language):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:5005",
        "X-Title": "Code Generation IDE",
        "Content-Type": "application/json"
    }
    
    # Enhanced prompt with emphasis on correctness and testing
    system_prompt = f"""You are an expert programmer focused on generating accurate, tested code in {language}.
    Follow these guidelines strictly:
    1. Write code that is not just syntactically correct, but also logically correct
    2. Test the code with example inputs before providing it
    3. Verify all mathematical and logical operations
    4. Include input validation and error handling
    5. Add comments explaining the logic and any assumptions
    6. Follow {language} best practices and conventions
    
    Important:
    - Double-check all calculations and conversions
    - Test edge cases and boundary conditions
    - Ensure the code produces correct output for all valid inputs
    
    User request: {prompt}
    
    Before responding:
    1. Write the code
    2. Test it with sample inputs
    3. Verify the output is correct
    4. Only then provide the final, tested code"""
    
    data = {
        "model": "google/gemini-pro",
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    }
    
    try:
        logger.debug(f"Sending request to OpenRouter with data: {json.dumps(data, indent=2)}")
        response = requests.post(OPENROUTER_API_URL, headers=headers, json=data)
        
        if not response.ok:
            error_text = response.text
            try:
                error_json = response.json()
                if 'error' in error_json and isinstance(error_json['error'], dict):
                    error_text = error_json['error'].get('message', error_text)
            except:
                pass
            logger.error(f"OpenRouter API Error: {response.status_code} - {error_text}")
            raise Exception(f"OpenRouter API Error: {error_text}")
            
        result = response.json()
        logger.debug(f"OpenRouter API Response: {json.dumps(result, indent=2)}")
        
        if 'error' in result:
            error_message = result['error'].get('message', 'Unknown error')
            raise Exception(f"OpenRouter API Error: {error_message}")
        
        # Extract the generated code from the response
        if isinstance(result, dict):
            if 'choices' in result and len(result['choices']) > 0:
                message = result['choices'][0].get('message', {})
                if isinstance(message, dict) and 'content' in message:
                    generated_code = message['content']
            elif 'response' in result:
                generated_code = result['response']
            else:
                for key in result.keys():
                    logger.debug(f"Found key in response: {key}")
                raise Exception(f"Unexpected API response format. Keys found: {', '.join(result.keys())}")
        else:
            raise Exception(f"Unexpected API response type: {type(result)}")
        
        if not generated_code:
            raise Exception("No code was generated in the response")
            
        # Clean up the code by removing markdown code blocks if present
        if generated_code.startswith('```') and generated_code.endswith('```'):
            generated_code = '\n'.join(generated_code.split('\n')[1:-1])
        
        # Generate explanation with enhanced focus on correctness
        explanation_data = {
            "model": "google/gemini-pro",
            "messages": [
                {
                    "role": "user",
                    "content": f"""Explain in detail how this {language} code works, focusing on:
                    1. The correctness of the implementation
                    2. How it handles edge cases
                    3. Any potential limitations or assumptions
                    4. The expected output for different inputs
                    
                    Code:
                    {generated_code}"""
                }
            ]
        }
        
        explanation_response = requests.post(OPENROUTER_API_URL, headers=headers, json=explanation_data)
        if not explanation_response.ok:
            logger.error(f"OpenRouter API Error (Explanation): {explanation_response.status_code} - {explanation_response.text}")
            explanation = "Error: Could not generate explanation"
        else:
            explanation_result = explanation_response.json()
            logger.debug(f"OpenRouter API Explanation Response: {json.dumps(explanation_result, indent=2)}")
            if 'choices' in explanation_result:
                explanation = explanation_result['choices'][0]['message']['content']
            else:
                explanation = explanation_result.get('response', "Error: Could not parse explanation response")
        
        # Generate future steps with focus on improvements and testing
        future_steps_data = {
            "model": "google/gemini-pro",
            "messages": [
                {
                    "role": "user",
                    "content": f"""What are the next steps to improve this {language} code? Consider:
                    1. Additional test cases needed
                    2. Edge cases that should be handled
                    3. Performance optimizations
                    4. Better error handling
                    5. Code organization and maintainability
                    
                    Code:
                    {generated_code}"""
                }
            ]
        }
        
        future_steps_response = requests.post(OPENROUTER_API_URL, headers=headers, json=future_steps_data)
        if not future_steps_response.ok:
            logger.error(f"OpenRouter API Error (Future Steps): {future_steps_response.status_code} - {future_steps_response.text}")
            future_steps = "Error: Could not generate future steps"
        else:
            future_steps_result = future_steps_response.json()
            logger.debug(f"OpenRouter API Future Steps Response: {json.dumps(future_steps_result, indent=2)}")
            if 'choices' in future_steps_result:
                future_steps = future_steps_result['choices'][0]['message']['content']
            else:
                future_steps = future_steps_result.get('response', "Error: Could not parse future steps response")
        
        return generated_code, explanation, future_steps
        
    except Exception as e:
        logger.error(f"Error generating code with AI: {str(e)}")
        raise

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'your-secret-key')
socketio = SocketIO(app)

init_db()

active_sessions = {}

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/editor')
def editor():
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
def generate_code():
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        language = data.get('language', 'python')
        
        logger.debug(f"Generating code for prompt: {prompt}, language: {language}")
        
        generated_code, explanation, future_steps = generate_code_with_ai(prompt, language)
        
        save_generation_history(prompt, generated_code, language, explanation, future_steps)

        return jsonify({
            'code': generated_code,
            'explanation': explanation,
            'futureSteps': future_steps,
            'message': 'Code generated successfully'
        })
    except Exception as e:
        logger.error(f"Error generating code: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_code():
    try:
        data = request.get_json()
        code = data.get('code', '')
        
        # Perform code analysis (placeholder)
        analysis = {
            'bugs': ['No syntax errors found'],
            'quality': ['Code follows standard conventions'],
            'performance': ['No obvious performance issues'],
            'security': ['No security vulnerabilities detected'],
            'parameters': [
                {'name': 'input', 'description': 'Sample parameter', 'type': 'string'}
            ],
            'examples': 'Example usage:\nprint("Hello, World!")'
        }
        
        return jsonify(analysis)
    except Exception as e:
        logger.error(f"Error analyzing code: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/snippets', methods=['GET', 'POST'])
def handle_snippets():
    try:
        if request.method == 'POST':
            data = request.get_json()
            code = data.get('code')
            language = data.get('language')
            title = data.get('title')
            description = data.get('description')

            if not all([code, language, title]):
                return jsonify({'error': 'Code, language, and title are required'}), 400

            snippet_id = save_snippet(title, description, code, language)
            return jsonify({'message': 'Snippet saved successfully', 'snippetId': snippet_id})
        else:
            snippets = get_snippets()
            return jsonify({'snippets': snippets})

    except Exception as e:
        logger.error(f"Error handling snippets: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/history', methods=['GET'])
def get_history():
    try:
        history = get_generation_history()
        return jsonify({'history': history})
    except Exception as e:
        logger.error(f"Error getting history: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/history/<history_id>', methods=['GET'])
def get_history_item(history_id):
    try:
        history = get_generation_history()
        item = next((h for h in history if h['id'] == history_id), None)
        
        if not item:
            return jsonify({'error': 'History item not found'}), 404
            
        return jsonify(item)
    except Exception as e:
        logger.error(f"Error getting history item: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/share', methods=['POST'])
def share_code():
    try:
        data = request.get_json()
        code = data.get('code')
        language = data.get('language', 'text')

        if not code:
            return jsonify({'error': 'Code is required'}), 400

        share_id = f"share_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        expires = (datetime.now() + timedelta(days=7)).isoformat()
        
        save_shared_code(share_id, code, language, expires)

        return jsonify({
            'message': 'Code shared successfully',
            'shareId': share_id
        })

    except Exception as e:
        logger.error(f"Error sharing code: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/shared/<share_id>')
def view_shared_code(share_id):
    try:
        shared_code = get_shared_code(share_id)
        
        if not shared_code:
            return render_template('error.html', message='Shared code not found or has expired'), 404
        
        if datetime.fromisoformat(shared_code['expires']) < datetime.now():
            return render_template('error.html', message='Shared code has expired'), 410
        
        return render_template('shared.html', code=shared_code)
    except Exception as e:
        logger.error(f"Error viewing shared code: {str(e)}")
        return render_template('error.html', message='Error viewing shared code'), 500

@app.route('/collaborate', methods=['GET', 'POST'])
def collaborate():
    if request.method == 'POST':
        session_id = request.form.get('session_id')
        if not session_id:
            session_id = str(uuid.uuid4())
            create_collaboration_session(session_id, '')
        return render_template('collaborate.html', session_id=session_id)
    else:
        session_id = str(uuid.uuid4())
        return render_template('collaborate.html', session_id=session_id)

@app.route('/collaborate/<session_id>')
def join_collaborate(session_id):
    return render_template('collaborate.html', session_id=session_id)

@socketio.on('join_session')
def handle_join_session(data):
    session_id = data.get('session_id')
    username = data.get('username', f"User_{str(uuid.uuid4())[:8]}")
    
    if not session_id:
        return
        
    join_room(session_id)
    session['session_id'] = session_id
    session['username'] = username
    
    collab_session = get_collaboration_session(session_id)
    if collab_session:
        code = collab_session.get('code', '')
        language = collab_session.get('language', 'python')
    else:
        code = ''
        language = 'python'
        create_collaboration_session(session_id, username)
    
    if session_id not in active_sessions:
        active_sessions[session_id] = {'participants': set()}
    active_sessions[session_id]['participants'].add(username)
    
    emit('participant_joined', {
        'participant': username,
        'participants': list(active_sessions[session_id]['participants'])
    }, room=session_id)
    
    emit('session_joined', {
        'code': code,
        'language': language,
        'participants': list(active_sessions[session_id]['participants'])
    })

@socketio.on('leave_session')
def handle_leave_session(data):
    session_id = session.get('session_id')
    username = session.get('username')
    
    if not session_id or not username:
        return
    
    leave_room(session_id)
    
    if session_id in active_sessions:
        active_sessions[session_id]['participants'].discard(username)
        
        emit('participant_left', {
            'participant': username,
            'participants': list(active_sessions[session_id]['participants'])
        }, room=session_id)
        
        if not active_sessions[session_id]['participants']:
            del active_sessions[session_id]
            end_collaboration_session(session_id)

@socketio.on('code_change')
def handle_code_change(data):
    session_id = session.get('session_id')
    if not session_id:
        return
        
    code = data.get('code', '')
    language = data.get('language', 'python')
    
    update_collaboration_code(session_id, code, language)
    
    emit('code_updated', {
        'code': code,
        'language': language
    }, room=session_id, include_self=False)

@socketio.on('chat_message')
def handle_chat_message(data):
    session_id = session.get('session_id')
    username = session.get('username')
    
    if not session_id or not username:
        return
        
    message = data.get('message', '').strip()
    if not message:
        return
        
    message_id = save_collaboration_message(session_id, username, message)
    
    emit('chat_message', {
        'id': message_id,
        'sender': username,
        'message': message,
        'timestamp': datetime.now().isoformat()
    }, room=session_id)

@socketio.on('typing')
def handle_typing(data):
    session_id = session.get('session_id')
    username = session.get('username')
    
    if not session_id or not username:
        return
        
    is_typing = data.get('typing', False)
    
    emit('user_typing', {
        'participant': username,
        'typing': is_typing
    }, room=session_id, include_self=False)

@socketio.on('end_session')
def handle_end_session(data):
    session_id = session.get('session_id')
    username = session.get('username')
    
    if not session_id or not username:
        return
        
    end_collaboration_session(session_id)
    
    if session_id in active_sessions:
        del active_sessions[session_id]
    
    emit('session_ended', {
        'message': f'Session ended by {username}'
    }, room=session_id)

if __name__ == '__main__':
    port = 5008  # Starting port
    max_retries = 10
    
    for current_port in range(port, port + max_retries):
        try:
            print(f"Attempting to start server on port {current_port}...")
            socketio.run(app, debug=True, port=current_port, host='127.0.0.1', allow_unsafe_werkzeug=True)
            break  # If successful, break out of the loop
        except OSError as e:
            print(f"Port {current_port} is in use, trying next port...")
            if current_port == port + max_retries - 1:
                print("Error: Could not find an available port after trying multiple ports.")
                raise e
