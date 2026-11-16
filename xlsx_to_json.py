# Convert your Training_Log.xlsx (2026/2027 sheets) into data/training.json
# usage: python tools/xlsx_to_json.py Training_Log.xlsx data/training.json   (needs: pip install openpyxl)
import openpyxl, json, datetime as dt, sys
wb=openpyxl.load_workbook(sys.argv[1],data_only=True)
def num(v):
    if v in (None,'','"'): return 0
    try: return float(v)
    except: return 0
def sleep(v):
    if isinstance(v,dt.timedelta): return round(v.total_seconds()/3600,3)
    if isinstance(v,dt.time): return round(v.hour+v.minute/60+v.second/3600,3)
    if isinstance(v,(int,float)): return round(v*24 if v<2 else v,3)
    return 0
out=[]
for ws in wb:
    hdr=[c.value for c in ws[2]]
    idx={n:i for i,n in enumerate(hdr) if n in('TL','RPF','Notes','Sessions','Workout')}
    prev=''
    for r in ws.iter_rows(min_row=3,values_only=True):
        d=r[1]
        if not isinstance(d,dt.datetime): continue
        g=lambda k: r[idx[k]] if k in idx else None
        note=g('Notes'); note='' if note is None else str(note).strip()
        if note in('"','″','“','”'): note=prev
        prev=note or prev if note else prev
        rec=dict(date=d.strftime('%Y-%m-%d'),sleep=sleep(r[2]),
          run_min=num(r[3]),run_mi=num(r[4]),run_vert=num(r[5]),
          bike_min=num(r[6]),bike_mi=num(r[7]),bike_vert=num(r[8]),
          nordic_min=num(r[9]),nordic_mi=num(r[10]),nordic_vert=num(r[11]),
          bc_min=num(r[12]),bc_mi=num(r[13]),bc_vert=num(r[14]),
          other_min=num(r[15]),sessions=num(g('Sessions')),workout=num(g('Workout')),
          tl=num(g('TL')),rpf=num(g('RPF')),notes=note)
        out.append(rec)
keys=[k for k in out[0] if k not in('date','notes')]
has=[i for i,o in enumerate(out) if any(o[k] for k in keys) or o['notes']]
out=out[:max(has)+1]
# drop zero-valued optional fields for compactness
for o in out:
    for k in list(o):
        if k!='date' and o[k] in (0,''): del o[k]
json.dump(out,open(sys.argv[2],'w'),indent=0)
print(len(out),out[0]['date'],out[-1]['date'])
