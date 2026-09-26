"""Blender catalog previews. Preview instances are scaled; exported assets are not."""
import bpy
import math
from mathutils import Vector
from pathlib import Path

GROUPS={
    '01_furniture': ['chair_standard','chair_office','stool_round','table_dining','table_side','cabinet_simple','shelf_open','desk_small'],
    '02_living': ['sofa_2seat','sofa_3seat','bed_single','bed_double'],
    '03_plants': ['plant_potted_small','plant_potted_medium','plant_indoor_tall','pot_empty'],
    '04_electronics': ['tv_flat','monitor_desktop','computer_desktop','keyboard','laptop'],
    '05_avatars': ['avatar_casual','avatar_sporty','avatar_stylized'],
    '06_extras': ['lamp_floor','table_coffee','trash_bin','bookshelf','door_simple','rug_simple'],
}


def new_scene(name):
    scene=bpy.data.scenes.new(name)
    bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'
    scene.unit_settings.scale_length=1
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.image_settings.file_format='PNG'
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new(name+'_World')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.33,.37,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    scene.view_settings.view_transform='AgX'
    scene.render.film_transparent=False
    return scene


def mat(name,rgb):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color=(*rgb,1);m.use_nodes=True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
    return m


def camera(scene,at,target,ortho):
    data=bpy.data.cameras.new(scene.name+'_Camera')
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
    obj.location=at;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=ortho;data.lens=50
    scene.camera=obj
    return obj


def lighting(scene,span):
    for name,loc,power,size in [('Key',(-span*.45,-span*.55,span),1600*(span/8)**2,span*.6),
                              ('Fill',(span*.55,-span*.2,span*.6),700*(span/8)**2,span*.5),
                              ('Rim',(0,span*.6,span*.9),1300*(span/8)**2,span*.5)]:
        data=bpy.data.lights.new(scene.name+'_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()


def text(scene,label,at,size=.10):
    data=bpy.data.curves.new('Catalog label','FONT');data.body=label;data.size=size
    data.align_x='CENTER';data.align_y='CENTER';data.extrude=0
    obj=bpy.data.objects.new(label,data);scene.collection.objects.link(obj)
    obj.location=at;obj.rotation_euler=(math.radians(35),0,0)
    data.materials.append(mat('IDAR_preview_ink',(.11,.15,.15)))
    return obj


def create_sheet(p,key):
    names=GROUPS[key];cols=min(4,len(names));rows=math.ceil(len(names)/cols)
    sx,sy=2.8,3.8
    scene=new_scene('Preview '+key)
    for i,name in enumerate(names):
        entry=p.ASSETS[name]
        lo,hi=p.bounds(entry['objects'])
        size=max(hi[j]-lo[j] for j in range(3));scale=1.9/max(size,.001)
        x=(i%cols-(cols-1)/2)*sx;y=((rows-1)/2-i//cols)*sy
        obj=bpy.data.objects.new('Preview_'+name,None)
        obj.instance_type='COLLECTION';obj.instance_collection=entry['collection']
        scene.collection.objects.link(obj);obj.scale=(scale,)*3
        obj.location=(x-(lo[0]+hi[0])/2*scale,y-(lo[1]+hi[1])/2*scale,-lo[2]*scale)
        text(scene,name.replace('_',' '),(x,y-1.28,.025),.11)
        text(scene,f"{hi[0]-lo[0]:.2f} x {hi[1]-lo[1]:.2f} x {hi[2]-lo[2]:.2f} m",(x,y-1.47,.020),.075)
    span=cols*sx+.55
    scene.render.resolution_x=cols*550
    scene.render.resolution_y=rows*600+170
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015))
    floor=bpy.context.object;floor.name='Preview floor';floor.data.materials.append(mat('IDAR_preview_floor',(.69,.70,.67)))
    camera(scene,(span*.17,-span*.95,span*.92),(0,0,.55),span*1.05)
    lighting(scene,max(span,8))
    scene.frame_set(1)
    scene.render.filepath=str(p.ROOT/'previews'/(key+'.png'))
    return scene


def create_gallery(p):
    scene=new_scene('InteliDar — Asset Gallery')
    names=[n for group in GROUPS.values() for n in group]
    cols=6;rows=math.ceil(len(names)/cols)
    for i,name in enumerate(names):
        entry=p.ASSETS[name]
        obj=bpy.data.objects.new(name+' [display]',None)
        obj.instance_type='COLLECTION';obj.instance_collection=entry['collection']
        scene.collection.objects.link(obj)
        obj.location=((i%cols-(cols-1)/2)*3.1,((rows-1)/2-i//cols)*3.4,0)
        text(scene,name.replace('_',' '),(obj.location.x,obj.location.y-1.25,.02),.13)
        if not entry['collection'].asset_data:
            entry['collection'].asset_mark()
        entry['collection'].asset_data.description=entry['description']
        entry['collection'].asset_data.tags.new(entry['category'])
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
    bpy.context.object.data.materials.append(mat('IDAR_preview_floor',(.69,.70,.67)))
    camera(scene,(5,-22,25),(0,0,.3),21.7)
    lighting(scene,22)
    scene.render.resolution_x=3000;scene.render.resolution_y=2450
    scene.cycles.samples=32
    scene.render.filepath=str(p.ROOT/'previews'/'00_asset_library.png')
    scene.frame_set(1)
    return scene
