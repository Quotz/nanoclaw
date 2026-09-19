#!/usr/bin/env python3
"""Pin Pero's Matrix DM with @andrey to the canonical room; leave+forget orphan duplicate DMs.
Idempotent + safe: only touches 1:1 rooms whose members are EXACTLY {bot, andrey}."""
import json, sys, urllib.parse, urllib.request, urllib.error
ENV="/opt/nanoclaw/.env"
CANON="!FSSf1hJiBiS655TB:matrix.815431624.xyz"
PEER="@andrey:matrix.815431624.xyz"
def load_env():
    e={}
    for line in open(ENV):
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            k,v=line.split('=',1); e[k]=v.strip().strip('"').strip("'")
    return e
env=load_env()
BASE=env.get('MATRIX_BASE_URL','').rstrip('/'); TOK=env.get('MATRIX_ACCESS_TOKEN',''); UID=env.get('MATRIX_USER_ID','')
if not (BASE and TOK and UID):
    print("repair-matrix-dms: missing MATRIX_* env, skipping", file=sys.stderr); sys.exit(0)
def call(method, path, body=None):
    req=urllib.request.Request(BASE+path, data=(json.dumps(body).encode() if body is not None else None), method=method)
    req.add_header('Authorization','Bearer '+TOK)
    if body is not None: req.add_header('Content-Type','application/json')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t=r.read().decode() or '{}'; return r.status, (json.loads(t) if t.strip().startswith(('{','[')) else {})
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or '{}')
        except Exception: return e.code, {}
    except Exception as ex:
        return 0, {'error': str(ex)}
q=urllib.parse.quote
changed=[]
# 1) m.direct -> canonical
st, md = call('GET', f'/_matrix/client/v3/user/{q(UID)}/account_data/m.direct')
if not isinstance(md, dict): md={}
if md.get(PEER) != [CANON]:
    md2=dict(md); md2[PEER]=[CANON]
    call('PUT', f'/_matrix/client/v3/user/{q(UID)}/account_data/m.direct', md2)
    changed.append(f"m.direct {md.get(PEER)} -> [{CANON}]")
# 2) ensure joined to canonical
call('POST', f'/_matrix/client/v3/rooms/{q(CANON)}/join', {})
# 3) leave+forget orphan DMs (exactly bot+andrey, not canonical)
st, jr = call('GET', '/_matrix/client/v3/joined_rooms')
for room in (jr.get('joined_rooms', []) if isinstance(jr, dict) else []):
    if room == CANON: continue
    st, mem = call('GET', f'/_matrix/client/v3/rooms/{q(room)}/joined_members')
    joined=set((mem.get('joined') or {}).keys()) if isinstance(mem, dict) else set()
    if joined == {UID, PEER}:
        call('POST', f'/_matrix/client/v3/rooms/{q(room)}/leave', {})
        call('POST', f'/_matrix/client/v3/rooms/{q(room)}/forget', {})
        changed.append(f"left+forgot orphan DM {room}")
print("repair-matrix-dms: " + ("; ".join(changed) if changed else "no changes (already canonical)"))
sys.exit(0)
