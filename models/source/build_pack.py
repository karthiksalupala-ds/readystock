"""InteliDar original asset library. Run in Blender; dimensions are metres.

Static meshes are joined, UV unwrapped, normals checked, and exported at origin.
Generator is deterministic, uses native geometry and simple metallic/roughness PBR.
"""
import bpy
import bmesh
import json
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = 'InteliDar Asset Library'
ASSETS = {}
PALETTE = {}
CURRENT = None


def material(name, hex_color, roughness=.6, metalness=0):
    key = 'IDAR_' + name
    mat = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    rgb = tuple(int(hex_color[i:i+2], 16)/255 for i in (0, 2, 4))
    linear = tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    mat.use_backface_culling = True
    return mat


def setup():
    global SCENE
    if bpy.data.scenes.get(PACK):
        raise RuntimeError('Pack scene already exists; use the existing generator state.')
    SCENE = bpy.data.scenes.new(PACK)
    bpy.context.window.scene = SCENE
    SCENE.unit_settings.system = 'METRIC'
    SCENE.unit_settings.scale_length = 1
    SCENE.render.fps = 30
    for name, color, rough, metal in [
        ('oak','B59B76',.58,0), ('walnut','73604B',.6,0),
        ('fabric','929B94',.85,0), ('fabric_light','D6D1C5',.88,0),
        ('sage','667F70',.76,0), ('metal','596269',.36,.75),
        ('dark','293239',.56,.15), ('ceramic','D9D2C4',.45,0),
        ('leaf','477456',.7,0), ('leaf_light','729268',.7,0),
        ('skin','BA8F73',.78,0), ('blue','57717E',.8,0),
        ('white','E9E7DF',.65,0), ('rubber','34383A',.85,0),
        ('soil','44392F',1,0), ('screen','243F49',.3,.05),
        ('terracotta','B5866D',.85,0), ('linen','B9AE99',.9,0),
    ]:
        PALETTE[name] = material(name,color,rough,metal)
    for folder in ('avatars','furniture','plants','electronics','previews'):
        (ROOT/folder).mkdir(parents=True,exist_ok=True)


def begin(name, category, description, origin='floor centre'):
    global CURRENT
    coll = bpy.data.collections.new(name)
    SCENE.collection.children.link(coll)
    CURRENT = coll
    ASSETS[name] = dict(name=name, category=category, collection=coll,
        description=description, origin=origin, animations=[], rigged=False)
    return coll


def own(obj, name, mat):
    obj.name = CURRENT.name + '__' + name
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    CURRENT.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(PALETTE[mat] if isinstance(mat,str) else mat)
    return obj


def apply(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def box(name, size, at, mat='oak', bevel=.005, rotation=None, segments=1):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at)
    obj = own(bpy.context.object,name,mat)
    obj.dimensions = size
    if rotation:
        obj.rotation_euler = rotation
    apply(obj)
    if bevel:
        mod = obj.modifiers.new('Edge finish','BEVEL')
        mod.width = min(bevel,min(size)*.28)
        mod.segments = segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, radius, depth, at, mat='metal', vertices=16, radius_top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
        radius2=radius if radius_top is None else radius_top, depth=depth, location=at)
    obj = own(bpy.context.object,name,mat)
    for poly in obj.data.polygons:
        poly.use_smooth = abs(poly.normal.z) < .99
    return obj


def rod(name, a, b, radius=.015, mat='metal', vertices=12, radius_top=None):
    a,b = Vector(a),Vector(b)
    obj = cylinder(name,radius,(b-a).length,(a+b)/2,mat,vertices,radius_top)
    obj.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    apply(obj)
    return obj


def ball(name,size,at,mat='fabric',segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=at)
    obj=own(bpy.context.object,name,mat)
    obj.scale=size
    apply(obj)
    for poly in obj.data.polygons:
        poly.use_smooth=True
    return obj


def legs(w,d,height,thickness=.045,mat='oak',inset=.04,z0=0):
    for x in (-w/2+inset,w/2-inset):
        for y in (-d/2+inset,d/2-inset):
            box('leg',(thickness,thickness,height),(x,y,z0+height/2),mat,.003)


def table(name, w,d,h,kind='dining'):
    begin(name,'furniture',f'{kind.title()} table; {w:g} × {d:g} × {h:g} m')
    top=.045 if kind=='dining' else .03
    box('top',(w,d,top),(0,0,h-top/2),'oak',.012,segments=2)
    legs(w,d,h-top,.06 if kind=='dining' else .038,'walnut',.085 if kind=='dining' else .055)
    if kind=='dining':
        for y in (-d/2+.08,d/2-.08):
            box('apron',(w-.12,.025,.085),(0,y,h-top-.05),'walnut')
    finish(name)


def chair_standard():
    name='chair_standard'; begin(name,'furniture','Dining chair, oak frame with upholstered seat')
    box('seat',(.46,.46,.06),(0,0,.45),'fabric_light',.018,segments=2)
    for x in (-.177,.177):
        box('front_leg',(.044,.044,.42),(x,-.175,.21),'walnut')
        box('rear_upright',(.044,.044,.88),(x,.175,.44),'oak')
    box('backrest',(.40,.055,.245),(0,.18,.7375),'oak',.015,segments=2)
    for x in (-.177,.177):
        box('side_rail',(.025,.35,.07),(x,0,.39),'walnut')
    finish(name)


def chair_office():
    name='chair_office'; begin(name,'furniture','Five-star office chair with arms and fixed swivel base')
    for i in range(5):
        a=2*math.pi*i/5
        end=(.285*math.cos(a),.285*math.sin(a),.075)
        rod('base_spoke',(0,0,.105),end,.023,'metal',10)
        wheel=cylinder('caster',.034,.043,(end[0],end[1],.034),'rubber',12)
        wheel.rotation_euler[0]=math.pi/2; apply(wheel)
    cylinder('gas_column',.025,.30,(0,0,.26),'metal',12)
    box('seat',(.49,.46,.085),(0,-.005,.445),'dark',.026,segments=3)
    rod('back_support',(0,.15,.40),(0,.205,.68),.026,'metal')
    box('back',(.44,.072,.43),(0,.205,.755),'fabric',.035,segments=3)
    for x in (-.29,.29):
        rod('arm_post',(x*.8,0,.42),(x,.015,.63),.014,'metal')
        box('arm_pad',(.065,.29,.033),(x,-.015,.647),'dark',.012,segments=2)
    finish(name)


def stool():
    name='stool_round'; begin(name,'furniture','Round oak stool with four braced legs, 0.46 m high')
    cylinder('seat',.185,.045,(0,0,.4375),'oak',24)
    for i in range(4):
        a=math.pi/4+i*math.pi/2
        rod('leg',(.132*math.cos(a),.132*math.sin(a),.016),
            (.103*math.cos(a),.103*math.sin(a),.417),.021,'walnut',10)
    for a,b in [((-.09,-.09,.18),(.09,-.09,.18)),((.09,-.09,.18),(.09,.09,.18)),
                ((.09,.09,.18),(-.09,.09,.18)),((-.09,.09,.18),(-.09,-.09,.18))]:
        rod('brace',a,b,.01,'walnut',8)
    # Flat-bottomed legs touch the floor after their rotation is applied.
    finish(name)


def cabinet():
    name='cabinet_simple'; begin(name,'furniture','Two-door oak cabinet with graphite handles')
    legs(.9,.40,.10,.055,'walnut',.055)
    box('bottom',(.90,.40,.035),(0,0,.1175))
    box('top',(.94,.44,.035),(0,0,.8825),bevel=.008)
    for x in (-.435,.435): box('side',(.03,.40,.73),(x,0,.5))
    box('back',(.84,.022,.73),(0,.189,.5),'walnut')
    box('shelf',(.84,.375,.025),(0,0,.46))
    for x in (-.22,.22):
        box('door',(.43,.028,.718),(x,-.207,.5),'oak',.003)
        box('handle',(.018,.026,.14),(x*.22,-.23,.57),'dark',.004)
    finish(name)


def shelf(name='shelf_open',books=False):
    begin(name,'furniture','Open shelf with four storage levels'+(' and simple books' if books else ''))
    for x in (-.385,.385):
        for y in (-.16,.16): box('upright',(.03,.03,1.8),(x,y,.90),'dark',.003)
    for z in (.09,.60,1.11,1.77):
        box('shelf',(.80,.38,.03),(0,0,z),'oak',.004)
    # A single rear cross-brace provides a believable open frame.
    rod('cross_brace',(-.36,.16,.11),(.36,.16,1.75),.009,'metal',8)
    if books:
        colors=['sage','linen','blue','fabric_light','walnut']
        for row,z in enumerate((.615,1.125)):
            for i in range(6):
                height=.20+.02*((i+row)%3)
                box('book',(.042,.18,height),(-.28+i*.055,.01,z+height/2),colors[(i+row)%5],.001)
    finish(name)


def desk():
    name='desk_small'; begin(name,'furniture','Compact writing desk, 1.10 m wide and 0.75 m high')
    box('desktop',(1.1,.56,.035),(0,0,.7325),'oak',.009,segments=2)
    for x in (-.49,.49):
        for y in (-.225,.225): box('leg',(.028,.028,.715),(x,y,.3575),'dark',.003)
        box('frame_side',(.028,.475,.03),(x,0,.698),'dark')
    box('rear_frame',(1.0,.025,.05),(0,.23,.69),'dark')
    box('drawer',(.38,.43,.09),(.28,.00,.666),'walnut',.007)
    box('pull',(.14,.017,.012),(.28,-.231,.665),'dark',.003)
    finish(name)


def pot_mesh(name,radius,height,mat='ceramic',filled=False):
    n=20; thick=max(.008,radius*.075)
    # Cross-section traced from exterior bottom, around lip, down the interior.
    rings=[(radius*.72,0),(radius,height*.94),(radius,height),
           (radius-thick,height),(radius-thick,height*.92),
           (radius*.72-thick,.025)]
    verts=[(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n),z) for r,z in rings for i in range(n)]
    faces=[]
    for j in range(len(rings)-1):
        for i in range(n):
            k=(i+1)%n; faces.append((j*n+i,j*n+k,(j+1)*n+k,(j+1)*n+i))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((len(rings)-1)*n+i for i in range(n)))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); CURRENT.objects.link(obj); obj.data.materials.append(PALETTE[mat])
    for p in mesh.polygons: p.use_smooth=len(p.vertices)==4
    if filled:
        cylinder('soil',radius-thick-.001,.008,(0,0,height*.88),'soil',20)
    return obj


def leaf(name,start,end,width,mat):
    a,b=Vector(start),Vector(end); direction=(b-a).normalized()
    side=direction.cross(Vector((0,0,1)))
    if side.length<.01: side=Vector((1,0,0))
    side.normalize(); mid=a.lerp(b,.48); ridge=Vector((0,0,width*.16))
    # Six vertices, eight triangles: volumetric leaf with visible front/back.
    verts=[a,b,mid+side*width/2,mid-side*width/2,mid+ridge,mid-ridge*.13]
    faces=[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); CURRENT.objects.link(obj); obj.data.materials.append(PALETTE[mat])
    return obj


def plant(name,scale):
    begin(name,'plants',{'small':'Small tabletop potted plant','medium':'Medium leafy plant','tall':'Tall indoor broadleaf plant'}[scale])
    r,h,top,count={'small':(.105,.17,.42,9),'medium':(.17,.29,.85,15),'tall':(.23,.40,1.65,20)}[scale]
    pot_mesh('planter',r,h,'ceramic' if scale!='medium' else 'terracotta',True)
    rod('stem',(0,0,h*.87),(0,0,top-.08),.005 if scale=='small' else .009,'walnut',8)
    for i in range(count):
        ang=i*2.399963
        z=h*.95+(top-h-.12)*(i/max(1,count-1))
        extent=(top-h)*(.31+.10*math.sin(i*2.1))
        extent*=1-.28*(i/count)
        a=(0,0,z)
        end=(extent*math.cos(ang),extent*math.sin(ang),z+.08+(top-h)*.12)
        petiole=Vector(a).lerp(Vector(end),.28)
        rod('petiole',a,petiole,.002 if scale=='small' else .003,'leaf',6)
        leaf('leaf',petiole,end,extent*.50,'leaf' if i%3 else 'leaf_light')
    finish(name)


def empty_pot():
    name='pot_empty'; begin(name,'plants','Hollow ceramic flower pot with visible inner wall and base')
    pot_mesh('pot',.15,.24,'terracotta',False)
    finish(name)


def sofa(name,seats):
    width=1.62 if seats==2 else 2.18
    begin(name,'furniture',f'{seats}-seat sofa with separate cushions, low oak feet and sage upholstery')
    legs(width,.82,.13,.065,'walnut',.12)
    box('base',(width-.08,.80,.18),(0,0,.22),'fabric',.035,segments=2)
    box('rear',(width-.07,.14,.55),(0,.35,.585),'fabric',.045,segments=3)
    for x in (-width/2+.07,width/2-.07):
        box('arm',(.14,.86,.40),(x,0,.44),'fabric',.042,segments=3)
    inner=width-.31; cushion=inner/seats
    for i in range(seats):
        x=-inner/2+cushion*(i+.5)
        box('seat_cushion',(cushion-.014,.64,.145),(x,-.06,.3825),'fabric_light',.034,segments=3)
        box('back_cushion',(cushion-.017,.13,.365),(x,.226,.625),'fabric_light',.032,segments=3)
    finish(name)


def bed(name,double=False):
    w=1.56 if double else .96
    begin(name,'furniture',('Double' if double else 'Single')+' bed with oak frame, linen bedding and headboard')
    legs(w,2.05,.17,.065,'walnut',.085)
    box('platform',(w,2.05,.12),(0,0,.225),'oak',.012,segments=2)
    box('headboard',(w+.04,.07,.9),(0,1.03,.45),'oak',.014,segments=2)
    box('mattress',(w-.06,1.98,.20),(0,-.015,.385),'white',.04,segments=3)
    box('duvet',(w-.055,1.38,.055),(0,-.29,.503),'linen',.025,segments=2)
    box('fold',(w-.045,.18,.065),(0,.31,.517),'sage',.018,segments=2)
    for x in ((-.36,.36) if double else (0,)):
        box('pillow',(.63,.38,.095),(x,.715,.519),'fabric_light',.038,segments=3)
    finish(name)


def display(name,tv=False):
    begin(name,'electronics',('Flat-screen TV with pedestal' if tv else 'Desktop monitor with pedestal'),origin='support surface centre')
    w,h,d,baseh=(1.10,.64,.046,.15) if tv else (.58,.345,.032,.115)
    cylinder('pedestal',.155 if tv else .10,.018,(0,0,.009),'dark',24)
    box('stem',(.055,.04,baseh),(0,.012,baseh/2+.018),'metal')
    z=.018+baseh+h/2
    box('housing',(w,d,h),(0,0,z),'dark',.012,segments=2)
    box('screen',(w-.028,.002,h-.028),(0,-d/2-.001,z+.003),'screen',.001)
    box('rear_hub',(w*.32,.022,h*.36),(0,d/2+.008,z-.04),'dark',.009)
    finish(name)


def tower():
    name='computer_desktop'; begin(name,'electronics','Desktop computer tower with front vent grille',origin='support surface centre')
    legs(.20,.37,.018,.025,'rubber',.033)
    box('case',(.20,.37,.395),(0,0,.2155),'dark',.008,segments=2)
    box('front',(.178,.006,.369),(0,-.189,.2155),'metal',.003)
    for i in range(8):
        box('vent',(.13,.0015,.005),(0,-.193,.115+i*.015),'rubber',0)
    button=cylinder('power',.006,.003,(.055,-.194,.362),'white',12)
    button.rotation_euler[0]=math.pi/2; apply(button)
    for x in (-.047,-.016): box('usb',(.018,.002,.006),(x,-.193,.333),'rubber',0)
    finish(name)


def keyboard():
    name='keyboard'; begin(name,'electronics','Compact desktop keyboard with simplified unlabelled keys',origin='support surface centre')
    box('base',(.43,.14,.018),(0,0,.009),'dark',.006,segments=2)
    for row in range(4):
        for col in range(13):
            box('key',(.026,.021,.006),(-.185+col*.0305,.047-row*.028,.021),'fabric_light',.001,segments=1)
    box('space',(.15,.018,.005),(0,-.056,.0205),'fabric_light',.001)
    finish(name)


def laptop():
    name='laptop'; begin(name,'electronics','Open laptop with keyboard and trackpad',origin='support surface centre')
    box('base',(.34,.23,.015),(0,0,.0075),'metal',.006,segments=2)
    rod('hinge',(-.135,.098,.021),(.135,.098,.021),.009,'dark',12)
    angle=-math.radians(12)
    center=Vector((0,.098+math.sin(-angle)*.106,.021+math.cos(angle)*.106))
    box('lid',(.336,.012,.212),center,'dark',.006,(angle,0,0),2)
    normal=Vector((0,-math.cos(angle),-math.sin(angle)))
    box('screen',(.313,.002,.183),center+normal*.007,'screen',.001,(angle,0,0))
    for row in range(4):
        for col in range(11):
            box('key',(.023,.015,.0025),(-.134+col*.0268,.060-row*.02,.01625),'dark',.0006)
    box('trackpad',(.09,.046,.0008),(0,-.062,.0154),'dark',.003)
    finish(name)


def lamp():
    name='lamp_floor'; begin(name,'furniture','Floor lamp with metal stem and open linen shade')
    cylinder('base',.18,.025,(0,0,.0125),'dark',24)
    rod('stem',(0,0,.025),(0,0,1.46),.014,'metal',12)
    # Thin-walled frustum: light exits the open bottom and top.
    n=24; vertices=[]
    rings=[(.225,1.29),(.14,1.60),(.133,1.60),(.218,1.29)]
    for r,z in rings:
        vertices += [(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n),z) for i in range(n)]
    faces=[]
    for j in range(4):
        for i in range(n): faces.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
    mesh=bpy.data.meshes.new('shade');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('shade',mesh);CURRENT.objects.link(obj);obj.data.materials.append(PALETTE['fabric_light'])
    ball('bulb',(.032,.032,.045),(0,0,1.4),'white',12,8)
    finish(name)


def trash():
    name='trash_bin';begin(name,'furniture','Open small waste bin with hollow interior')
    pot_mesh('bin',.14,.32,'dark',False)
    finish(name)


def door():
    name='door_simple';begin(name,'furniture','Closed interior door slab, 0.90 × 2.04 m; origin at bottom hinge',origin='bottom hinge, left edge; no frame')
    box('slab',(.90,.04,2.04),(.45,0,1.02),'oak',.005)
    for y in (-.023,.023):
        plate=cylinder('escutcheon',.025,.008,(.78,y,1.0),'metal',16)
        plate.rotation_euler[0]=math.pi/2;apply(plate)
        rod('handle_post',(.78,y,1.0),(.78,y*2.1,1.0),.008,'metal',10)
        rod('lever',(.78,y*2.1,1.0),(.69,y*2.1,1.0),.008,'metal',10)
    for z in (.22,1.78): cylinder('hinge',.009,.09,(.008,.026,z),'metal',12)
    finish(name,center=False)


def rug():
    name='rug_simple';begin(name,'furniture','Neutral woven-look rug, 1.60 × 2.20 m')
    box('rug',(1.6,2.2,.008),(0,0,.004),'linen',.003,segments=2)
    for y in (-1.05,1.05): box('border',(1.54,.035,.0005),(0,y,.00825),'fabric',0)
    finish(name)


def bounds(objects):
    bpy.context.view_layer.update()
    pts=[o.matrix_world@Vector(v) for o in objects if o.type=='MESH' for v in o.bound_box]
    lo=[min(p[i] for p in pts) for i in range(3)]
    hi=[max(p[i] for p in pts) for i in range(3)]
    return lo,hi


def finish(name,center=True):
    entry=ASSETS[name]; objects=[o for o in entry['collection'].objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object;obj.name=name
    lo,hi=bounds([obj])
    shift=Vector((-(lo[0]+hi[0])/2 if center else 0,-(lo[1]+hi[1])/2 if center else 0,-lo[2]))
    obj.location+=shift
    SCENE.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.data.update(); obj.data.calc_loop_triangles()
    lo,hi=bounds([obj]);dims=[round(hi[i]-lo[i],5) for i in range(3)]
    obj['asset_id']=name;obj['units']='metres';obj['origin']=entry['origin']
    obj['dimensions_m_xyz_blender']=dims
    entry.update(root=obj,objects=[obj],triangles=len(obj.data.loop_triangles),vertices=len(obj.data.vertices),dimensions_blender=dims)
    return obj


def export_asset(name):
    entry=ASSETS[name]
    bpy.context.window.scene=SCENE
    for other in ASSETS.values():
        for obj in other.get('objects',[]):obj.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in entry['objects']:obj.select_set(True)
    bpy.context.view_layer.objects.active=entry['root']
    SCENE.frame_set(1)
    path=ROOT/entry['category']/(name+'.glb')
    if path.exists() and entry.get('path')!=path.relative_to(ROOT).as_posix():
        raise FileExistsError(f'Will not overwrite unrelated {path}.')
    options=dict(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,
        export_yup=True,export_apply=False,export_texcoords=True,export_normals=True,
        export_materials='EXPORT',export_cameras=False,export_lights=False,
        export_extras=True,export_animations=entry['rigged'],export_skins=entry['rigged'])
    if entry['rigged']:
        options.update(export_animation_mode='NLA_TRACKS',export_force_sampling=True,
            export_anim_slide_to_zero=True,export_frame_range=False)
    bpy.ops.export_scene.gltf(**options)
    entry['path']=path.relative_to(ROOT).as_posix()
    entry['bytes']=path.stat().st_size
    print('EXPORTED',name,entry.get('triangles'),entry['bytes'])


def build_batch(batch):
    if batch==1:
        chair_standard();chair_office();stool()
        table('table_dining',1.4,.8,.75)
        table('table_side',.45,.45,.5,'side')
        cabinet();shelf();desk()
    elif batch==2:
        plant('plant_potted_small','small');plant('plant_potted_medium','medium')
        plant('plant_indoor_tall','tall');empty_pot()
        sofa('sofa_2seat',2);sofa('sofa_3seat',3)
        bed('bed_single');bed('bed_double',True)
    elif batch==3:
        display('tv_flat',True);display('monitor_desktop');tower();keyboard();laptop()
        lamp();table('table_coffee',1.0,.55,.40,'coffee');trash();shelf('bookshelf',True);door();rug()
    else:raise ValueError(batch)
    print('BUILT batch',batch,'total assets',len(ASSETS))


def write_manifest():
    records=[]
    for name,entry in ASSETS.items():
        obj=entry['root']; meshes=[o for o in entry['objects'] if o.type=='MESH']
        for mesh in meshes:mesh.data.calc_loop_triangles()
        lo,hi=bounds(meshes);dims=[round(hi[i]-lo[i],5) for i in range(3)]
        records.append(dict(id=name,category=entry['category'],file=entry['path'],description=entry['description'],
            triangles=sum(len(o.data.loop_triangles) for o in meshes),
            vertices=sum(len(o.data.vertices) for o in meshes),bytes=entry['bytes'],
            dimensions_m={'width':dims[0],'height':dims[2],'depth':dims[1]},
            origin=entry['origin'],rigged=entry['rigged'],animations=entry['animations'],
            materials=sorted({m.name for o in meshes for m in o.data.materials if m})))
    payload=dict(name='InteliDar Indoor Essentials',version='1.0',units='metres',
        coordinates='GLB: +Y up, +Z front. Blender source: +Z up, -Y front.',
        licensing='Original procedural geometry created for this project; no external assets or textures.',
        assets=records)
    (ROOT/'manifest.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    print(json.dumps({'assets':len(records),'triangles':sum(a['triangles'] for a in records),
        'bytes':sum(a['bytes'] for a in records)},indent=2))
    return payload


def build_all(output_path):
    """Rebuild into a new output folder; existing exported files are protected."""
    global ROOT
    import importlib.util
    ROOT=Path(output_path).resolve()
    if ROOT.exists() and any(ROOT.rglob('*.glb')):
        raise FileExistsError('Choose an output directory without existing GLB assets.')
    setup()
    for batch in (1,2,3):build_batch(batch)
    source=Path(__file__).resolve().parent
    spec=importlib.util.spec_from_file_location('idar_avatar_generator',source/'build_avatars.py')
    avatars=importlib.util.module_from_spec(spec);spec.loader.exec_module(avatars)
    for variant in ('casual','sporty','stylized'):
        name='avatar_'+variant;col=begin(name,'avatars',variant+' humanoid')
        ASSETS[name].update(avatars.build_avatar(name,variant,col,PALETTE),rigged=True)
    for name in ASSETS:export_asset(name)
    write_manifest()
    spec=importlib.util.spec_from_file_location('idar_preview_generator',source/'preview_pack.py')
    preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview)
    from types import SimpleNamespace
    gallery=preview.create_gallery(SimpleNamespace(ASSETS=ASSETS,ROOT=ROOT))
    bpy.context.window.scene=gallery
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'intelidar_asset_library.blend'),copy=True,compress=True)


if __name__=='__main__':
    import sys,argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,help='New destination directory')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    build_all(args.output)
