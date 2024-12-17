import sqlite3
from datetime import datetime

def get_db():
    conn = sqlite3.connect('code_generator.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Create snippets table
    c.execute('''
        CREATE TABLE IF NOT EXISTS snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            code TEXT NOT NULL,
            language TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    
    # Create history table
    c.execute('''
        CREATE TABLE IF NOT EXISTS generation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            code TEXT NOT NULL,
            language TEXT NOT NULL,
            explanation TEXT,
            future_steps TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    
    # Create shared_code table
    c.execute('''
        CREATE TABLE IF NOT EXISTS shared_code (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            language TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    ''')
    
    # Create collaboration_sessions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS collaboration_sessions (
            id TEXT PRIMARY KEY,
            creator_name TEXT NOT NULL,
            code TEXT,
            language TEXT,
            created_at TEXT NOT NULL,
            active INTEGER DEFAULT 1
        )
    ''')
    
    # Create collaboration_messages table
    c.execute('''
        CREATE TABLE IF NOT EXISTS collaboration_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id)
        )
    ''')
    
    conn.commit()
    conn.close()

def save_snippet(title, description, code, language):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO snippets (title, description, code, language, created_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (title, description, code, language, datetime.now().isoformat()))
    conn.commit()
    snippet_id = c.lastrowid
    conn.close()
    return snippet_id

def get_snippets():
    conn = get_db()
    snippets = conn.execute('SELECT * FROM snippets ORDER BY created_at DESC').fetchall()
    conn.close()
    return [dict(snippet) for snippet in snippets]

def get_snippet(snippet_id):
    conn = get_db()
    snippet = conn.execute('SELECT * FROM snippets WHERE id = ?', (snippet_id,)).fetchone()
    conn.close()
    return dict(snippet) if snippet else None

def save_generation_history(prompt, code, language, explanation, future_steps):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO generation_history 
        (prompt, code, language, explanation, future_steps, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (prompt, code, language, explanation, future_steps, datetime.now().isoformat()))
    conn.commit()
    history_id = c.lastrowid
    conn.close()
    return history_id

def get_generation_history():
    conn = get_db()
    history = conn.execute('SELECT * FROM generation_history ORDER BY created_at DESC').fetchall()
    conn.close()
    return [dict(entry) for entry in history]

def save_shared_code(share_id, code, language, expires_at):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO shared_code (id, code, language, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (share_id, code, language, datetime.now().isoformat(), expires_at))
    conn.commit()
    conn.close()
    return share_id

def get_shared_code(share_id):
    conn = get_db()
    shared = conn.execute('SELECT * FROM shared_code WHERE id = ?', (share_id,)).fetchone()
    conn.close()
    return dict(shared) if shared else None

# Collaboration functions
def create_collaboration_session(session_id, creator_name):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO collaboration_sessions (id, creator_name, created_at)
        VALUES (?, ?, ?)
    ''', (session_id, creator_name, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def get_collaboration_session(session_id):
    conn = get_db()
    session = conn.execute(
        'SELECT * FROM collaboration_sessions WHERE id = ? AND active = 1', 
        (session_id,)
    ).fetchone()
    conn.close()
    return dict(session) if session else None

def update_collaboration_code(session_id, code, language):
    conn = get_db()
    conn.execute('''
        UPDATE collaboration_sessions 
        SET code = ?, language = ? 
        WHERE id = ? AND active = 1
    ''', (code, language, session_id))
    conn.commit()
    conn.close()

def save_collaboration_message(session_id, sender, message):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO collaboration_messages (session_id, sender, message, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (session_id, sender, message, datetime.now().isoformat()))
    conn.commit()
    message_id = c.lastrowid
    conn.close()
    return message_id

def get_collaboration_messages(session_id, limit=50):
    conn = get_db()
    messages = conn.execute('''
        SELECT * FROM collaboration_messages 
        WHERE session_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
    ''', (session_id, limit)).fetchall()
    conn.close()
    return [dict(msg) for msg in messages][::-1]  # Reverse to get chronological order

def end_collaboration_session(session_id):
    conn = get_db()
    conn.execute('''
        UPDATE collaboration_sessions 
        SET active = 0 
        WHERE id = ?
    ''', (session_id,))
    conn.commit()
    conn.close()
