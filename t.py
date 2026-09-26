import json  
d = json.load(open('test_api.json'))  
print(d['decision']['status'], len(d.get('route_candidates', [])))  
