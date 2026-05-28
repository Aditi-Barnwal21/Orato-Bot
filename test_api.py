import requests
import json

try:
    print("Testing API endpoint...")
    response = requests.get('http://localhost:5050/api/diagnose', timeout=5)
    data = response.json()
    print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
