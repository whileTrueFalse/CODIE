import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_gemini_api():
    try:
        # Configure the Gemini API
        genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
        
        # Create a model instance
        model = genai.GenerativeModel('gemini-pro')
        
        # Test prompt
        prompt = "Write a Python function that calculates the factorial of a number"
        
        # Generate response
        response = model.generate_content(prompt)
        
        print("API Test Result:")
        print("-" * 50)
        print(response.text)
        print("-" * 50)
        return True
            
    except Exception as e:
        print(f"Error testing Gemini API: {str(e)}")
        return False

if __name__ == "__main__":
    print("Testing Gemini API integration...")
    success = test_gemini_api()
    if success:
        print("[SUCCESS] API test completed successfully!")
    else:
        print("[ERROR] API test failed!")
