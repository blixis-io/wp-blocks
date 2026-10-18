#!/usr/bin/env python3
"""Validate the structural schema, tier consistency, paths, and optionally Solar names."""
from pathlib import Path
import json,argparse,sys
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--solar-json',type=Path);a=p.parse_args()
manifest=json.loads((ROOT/'catalog.json').read_text())
schema=json.loads((ROOT/'schemas/element-definition.schema.json').read_text())
try:
 import jsonschema
except ImportError:
 print('Install jsonschema (pip install jsonschema) for full JSON Schema validation.',file=sys.stderr);jsonschema=None
errors=[];seen=set();icons=set()
for row in manifest['elements']:
 path=ROOT/row['file']
 if not path.is_file():errors.append('Missing '+str(path));continue
 d=json.loads(path.read_text());eid=d['id']
 if eid in seen:errors.append('Duplicate ID '+eid)
 seen.add(eid)
 if d['subscription']['minimumTier']!=row['minimumTier']:errors.append('Tier mismatch '+eid)
 if d['icon']['id']!=row['icon']:errors.append('Icon mismatch '+eid)
 if d['exampleInstance']['type']!=eid:errors.append('Example mismatch '+eid)
 if jsonschema:
  for e in jsonschema.Draft202012Validator(schema).iter_errors(d): errors.append(f'{eid}: {e.message}')
 icons.add(d['icon']['name'])
if a.solar_json:
 data=json.loads(a.solar_json.read_text()); valid=set(data.get('icons',{}))|set(data.get('aliases',{}))
 for icon in sorted(icons-valid):errors.append('Solar icon not found: '+icon)
print(f'Checked {len(seen)} elements, {len(icons)} distinct Solar icon candidates; errors: {len(errors)}')
for e in errors:print('ERROR',e)
sys.exit(bool(errors))
