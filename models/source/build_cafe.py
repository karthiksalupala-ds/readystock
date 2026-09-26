"""Original photo-demo props; dependency-free, deterministic GLB 2.0 generator.
Run: python3 models/source/build_cafe.py
Existing library assets are preserved. All props use metres, +Y up, +Z front.
"""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATS = {
    'ink': ('#202124', .65, .1), 'chrome': ('#999fa3', .22, .85),
    'ivory': ('#eeeee6', .35, 0), 'red': ('#b50e19', .25, 0),
    'stone': ('#272222', .32, .05), 'vein': ('#8e8174', .65, 0),
    'paper': ('#e8e0c9', .85, 0), 'teal': ('#32616c', .7, 0),
    'gold': ('#bba274', .3, .55), 'white': ('#f9f4e3', .45, 0),
    'sky': ('#89949c', .9, 0), 'mountain': ('#28333e', .95, 0),
    'snow': ('#e8e9e5', .9, 0), 'light': ('#fff6d5', .3, 0),
}
for i in range(7):
    MATS[f'oak{i}'] = (['#c7a16e','#cfad7d','#bb9666','#d6b486','#c4a072','#d1ae7c','#cba778'][i], .8, 0)

class Model:
    def __init__(self): self.parts = {}
    def tri(self, mat, a, b, c):
        u = [b[i]-a[i] for i in range(3)]; v = [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in n))
        if length < 1e-12: return
        n = [x/length for x in n]
        p, normals, uv = self.parts.setdefault(mat, ([], [], []))
        p.extend(a+b+c); normals.extend(n*3); uv.extend([0,0,1,0,1,1])
    def quad(self, mat, a,b,c,d): self.tri(mat,a,b,c); self.tri(mat,a,c,d)
    def box(self, mat, size, at):
        x,y,z=at; w,h,d=[v/2 for v in size]
        v=[[x+sx*w,y+sy*h,z+sz*d] for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for a,b,c,e in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]: self.quad(mat,v[a],v[b],v[c],v[e])
    def lathe(self, mat, profile, at=(0,0,0), segments=32):
        for (r,y),(r2,y2) in zip(profile,profile[1:]):
            for i in range(segments):
                a=i*math.tau/segments; b=(i+1)*math.tau/segments
                def pt(rad,h,t): return [at[0]+rad*math.cos(t),at[1]+h,at[2]+rad*math.sin(t)]
                self.quad(mat,pt(r,y,a),pt(r2,y2,a),pt(r2,y2,b),pt(r,y,b))
    def cylinder(self, mat, r, h, at):
        self.lathe(mat,[(0,-h/2),(r,-h/2),(r,h/2),(0,h/2)],at)
    def sphere(self,mat,r,at):
        self.lathe(mat,[(r*math.sin(i*math.pi/16),-r*math.cos(i*math.pi/16)) for i in range(17)],at)
    def rod(self,mat,a,b,r):
        # Rectangular rails work well for table feet and marble veins.
        v=[b[i]-a[i] for i in range(3)]; length=math.sqrt(sum(x*x for x in v)); v=[x/length for x in v]
        side=[-v[2],0,v[0]] if abs(v[1])<.95 else [1,0,0]
        sl=math.sqrt(sum(x*x for x in side)); side=[x/sl*r for x in side]
        up=[v[1]*side[2]-v[2]*side[1],v[2]*side[0]-v[0]*side[2],v[0]*side[1]-v[1]*side[0]]
        pts=[[p[i]+s*side[i]+t*up[i] for i in range(3)] for p in [a,b] for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        for i in range(4): self.quad(mat,pts[i],pts[(i+1)%4],pts[(i+1)%4+4],pts[i+4])
        self.quad(mat,pts[3],pts[2],pts[1],pts[0]); self.quad(mat,*pts[4:])
    def save(self,id,description):
        # Normalize the authored support plane to Y=0, matching the library.
        min_y = min(min(p[1::3]) for p, _, _ in self.parts.values())
        for p, _, _ in self.parts.values():
            for i in range(1, len(p), 3): p[i] -= min_y
        binary=bytearray(); views=[]; accessors=[]; primitives=[]; materials=[]; allpos=[]
        def attr(values,n):
            start=len(binary); binary.extend(struct.pack('<'+'f'*len(values),*values))
            views.append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start})
            a={'bufferView':len(views)-1,'componentType':5126,'count':len(values)//n,'type':f'VEC{n}'}
            if n==3: a.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
            accessors.append(a); return len(accessors)-1
        for mat,(p,n,uv) in self.parts.items():
            color,rough,metal=MATS[mat]
            # glTF factors are linear, while authored swatches are sRGB.
            srgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
            rgb=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in srgb]
            materials.append({'name':f'Cafe_{mat}','pbrMetallicRoughness':{'baseColorFactor':rgb+[1],'roughnessFactor':rough,'metallicFactor':metal},**({'emissiveFactor':[.6,.52,.34]} if mat=='light' else {})})
            primitives.append({'attributes':{'POSITION':attr(p,3),'NORMAL':attr(n,3),'TEXCOORD_0':attr(uv,2)},'material':len(materials)-1})
            allpos.extend(p)
        doc={'asset':{'version':'2.0','generator':'InteLiDar original cafe props'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':id,'mesh':0}],'meshes':[{'primitives':primitives}],'materials':materials,'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
        raw=json.dumps(doc,separators=(',',':')).encode(); raw+=b' '*((-len(raw))%4)
        glb=struct.pack('<III',0x46546c67,2,28+len(raw)+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
        path=ROOT/'furniture'/f'{id}.glb'; path.write_bytes(glb)
        dims=[round(max(allpos[i::3])-min(allpos[i::3]),5) for i in range(3)]
        return {'id':id,'category':'furniture','file':f'furniture/{id}.glb','description':description,'triangles':len(allpos)//9,'vertices':len(allpos)//3,'bytes':len(glb),'dimensions_m':dict(zip(['width','height','depth'],dims)),'origin':'floor/support surface centre','rigged':False,'animations':[],'materials':[m['name'] for m in materials]}

assets=[]
def save(m,id,description): assets.append(m.save(id,description))

m=Model(); m.box('ivory',[.76,.035,.76],[0,.7325,0]); m.cylinder('ink',.038,.67,[0,.37,0])
for x,z in [(.3,0),(-.3,0),(0,.3),(0,-.3)]: m.rod('ink',[0,.09,0],[x,.035,z],.025)
for i in range(3): m.rod('vein',[-.37,.7502,-.25+i*.22],[.37,.7502,-.1+i*.16],.0008)
save(m,'table_cafe','White stone square cafe table with dark four-foot pedestal')

m=Model(); m.box('ink',[.44,.045,.43],[0,.455,0]); m.box('ink',[.44,.32,.045],[0,.67,-.2])
for x in [-.19,.19]:
    for z in [-.17,.17]: m.rod('chrome',[x,.44,z],[x*1.2,.014,z*1.35],.012)
save(m,'chair_cafe','Black cafe chair with a slim chrome frame')

m=Model(); m.lathe('chrome',[(0,0),(.22,0),(.22,.025),(.16,.045),(.045,.08),(.028,.65),(0,.65)])
m.lathe('red',[(0,.62),(.1,.62),(.2,.69),(.23,.76),(.22,.8),(.16,.74),(0,.72)])
m.lathe('chrome',[(.125,.28),(.14,.28),(.14,.3),(.125,.3),(.125,.28)])
save(m,'stool_bar','Sculpted red trumpet bar stool with chrome base and foot ring')

m=Model(); m.box('stone',[3.2,1.07,.62],[0,.535,0]); m.box('stone',[3.34,.055,.78],[0,1.0975,0]); m.box('gold',[3.2,.025,.025],[0,1.055,.32])
for x in [-1.3,-.5,.5,1.1]: m.rod('vein',[x,0,.311],[x+.3,1.04,.311],.006)
save(m,'counter_cafe','Dark veined stone cafe bar with brass trim')

m=Model(); m.box('chrome',[.55,.38,.35],[0,.25,0]); m.box('ink',[.49,.24,.02],[0,.29,.18]); m.box('chrome',[.58,.025,.46],[0,.06,.05])
for x in [-.15,.15]:
    m.cylinder('chrome',.04,.05,[x,.2,.22]); m.box('ink',[.025,.025,.13],[x,.2,.3]); m.cylinder('ivory',.038,.07,[x,.107,.14])
for x in [-.2,-.1,0,.1,.2]: m.box('gold',[.018,.018,.012],[x,.39,.195])
save(m,'coffee_machine','Countertop espresso machine with two groups and cups')

for king in [True,False]:
    m=Model(); mat='ivory' if king else 'ink'
    m.lathe(mat,[(0,0),(.085,0),(.09,.018),(.09,.03),(.07,.045),(.062,.065),(.068,.078),(.055,.09),(.028,.19),(.044,.21),(.047,.23),(.027,.245),(0,.245)])
    if king:
        m.box(mat,[.025,.085,.025],[0,.284,0]); m.box(mat,[.075,.023,.025],[0,.295,0])
    else: m.sphere(mat,.047,[0,.264,0])
    save(m,'chess_king' if king else 'chess_pawn','Display chess king with turned base and cross' if king else 'Display chess pawn with turned base and spherical head')

m=Model()
for i,mat in enumerate(['ink','teal','ivory','red']):
    y=.018+i*.044; w=.34-i*.014
    m.box('paper',[w-.008,.033,.22],[0,y+.02,0]); m.box(mat,[w,.005,.23],[0,y,0]); m.box(mat,[w,.005,.23],[0,y+.04,0]); m.box(mat,[.008,.04,.23],[-w/2,y+.02,0])
save(m,'books_stack','Four stacked books with separate covers and paper blocks')

m=Model(); m.cylinder('chrome',.006,.8,[0,.59,0]); m.lathe('chrome',[(0,.19),(.045,.19),(.16,.115),(.25,.1),(.25,.085),(.14,.07),(.19,.045),(.19,.03),(.07,.015),(0,.015)])
m.cylinder('light',.085,.015,[0,.008,0]); save(m,'pendant_cafe','Layered silver pendant shade with suspension cable')

m=Model(); m.box('ink',[1.9,.72,.035],[0,.36,0]); m.box('sky',[1.86,.68,.01],[0,.36,.024])
m.tri('mountain',[-.93,.025,.031],[.93,.025,.031],[.1,.65,.031]); m.tri('snow',[-.19,.47,.033],[.31,.5,.033],[.1,.65,.033])
m.tri('mountain',[-.8,.025,.034],[.55,.025,.034],[-.46,.34,.034]); save(m,'mountain_art','Framed mountain and snowcap wall art inspired by the photo')

m=Model(); m.box('ivory',[.035,.035,5],[0,.16,0])
for z in [-2,-1,0,1,2]:
    m.rod('ivory',[0,.15,z],[.07,.06,z+.035],.023); m.cylinder('ivory',.048,.1,[.07,.05,z+.035]); m.cylinder('light',.037,.006,[.07,.003,z+.035])
save(m,'track_ceiling','White ceiling lighting track with five spotlights')

m=Model()
for x in range(32):
    for z in range(6):
        lo=max(-4.8,-5.6+z*1.92+(x%3)*.48); hi=min(4.8,-5.6+(z+1)*1.92+(x%3)*.48)
        if hi<=lo: continue
        m.box(f'oak{(x*3+z*5)%7}',[.198,.008,hi-lo-.003],[-3.1+x*.2,.004,(lo+hi)/2])
        for line in range(2):
            gx=-3.1+x*.2-.06+line*.09
            m.rod(f'oak{(x*3+z*5+2)%7}',[gx,.0082,lo+.05],[gx+.014,.0082,hi-.04],.0006)
save(m,'floor_oak_cafe','Pale staggered oak boards with fine grain, 6.4 by 9.6 metres')

manifest=json.loads((ROOT/'manifest.json').read_text())
new_ids={a['id'] for a in assets}
manifest['assets']=[a for a in manifest['assets'] if a['id'] not in new_ids]+assets
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Built {len(assets)} cafe assets, {sum(a["triangles"] for a in assets):,} triangles')
