"""Ekstrak jadwal guru dari PDF aSc Timetables (1 halaman per guru) menjadi CSV.
Blok pelajaran ditentukan dari garis sel: kolom yang digabung tidak punya garis tegak di antaranya."""
import pdfplumber, csv, sys, re
HARI=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
def parse(path):
    out=[]; problems=[]; skipped=[]
    pdf=pdfplumber.open(path)
    for pi,p in enumerate(pdf.pages):
        ws=p.extract_words(extra_attrs=['size'])
        name=' '.join(w['text'] for w in ws if 25<w['top']<45 and w['text'] not in('Teacher','Guru')).strip()
        if name.upper()=='MAN 1 PASURUAN': skipped.append(pi+1); continue
        vl=[l for l in p.lines if abs(l['x0']-l['x1'])<1]
        vx=sorted(set(round(l['x0']) for l in vl if l['bottom']-l['top']>5))
        hy=sorted(set(round(l['top']) for l in p.lines if abs(l['top']-l['bottom'])<1))
        cols=[(vx[i],vx[i+1]) for i in range(1,len(vx)-1)]
        labels=[' '.join(w['text'] for w in ws if 70<w['top']<90 and a<=(w['x0']+w['x1'])/2<=b) for a,b in cols]
        isbreak=[not re.fullmatch(r'\d+',l) for l in labels]
        rows=[(hy[i],hy[i+1]) for i in range(1,len(hy)-1)][:6]
        for ri,(top,bot) in enumerate(rows):
            mid=(top+bot)/2
            # batas kolom yang benar-benar bergaris di baris ini
            present=[any(abs(round(l['x0'])-x)<=1 and l['top']<=mid<=l['bottom'] for l in vl) for x in vx]
            c=0
            while c<len(cols):
                e=c
                while e+1<len(cols) and not present[e+2]: e+=1   # vx index of right edge of col e is e+2
                a,b=cols[c][0],cols[e][1]
                cell=[w for w in ws if top<w['top']<bot and a<=(w['x0']+w['x1'])/2<=b]
                if not isbreak[c] and cell:
                    big=[w for w in cell if w['size']>=10]; small=[w for w in cell if w['size']<10]
                    key=lambda w:(round(w['top']),w['x0'])
                    kelas=' '.join(w['text'] for w in sorted(big,key=key))
                    mapel=' '.join(w['text'] for w in sorted(small,key=key))
                    jams=[labels[k] for k in range(c,e+1)]
                    if any(isbreak[k] for k in range(c,e+1)) or not kelas:
                        problems.append((pi+1,name,HARI[ri],jams,kelas,mapel))
                    else:
                        out.append(dict(guru=name,hari=HARI[ri],jam_mulai=int(jams[0]),jam_selesai=int(jams[-1]),kelas=kelas,mapel=mapel))
                c=e+1
    return out,problems,skipped
if __name__=='__main__':
    out,pr,sk=parse(sys.argv[1])
    w=csv.DictWriter(open(sys.argv[2],'w',newline=''),fieldnames=['guru','hari','jam_mulai','jam_selesai','kelas','mapel'])
    w.writeheader(); w.writerows(out)
    print(len(out),'baris;',len(set(o['guru'] for o in out)),'guru; halaman dilewati:',sk); print('masalah:',pr)
