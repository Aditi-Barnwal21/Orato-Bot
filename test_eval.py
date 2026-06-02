import urllib.request
import json

data = json.dumps({
    "question": "test",
    "answer": "test test test"
}).encode('utf-8')

req = urllib.request.Request("http://localhost:5050/api/evaluate-answer", data=data, headers={'Content-Type': 'application/json'})
response = urllib.request.urlopen(req)
print(response.read().decode('utf-8'))
