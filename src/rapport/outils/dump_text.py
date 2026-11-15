import sys,re
from html.parser import HTMLParser
VOID={'br','img','input','meta','link','hr','wbr','source','col','area','base','path','circle','rect','line','polyline','polygon','use','stop','ellipse'}
class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.stack=[]; s.out=[]; s.skip=0
    def handle_starttag(s,t,a):
        a=dict(a)
        if t in VOID: return
        mark=''
        if 'data-v-disc' in a or 'data-v-cmp' in a: mark='[V disc=%s cmp=%s]'%(a.get('data-v-disc','-'),a.get('data-v-cmp','-'))
        if t=='section': mark='\n\n######## SECTION %s'%a.get('id')
        if t in('script','style'): s.skip+=1; mark='[%s %s]'%(t,a.get('id',''))
        s.stack.append((t,mark))
        if mark: s.out.append('\n'+'  '*len(s.stack)+mark+'\n')
        if t in('p','div','li','tr','h1','h2','h3','h4','figcaption','title','text','td','th'): s.out.append('\n')
    def handle_endtag(s,t):
        if t in VOID: return
        while s.stack:
            tt,m=s.stack.pop()
            if tt in('script','style'): s.skip-=1
            if m and m.startswith('[V'): s.out.append('\n'+'  '*(len(s.stack)+1)+'[/V]\n')
            if tt==t: break
        if t in('td','th'): s.out.append(' | ')
    def handle_data(s,d):
        if s.skip: return
        d=re.sub(r'\s+',' ',d)
        if d.strip(): s.out.append(d)
p=P(); p.feed(open(sys.argv[1],encoding='utf8').read())
txt=''.join(p.out); txt=re.sub(r'\n\s*\n+','\n',txt)
open(sys.argv[2],'w').write(txt)
print(len(txt.splitlines()))
